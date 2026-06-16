"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  upsertLessonPlanEntry,
  upsertLessonUnit,
  deleteLessonUnit,
  upsertExamTarget,
  lookupUnitByCode,
  countOrdinalsPerUnit,
  listLessonUnits,
  toggleSlackCell,
  untoggleSlackCell,
  writeAudit,
} from "@/lib/db/queries";
import { parseSixDigit, validateMinOrdinals } from "@/lib/domain/lesson-unit";

/**
 * 수업 계획실 서버액션 (교실 2-2 단계2). getOwnerId 가드 + 페이지범위 revalidate + audit.
 * 핵심개념(keywords)은 콤마/공백 구분 입력을 배열로 정규화한다.
 */
function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((k) => k.replace(/^#/, "").trim())
    .filter((k) => k.length > 0);
}

/* ──────────────────────────────────────────────────────────────────────────
 * 학기계획 단계 — 세부단원 / 시험별 목표진도 (QC v4 US-2)
 * useActionState 호환을 위해 prevState 시그니처(state, formData) 를 쓴다.
 * ──────────────────────────────────────────────────────────────────────── */

export interface PlanActionState {
  ok: boolean;
  error?: string;
}

const OK: PlanActionState = { ok: true };

/** 세부단원 저장(추가/수정). 6자리코드 = 대2+중2+소2 (각 0..99). */
export async function saveLessonUnitAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const ownerId = await getOwnerId();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const majorNo = Number(formData.get("majorNo"));
  const midNo = Number(formData.get("midNo"));
  const minorNo = Number(formData.get("minorNo"));
  const majorName = String(formData.get("majorName") ?? "").trim();
  const midName = String(formData.get("midName") ?? "").trim();
  const minorName = String(formData.get("minorName") ?? "").trim();
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  const minOrdinals = Number(formData.get("minOrdinals")) || 1;

  if (!subjectId) return { ok: false, error: "과목이 필요합니다." };
  if (
    ![majorNo, midNo, minorNo].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 99,
    )
  ) {
    return { ok: false, error: "단원 번호는 0~99 정수여야 합니다." };
  }
  if (!majorName || !midName || !minorName) {
    return { ok: false, error: "대/중/소단원명을 모두 입력하세요." };
  }

  const db = getDb();
  await upsertLessonUnit(db, ownerId, subjectId, {
    majorNo,
    midNo,
    minorNo,
    majorName,
    midName,
    minorName,
    keywords,
    minOrdinals,
  });
  await writeAudit(db, ownerId, "lesson_unit_save", subjectId, {
    majorNo,
    midNo,
    minorNo,
  });
  revalidatePath("/classroom/plan/semester");
  return OK;
}

/** 세부단원 삭제. */
export async function deleteLessonUnitAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const ownerId = await getOwnerId();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const unitId = String(formData.get("unitId") ?? "").trim();
  if (!subjectId || !unitId) return { ok: false, error: "단원이 필요합니다." };

  const db = getDb();
  await deleteLessonUnit(db, ownerId, unitId);
  await writeAudit(db, ownerId, "lesson_unit_delete", subjectId, { unitId });
  revalidatePath("/classroom/plan/semester");
  return OK;
}

/** 시험별 목표진도(소단원 6자리코드 범위 from~to) 저장. 빈 값=null(미설정). */
export async function saveExamTargetAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const ownerId = await getOwnerId();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const examOrdinal = Number(formData.get("examOrdinal"));
  const fromRaw = String(formData.get("fromCode") ?? "").trim();
  const toRaw = String(formData.get("toCode") ?? "").trim();
  if (!subjectId || (examOrdinal !== 1 && examOrdinal !== 2)) {
    return { ok: false, error: "시험 차수가 올바르지 않습니다." };
  }
  const fromCode = fromRaw ? Number(fromRaw) : null;
  const toCode = toRaw ? Number(toRaw) : null;
  // 코드가 입력되었으면 형식 검증(6자리·각 자리 0..99).
  if (fromCode !== null && parseSixDigit(fromCode) === null) {
    return { ok: false, error: "시작 단원 코드 형식이 올바르지 않습니다." };
  }
  if (toCode !== null && parseSixDigit(toCode) === null) {
    return { ok: false, error: "종료 단원 코드 형식이 올바르지 않습니다." };
  }

  const db = getDb();
  await upsertExamTarget(db, ownerId, subjectId, examOrdinal, fromCode, toCode);
  await writeAudit(db, ownerId, "exam_target_save", subjectId, {
    examOrdinal,
    fromCode,
    toCode,
  });
  revalidatePath("/classroom/plan/semester");
  return OK;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 차시계획 단계 — 단원 연결 + 일괄 저장 + 최소차시 초과 검증 (QC v4 US-2)
 * ──────────────────────────────────────────────────────────────────────── */

export interface SessionRowInput {
  ordinal: number;
  content: string;
  keywords: string[];
  /** 6자리 단원 코드(빈/0 = 연결 없음). */
  code: number | null;
}

export interface SessionSaveState {
  ok: boolean;
  error?: string;
  /**
   * 최소차시 초과 단원들(AC-1.8). 비어있지 않으면 저장 보류 — UI 가 확인 모달 후
   * confirmMinOrdinals=true 로 재호출하면 단원 최소차시를 실제 차시 수로 갱신·저장.
   */
  exceededUnits?: { unitId: string; unitName: string; minOrdinals: number; actual: number }[];
}

/**
 * 차시계획 일괄 저장(AC-1.9). 각 행의 6자리 코드를 단원으로 해석(미존재 → 저장 차단,
 * AC-1.6). 저장 후 단원별 실제 차시 수가 최소차시를 초과하면(AC-1.8) exceededUnits 를
 * 돌려주고, confirmMinOrdinals=true 면 단원 최소차시를 실제 수로 갱신한다.
 */
export async function saveSessionPlanBulkAction(payload: {
  subjectId: string;
  rows: SessionRowInput[];
  confirmMinOrdinals?: boolean;
}): Promise<SessionSaveState> {
  const ownerId = await getOwnerId();
  const { subjectId, rows, confirmMinOrdinals } = payload;
  if (!subjectId) return { ok: false, error: "과목이 필요합니다." };

  const db = getDb();

  // 1) 코드 → 단원 해석(미존재 코드는 저장 차단).
  const resolved: { ordinal: number; content: string; keywords: string[]; unitId: string | null }[] = [];
  for (const r of rows) {
    if (!Number.isInteger(r.ordinal) || r.ordinal < 1) continue;
    let unitId: string | null = null;
    if (r.code !== null && r.code > 0) {
      if (parseSixDigit(r.code) === null) {
        return { ok: false, error: `${r.ordinal}차시: 6자리 단원 코드 형식이 올바르지 않습니다.` };
      }
      const unit = await lookupUnitByCode(db, ownerId, subjectId, r.code);
      if (!unit) {
        return { ok: false, error: `${r.ordinal}차시: 존재하지 않는 단원 코드(${r.code})입니다.` };
      }
      unitId = unit.id;
    }
    resolved.push({
      ordinal: r.ordinal,
      content: r.content,
      keywords: r.keywords,
      unitId,
    });
  }

  // 2) 저장.
  for (const r of resolved) {
    await upsertLessonPlanEntry(db, ownerId, subjectId, r.ordinal, {
      content: r.content,
      keywords: r.keywords,
      unitId: r.unitId,
    });
  }

  // 3) 최소차시 초과 검증(AC-1.8).
  const [units, counts] = await Promise.all([
    listLessonUnits(db, ownerId, subjectId),
    countOrdinalsPerUnit(db, ownerId, subjectId),
  ]);
  const exceeded: NonNullable<SessionSaveState["exceededUnits"]> = [];
  for (const u of units) {
    const actual = counts.get(u.id) ?? 0;
    if (validateMinOrdinals(u.minOrdinals, actual).exceeded) {
      exceeded.push({
        unitId: u.id,
        unitName: `${u.majorName} > ${u.midName} > ${u.minorName}`,
        minOrdinals: u.minOrdinals,
        actual,
      });
    }
  }

  if (exceeded.length > 0) {
    if (!confirmMinOrdinals) {
      revalidatePath("/classroom/plan/session");
      return { ok: false, exceededUnits: exceeded };
    }
    // 확인됨 → 단원 최소차시를 실제 차시 수로 갱신.
    for (const e of exceeded) {
      const u = units.find((x) => x.id === e.unitId);
      if (!u) continue;
      await upsertLessonUnit(db, ownerId, subjectId, {
        majorNo: u.majorNo,
        midNo: u.midNo,
        minorNo: u.minorNo,
        majorName: u.majorName,
        midName: u.midName,
        minorName: u.minorName,
        keywords: u.keywords ?? [],
        minOrdinals: e.actual,
      });
    }
  }

  await writeAudit(db, ownerId, "lesson_plan_save", subjectId, {
    bulk: resolved.length,
    confirmedMinOrdinals: confirmMinOrdinals ?? false,
  });
  revalidatePath("/classroom/plan/session");
  return OK as SessionSaveState;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 여유차시(slack) 토글/해제 (QC v5 c1, AC-1.5)
 * ──────────────────────────────────────────────────────────────────────── */

export interface SlackActionState {
  ok: boolean;
  error?: string;
}

/**
 * ordinal k 차시를 여유차시로 등록(시프트). k..끝 내용을 한 칸 뒤로 이관하고 k 를
 * 빈 차시로 만든다. ordinal 은 불변(비-deferrable unique 위반 없음). 슬랙(빈 차시) 한도
 * 초과(마지막 칸에 내용 존재) 시 거부한다.
 */
export async function toggleSlackCellAction(payload: {
  subjectId: string;
  ordinal: number;
}): Promise<SlackActionState> {
  const ownerId = await getOwnerId();
  const { subjectId, ordinal } = payload;
  if (!subjectId || !Number.isInteger(ordinal) || ordinal < 1) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const db = getDb();
  const res = await toggleSlackCell(db, ownerId, subjectId, ordinal);
  if (!res.ok) return { ok: false, error: res.error };
  await writeAudit(db, ownerId, "lesson_plan_slack_toggle", subjectId, {
    ordinal,
    on: true,
  });
  revalidatePath("/classroom/plan/session");
  return { ok: true };
}

/**
 * ordinal k 여유차시 해제(역연산). k+1..끝 내용을 한 칸 앞으로 당겨 복원하고 마지막
 * 칸을 빈 차시로 만든다. ordinal 불변.
 */
export async function untoggleSlackCellAction(payload: {
  subjectId: string;
  ordinal: number;
}): Promise<SlackActionState> {
  const ownerId = await getOwnerId();
  const { subjectId, ordinal } = payload;
  if (!subjectId || !Number.isInteger(ordinal) || ordinal < 1) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const db = getDb();
  const res = await untoggleSlackCell(db, ownerId, subjectId, ordinal);
  if (!res.ok) return { ok: false, error: res.error };
  await writeAudit(db, ownerId, "lesson_plan_slack_toggle", subjectId, {
    ordinal,
    on: false,
  });
  revalidatePath("/classroom/plan/session");
  return { ok: true };
}
