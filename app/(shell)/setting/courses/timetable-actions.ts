"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import { fetchTimetableBySchool } from "@/lib/integrations/comcigan-client";
import {
  teacherSlots,
  teacherNameMatches,
  weekdayCoverage,
} from "@/lib/integrations/comcigan";
import {
  syncTeacherTimetable,
  upsertTeacherComciganConfig,
  getTeacherSettings,
  decodedToHomeroomSlots,
  replaceHomeroomTimetable,
  detectFixedClasses,
  saveFixedClassSetting,
  listFixedClassSettings,
  writeAudit,
  type DetectedFixedClass,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";

/**
 * 컴시간 시간표 동기화 서버액션 (C5 세팅실로 이관, 읽기전용 외부·비차단).
 * 학교/교사명으로 시간표를 가져와 subjects→course_sections→timetable_slots 로 sync.
 */
export type SyncState =
  | { ok: true; subjects: number; sections: number; slots: number; teacher: string }
  | { ok: false; message: string }
  | null;

export async function syncTimetableAction(
  _prev: SyncState,
  formData: FormData,
): Promise<SyncState> {
  try {
    const ownerId = await getOwnerId();
    const school = String(formData.get("school") ?? "").trim();
    const teacher = String(formData.get("teacher") ?? "").trim();
    const now = new Date();
    const year = activeSchoolYear(now);
    const semester = activeSemester(now);
    if (!school || !teacher) {
      return { ok: false, message: "학교명과 교사명을 입력하세요." };
    }

    const res = await fetchTimetableBySchool(school);
    if (!res.ok) return { ok: false, message: `컴시간 조회 실패: ${res.error}` };

    // 교사 존재 확인은 **교사 명부**로 한다(주 무관). 슬롯 유무로 판정하면 방학 주간에
    // 멀쩡한 이름이 "찾지 못했습니다"로 반려된다.
    const known = res.data.teachers.some(
      (t) => typeof t === "string" && t.length > 0 && teacherNameMatches(t, teacher),
    );
    if (!known) {
      return {
        ok: false,
        message: `'${teacher}' 교사를 찾지 못했습니다. 이름/학교명을 확인하세요.`,
      };
    }

    const db = getDb();
    // ⚠ 학교·교사 설정은 축소 주간 가드보다 **먼저** 저장한다. 가드에 막혀 저장까지 건너뛰면
    // 방학 중 신규 사용자가 comciganSchool 을 영영 못 남기고, 그러면 담임반 동기화까지
    // "학교가 설정되어 있지 않습니다"로 연쇄 차단된다 — 담임반은 원본(자료481) 기반이라
    // 방학에도 안전한데 못 쓰게 되는 건 앞뒤가 안 맞는다.
    await upsertTeacherComciganConfig(db, ownerId, school, teacher, null);

    // 축소 주간 가드: 본인 시간표는 교사별 배열(자료542) = **금주 반영본**이라 방학·시험·
    // 행사 주간엔 요일이 통째로 빈다. 그 상태로 저장하면 정상 시간표(16칸)가 조각(5칸)으로
    // 덮어써지고 시수관리가 무너진다. 전교 기준 월~금이 다 채워진 주에만 허용한다.
    // (공휴일이 낀 주도 막히지만, 그 주로 덮어쓰면 해당 요일이 통째로 사라지므로 의도된 동작.)
    const coverage = weekdayCoverage(res.data.slots);
    if (coverage < 5) {
      return {
        ok: false,
        message:
          `학교·교사 설정은 저장했습니다. 다만 컴시간에 이번 주 수업이 ${coverage}개 요일만 있어 ` +
          `시간표는 반영하지 않았습니다(방학·시험·행사 주간으로 보입니다). 지금 덮어쓰면 기존 ` +
          `시간표가 이번 주 조각으로 바뀝니다. 정상 수업 주간에 다시 눌러 주세요. ` +
          `담임반 시간표 동기화는 원본 기준이라 지금 바로 쓸 수 있습니다.`,
      };
    }

    const slots = teacherSlots(res.data, teacher);
    if (slots.length === 0) {
      return {
        ok: false,
        message: `'${teacher}' 교사의 수업을 찾지 못했습니다. 이름/학교명을 확인하세요.`,
      };
    }

    const sync = await syncTeacherTimetable(db, ownerId, year, semester, slots);
    await upsertTeacherComciganConfig(db, ownerId, school, teacher, new Date());
    await writeAudit(db, ownerId, "sync_comcigan", null, {
      school,
      teacher,
      year,
      ...sync,
    });
    revalidatePath("/setting/courses");
    return { ok: true, teacher, ...sync };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "동기화 실패" };
  }
}

/**
 * 담임반 시간표 컴시간 동기화 서버액션 (QC v4 US-5 AC-5.4 — 공지실에서 세팅실 컴시간
 * 시간표 동기화 섹션으로 이관). 교사 기본설정의 컴시간 학교 + 담임 학년/반으로 학년
 * 시간표를 파싱해 homeroom_timetable_slots 를 교체한다. 공개(학생 안내) 페이지 시간표 소스.
 * 컴시간은 비공식·변동 → 실패 시 throw 하지 않고 안내 메시지(수기 fallback) 반환.
 */
export type HomeroomSyncState =
  | { ok: true; slots: number; grade: number; classNo: number }
  | { ok: false; message: string }
  | null;

export async function syncHomeroomTimetableAction(
  _prev: HomeroomSyncState,
  _formData: FormData,
): Promise<HomeroomSyncState> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const settings = await getTeacherSettings(db, ownerId);

    if (
      !settings?.isHomeroom ||
      settings.homeroomGrade == null ||
      settings.homeroomClassNo == null
    ) {
      return {
        ok: false,
        message: "담임 학년/반이 설정되어 있지 않습니다. 교사 기본설정에서 설정하세요.",
      };
    }
    const school = (settings.comciganSchool ?? "").trim();
    if (!school) {
      return {
        ok: false,
        message:
          "컴시간 학교가 설정되어 있지 않습니다. 위 본인 시간표 동기화를 먼저 하세요.",
      };
    }

    const grade = settings.homeroomGrade;
    const classNo = settings.homeroomClassNo;

    const res = await fetchTimetableBySchool(school);
    if (!res.ok) return { ok: false, message: `컴시간 조회 실패: ${res.error}` };

    let slots;
    try {
      slots = decodedToHomeroomSlots(res.data, grade, classNo);
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "담임반 시간표 파싱 실패",
      };
    }

    const { count } = await replaceHomeroomTimetable(
      db,
      ownerId,
      grade,
      classNo,
      slots,
    );
    await writeAudit(db, ownerId, "sync_comcigan", null, {
      scope: "homeroom_timetable",
      grade,
      classNo,
      slots: count,
    });
    revalidatePath("/setting/courses");
    return { ok: true, slots: count, grade, classNo };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "동기화 실패" };
  }
}

/**
 * 담임반 공통/선택 과목 **자동 감지(미리보기 전용)** 서버액션. 컴시간 교사별 배열(자료542)에서
 * 같은 (요일,교시) 칸에 과목이 여러 개면 선택(이동반), 하나면 공통(고정반)으로 판별한다.
 *
 * ⚠ **저장하지 않는다.** 감지 결과를 교사에게 보여주고, 교사가 확인 후 applyFixedClassesAction
 *   으로 저장한다(리뷰: 미검증 판별로 수동 설정을 조용히 덮어쓰지 않도록 미리보기 게이트).
 * ⚠ 자료542 는 금주 반영본이라 방학·시험·행사 주간엔 칸이 비어 오판한다 → 축소 주간 가드로 거부.
 *
 * 반환:
 *  - detected: 과목별 판정(공통/선택)
 *  - changed:  현재 저장값과 달라지는 과목명(교사가 변경점을 바로 보게)
 *  - unclassified: 담임반 표준(자료481)에는 있는데 이번 주 자료542 에 없어 판별 못 한 과목
 *    (그 주 보강·변경으로 빠진 경우 — 교사가 수동 확인 필요, 저장 시 건드리지 않는다)
 */
export interface AutoDetectPreview {
  subjectName: string;
  isFixed: boolean;
  changed: boolean; // 현재 저장값과 달라지는가(신규 포함)
}
export type AutoDetectState =
  | {
      ok: true;
      phase: "preview";
      detected: AutoDetectPreview[];
      unclassified: string[];
      grade: number;
      classNo: number;
    }
  | { ok: false; message: string }
  | null;

export async function autoDetectFixedClassesAction(
  _prev: AutoDetectState,
  _formData: FormData,
): Promise<AutoDetectState> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const settings = await getTeacherSettings(db, ownerId);

    if (
      !settings?.isHomeroom ||
      settings.homeroomGrade == null ||
      settings.homeroomClassNo == null
    ) {
      return {
        ok: false,
        message: "담임 학년/반이 설정되어 있지 않습니다. 교사 기본설정에서 설정하세요.",
      };
    }
    const school = (settings.comciganSchool ?? "").trim();
    if (!school) {
      return {
        ok: false,
        message:
          "컴시간 학교가 설정되어 있지 않습니다. 위 본인 시간표 동기화를 먼저 하세요.",
      };
    }

    const grade = settings.homeroomGrade;
    const classNo = settings.homeroomClassNo;

    const res = await fetchTimetableBySchool(school);
    if (!res.ok) return { ok: false, message: `컴시간 조회 실패: ${res.error}` };

    // 축소 주간 가드: 자료542 는 금주 반영본이라 방학·시험 주간엔 칸이 비어 오판한다.
    // 단, 신형(동시그룹+학급별 원본) 경로는 금주 편성과 무관하게 정확하므로 가드 불필요.
    const hasStructuralDetection =
      res.data.simultaneousGroups.length > 0 && res.data.classSlots.length > 0;
    const coverage = weekdayCoverage(res.data.slots);
    if (!hasStructuralDetection && coverage < 5) {
      return {
        ok: false,
        message:
          `컴시간에 이번 주 수업이 ${coverage}개 요일만 있습니다(방학·시험·행사 주간으로 보입니다). ` +
          `공통/선택 자동 감지는 정상 수업 주간의 편성이 필요합니다. 개학 후(정상 주간) 다시 시도하세요.`,
      };
    }

    const detected = detectFixedClasses(res.data, grade, classNo);
    if (detected.length === 0) {
      return {
        ok: false,
        message: `${grade}학년 ${classNo}반 과목을 찾지 못했습니다(컴시간 구조 변경 가능).`,
      };
    }

    // 현재 저장값과 비교해 변경점 표시(교사가 무엇이 바뀌는지 보게).
    const current = await listFixedClassSettings(db, ownerId, grade);
    const currentByName = new Map(
      current
        .filter((r) => r.classNo === classNo)
        .map((r) => [r.subjectName, r.isFixed]),
    );
    const preview: AutoDetectPreview[] = detected.map((d) => ({
      subjectName: d.subjectName,
      isFixed: d.isFixed,
      changed: currentByName.get(d.subjectName) !== d.isFixed,
    }));

    // 표준(자료481) 담임반 과목 중 자료542 에 없어 판별 못 한 과목(그 주 보강·변경으로 빠짐).
    const detectedNames = new Set(detected.map((d) => d.subjectName));
    const classSubjects = new Set(
      res.data.classSlots
        .filter((s) => s.grade === grade && s.classNo === classNo)
        .map((s) => s.subject),
    );
    const unclassified = [...classSubjects]
      .filter((s) => !detectedNames.has(s))
      .sort((a, b) => a.localeCompare(b));

    return {
      ok: true,
      phase: "preview",
      detected: preview,
      unclassified,
      grade,
      classNo,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "자동 감지 실패" };
  }
}

/**
 * 자동 감지 미리보기를 교사가 확인한 뒤 **실제 저장**하는 액션. formData.detected 에 감지 결과
 * JSON([{subjectName,isFixed}])을 담아 넘긴다. 담임 반은 서버가 settings 로 다시 확정하고,
 * 저장은 트랜잭션으로 all-or-nothing(부분 쓰기 방지). fixed_class_settings 는 표시 전용이라
 * 값 조작의 영향 범위는 자기 학생 페이지의 공통/선택 구분에 한정된다.
 */
export type ApplyFixedState =
  | { ok: true; fixed: number; elective: number; grade: number; classNo: number }
  | { ok: false; message: string }
  | null;

export async function applyFixedClassesAction(
  _prev: ApplyFixedState,
  formData: FormData,
): Promise<ApplyFixedState> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const settings = await getTeacherSettings(db, ownerId);
    if (
      !settings?.isHomeroom ||
      settings.homeroomGrade == null ||
      settings.homeroomClassNo == null
    ) {
      return { ok: false, message: "담임 학년/반이 설정되어 있지 않습니다." };
    }
    const grade = settings.homeroomGrade;
    const classNo = settings.homeroomClassNo;

    // 미리보기에서 넘어온 감지 결과 파싱·검증(형식 불량은 거부).
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(formData.get("detected") ?? "[]"));
    } catch {
      return { ok: false, message: "감지 결과 형식이 올바르지 않습니다. 다시 감지하세요." };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { ok: false, message: "적용할 감지 결과가 없습니다. 다시 감지하세요." };
    }
    const items: DetectedFixedClass[] = [];
    for (const p of parsed) {
      if (
        typeof p === "object" &&
        p !== null &&
        typeof (p as Record<string, unknown>).subjectName === "string" &&
        typeof (p as Record<string, unknown>).isFixed === "boolean"
      ) {
        const r = p as { subjectName: string; isFixed: boolean };
        if (r.subjectName.trim()) items.push({ subjectName: r.subjectName, isFixed: r.isFixed });
      }
    }
    if (items.length === 0) {
      return { ok: false, message: "유효한 감지 결과가 없습니다. 다시 감지하세요." };
    }

    // 트랜잭션으로 all-or-nothing(중간 실패 시 부분 쓰기 방지).
    await db.transaction(async (tx) => {
      for (const d of items) {
        await saveFixedClassSetting(tx, ownerId, grade, classNo, d.subjectName, d.isFixed);
      }
    });
    const fixed = items.filter((d) => d.isFixed).length;
    await writeAudit(db, ownerId, "sync_comcigan", null, {
      scope: "auto_detect_fixed",
      grade,
      classNo,
      fixed,
      elective: items.length - fixed,
    });
    revalidatePath("/setting/courses");
    return { ok: true, fixed, elective: items.length - fixed, grade, classNo };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "적용 실패" };
  }
}
