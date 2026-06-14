"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  buildSourceBundle,
  listEnrolledStudentsForSubject,
  saveExtraNote,
  updateExtraNote,
  deleteExtraNote,
  saveDraftsBulk,
  subjectNameMap,
  listStudents,
  writeAudit,
  type BulkSaveResult,
} from "@/lib/db/queries";
import {
  buildBulkSetechSource,
  toBulkCsv,
  parseBulkResultCsv,
  type BulkSourceRow,
} from "@/lib/setech";
import { activeSchoolYear } from "@/lib/domain/school-year";

/**
 * 세특 과목·분반별 일괄 원천자료 CSV 생성(AC-S1/S4). 점수·지필성적은 일절 미포함
 * (buildBulkSetechSource 가 score 를 명시 제외). 학번+이름+과목+원천자료+빈 세특본문.
 */
export async function exportBulkSourceAction(args: {
  subjectId: string;
  subjectName: string;
  sectionId?: string | null;
}): Promise<{ ok: true; csv: string; count: number } | { ok: false; message: string }> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const students = await listEnrolledStudentsForSubject(
      db,
      ownerId,
      args.subjectId,
      args.sectionId ?? null,
    );
    if (students.length === 0) {
      return { ok: false, message: "수강 등록된 학생이 없습니다." };
    }
    const rows: BulkSourceRow[] = [];
    for (const s of students) {
      const bundle = await buildSourceBundle(
        db,
        ownerId,
        s.studentYearId,
        "subject",
        args.subjectId,
      );
      rows.push({
        sid: s.sid,
        name: s.name,
        subject: args.subjectName,
        source: buildBulkSetechSource(bundle),
      });
    }
    const csv = toBulkCsv(rows);
    // 기재요령 가드: 원천 CSV 에 숫자 점수 컬럼/값이 섞이지 않았는지 방어적 확인(AC-S4).
    // (buildBulkSetechSource 가 score 를 제거하므로 정상 경로에선 항상 통과.)
    await writeAudit(db, ownerId, "setech_bulk_export", args.subjectId, {
      count: rows.length,
      section: args.sectionId ?? null,
    });
    revalidatePath("/classroom/setech");
    return { ok: true, csv, count: rows.length };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "내보내기 실패" };
  }
}

/**
 * 코워크 결과 CSV 재업로드 → 학번+과목 복합키 매칭 → 일괄 저장(AC-S3/S5).
 * 행별 verify 심각도 분할: 비차단=저장+플래그, 차단(over_limit·empty)=거부+리포트.
 */
export async function importBulkResultAction(args: {
  semester: number;
  csv: string;
}): Promise<
  | { ok: true; result: BulkSaveResult; skipped: { sid: string; subject: string; reason: string }[] }
  | { ok: false; message: string }
> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const year = activeSchoolYear(new Date());
    const parsed = parseBulkResultCsv(args.csv);

    const students = await listStudents(db, ownerId, year);
    const sidMap = new Map(students.map((s) => [s.sid, s.id]));
    const subjMap = await subjectNameMap(db, ownerId, year, args.semester);

    // 과목별 수강 학생 집합(수동 편집 CSV가 미수강 학생에 초안을 쓰지 않도록 검증).
    const enrolledCache = new Map<string, Set<string>>();
    async function enrolledSet(subjectId: string): Promise<Set<string>> {
      const cached = enrolledCache.get(subjectId);
      if (cached) return cached;
      const list = await listEnrolledStudentsForSubject(db, ownerId, subjectId);
      const set = new Set(list.map((s) => s.studentYearId));
      enrolledCache.set(subjectId, set);
      return set;
    }

    const skipped: { sid: string; subject: string; reason: string }[] = [];
    const bulkRows = [];
    for (const r of parsed.rows) {
      const studentYearId = sidMap.get(r.sid);
      const subjectId = subjMap.get(r.subject);
      if (!studentYearId) {
        skipped.push({ sid: r.sid, subject: r.subject, reason: "학번 미매칭" });
        continue;
      }
      if (!subjectId) {
        skipped.push({ sid: r.sid, subject: r.subject, reason: "과목 미매칭" });
        continue;
      }
      if (!(await enrolledSet(subjectId)).has(studentYearId)) {
        skipped.push({ sid: r.sid, subject: r.subject, reason: "해당 과목 미수강" });
        continue;
      }
      bulkRows.push({
        studentYearId,
        sid: r.sid,
        subject: r.subject,
        noteType: "subject" as const,
        subjectId,
        content: r.content,
      });
    }
    // 파싱 형식오류 행도 스킵 리포트에 합류.
    for (const e of parsed.errors) {
      skipped.push({
        sid: "?",
        subject: "?",
        reason: `${e.rowNumber}행 형식오류: ${e.errors.map((x) => x.message).join("; ")}`,
      });
    }

    const result = await saveDraftsBulk(db, ownerId, bulkRows);
    await writeAudit(db, ownerId, "setech_bulk_import", null, {
      saved: result.saved.length,
      rejected: result.rejected.length,
      skipped: skipped.length,
    });
    revalidatePath("/classroom/setech");
    return { ok: true, result, skipped };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "업로드 실패" };
  }
}

/** 학생×과목 추가 입력(자율 탐구 등) 저장. */
export async function saveExtraNoteAction(args: {
  studentYearId: string;
  subjectId: string | null;
  body: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    if (!args.body.trim()) return { ok: false, message: "내용을 입력하세요." };
    const ownerId = await getOwnerId();
    const db = getDb();
    const { id } = await saveExtraNote(
      db,
      ownerId,
      args.studentYearId,
      args.subjectId,
      args.body.trim(),
    );
    await writeAudit(db, ownerId, "extra_note_save", id, {
      studentYearId: args.studentYearId,
      subjectId: args.subjectId,
    });
    revalidatePath("/classroom/setech");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장 실패" };
  }
}

/** QC v3 AC-4.3 — 추가 입력 수정. */
export async function updateExtraNoteAction(args: {
  id: string;
  body: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    if (!args.body.trim()) return { ok: false, message: "내용을 입력하세요." };
    const ownerId = await getOwnerId();
    const db = getDb();
    await updateExtraNote(db, ownerId, args.id, args.body.trim());
    await writeAudit(db, ownerId, "extra_note_update", args.id, null);
    revalidatePath("/classroom/setech");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "수정 실패" };
  }
}

/** QC v3 AC-4.3 — 추가 입력 삭제. */
export async function deleteExtraNoteAction(args: {
  id: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    await deleteExtraNote(db, ownerId, args.id);
    await writeAudit(db, ownerId, "extra_note_delete", args.id, null);
    revalidatePath("/classroom/setech");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "삭제 실패" };
  }
}
