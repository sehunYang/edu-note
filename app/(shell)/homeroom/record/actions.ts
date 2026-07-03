"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  collectRecordSources,
  saveHomeroomRecordDraft,
  writeAudit,
  type HomeroomRecordArea,
} from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { parseCsvRecords } from "@/lib/csv/parse";

/** 영역 → 한글 라벨 + 원천 배열 키. */
const AREA_LABEL: Record<HomeroomRecordArea, string> = {
  autonomy: "자율활동",
  career: "진로활동",
  behavior: "행동발달 및 특기사항",
};

/** CSV 셀 이스케이프(콤마·따옴표·줄바꿈 시 따옴표로 감싸고 `"`→`""`). */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * AC-11.1 — 영역별 원천자료 CSV 생성. 컬럼: 학번,이름,영역,원천자료,생기부본문(빈칸).
 * 담임반 학생 전원의 해당 영역 원천을 한 덩어리 텍스트로 합쳐 내보낸다(코워크 작성용).
 */
export async function exportRecordSourceAction(args: {
  area: HomeroomRecordArea;
}): Promise<{ ok: true; csv: string; count: number } | { ok: false; message: string }> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const year = activeSchoolYear(new Date());
    const sources = await collectRecordSources(db, ownerId, year);
    if (sources.length === 0) {
      return { ok: false, message: "담임반 학생이 없습니다." };
    }
    const label = AREA_LABEL[args.area];
    const header = ["학번", "이름", "영역", "원천자료", "생기부본문"];
    const lines = [header.map(csvCell).join(",")];
    for (const s of sources) {
      const bodies = s[args.area];
      const source = bodies.map((b) => `- ${b}`).join("\n");
      lines.push(
        [s.sid, s.name, label, source, ""].map(csvCell).join(","),
      );
    }
    await writeAudit(db, ownerId, "homeroom_record_save", null, {
      phase: "export",
      area: args.area,
      count: sources.length,
    });
    revalidatePath("/homeroom/record");
    return { ok: true, csv: lines.join("\n"), count: sources.length };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "내보내기 실패" };
  }
}

/**
 * AC-11.2 — 코워크 결과 CSV 업로드 → 학번 매칭 → 영역별 초안 저장.
 * 컬럼: 학번 + 생기부본문(별칭 허용). 미매칭·빈본문·바이트초과는 스킵 리포트.
 */
export async function importRecordResultAction(args: {
  area: HomeroomRecordArea;
  csv: string;
}): Promise<
  | { ok: true; saved: number; skipped: { sid: string; reason: string }[] }
  | { ok: false; message: string }
> {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const year = activeSchoolYear(new Date());
    const sources = await collectRecordSources(db, ownerId, year);
    const sidMap = new Map(sources.map((s) => [s.sid, s.studentYearId]));

    const { headers, records } = parseCsvRecords(args.csv);
    const sidCol = ["학번"].find((h) => headers.includes(h)) ?? null;
    const contentCol =
      ["생기부본문", "본문", "특기사항", "내용"].find((h) =>
        headers.includes(h),
      ) ?? null;
    if (!sidCol || !contentCol) {
      return { ok: false, message: "필수 헤더(학번, 생기부본문)가 없습니다." };
    }

    const skipped: { sid: string; reason: string }[] = [];
    let saved = 0;
    for (const rec of records) {
      const sid = (rec.values[sidCol] ?? "").trim();
      const content = (rec.values[contentCol] ?? "").trim();
      const studentYearId = sidMap.get(sid);
      if (!studentYearId) {
        skipped.push({ sid: sid || "?", reason: "학번 미매칭(담임반 아님)" });
        continue;
      }
      if (!content) {
        skipped.push({ sid, reason: "본문 비어 있음" });
        continue;
      }
      try {
        await saveHomeroomRecordDraft(db, ownerId, studentYearId, args.area, content);
        saved += 1;
      } catch (err) {
        skipped.push({
          sid,
          reason: err instanceof Error ? err.message : "저장 실패",
        });
      }
    }

    await writeAudit(db, ownerId, "homeroom_record_save", null, {
      phase: "import",
      area: args.area,
      saved,
      skipped: skipped.length,
    });
    revalidatePath("/homeroom/record");
    return { ok: true, saved, skipped };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "업로드 실패" };
  }
}
