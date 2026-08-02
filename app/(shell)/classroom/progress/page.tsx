import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listSectionsForSemester,
  listProgressPopup,
  getSectionSessions,
  getSectionProgressStats,
} from "@/lib/db/queries";
import { activeSchoolYear, activeSemester } from "@/lib/domain/school-year";
import type { SectionProgressStat } from "@/lib/db/queries/progress";
import {
  ProgressBoard,
  type SectionView,
  type PopupView,
} from "./progress-board";

export const metadata = { title: "진척도" };

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  planned: "예정",
  done: "완료",
  not_held: "미진행",
};

/**
 * 수업 진척도 (교실 2-2 단계3). 활성 학기 분반·차시 + 금주∪연체 팝업을 조립해
 * 클라이언트 보드에 넘긴다. `?semester` 로 수동 전환. /sessions UI 미재사용(전면 신규).
 */
export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string }>;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const now = new Date();
  const year = activeSchoolYear(now);
  const activeSem = activeSemester(now);
  const sp = await searchParams;
  const sem: 1 | 2 =
    sp.semester === "1" ? 1 : sp.semester === "2" ? 2 : activeSem;

  const [sections, popup, stats] = await Promise.all([
    listSectionsForSemester(db, ownerId, year, sem),
    listProgressPopup(db, ownerId, year, sem),
    getSectionProgressStats(db, ownerId, year, sem),
  ]);

  // 분반별 차시 조립(상태만 — 수행체크 기록 폼 제거, AC-2.1).
  const sectionViews: SectionView[] = await Promise.all(
    sections.map(async (sec) => {
      const sessions = await getSectionSessions(db, ownerId, sec.sectionId);
      return {
        sectionId: sec.sectionId,
        label: sec.label,
        subjectId: sec.subjectId,
        subjectName: sec.subjectName,
        sessions: sessions.map((s) => ({
          id: s.id,
          date: s.date,
          status: s.status,
        })),
      };
    }),
  );

  // 팝업 차시에도 기존 기록 첨부(완료 폼 prefill 용).
  const popupViews: PopupView[] = popup.map((p) => ({
    sessionId: p.sessionId,
    sectionId: p.sectionId,
    sectionLabel: p.sectionLabel,
    subjectName: p.subjectName,
    date: p.date,
    overdue: p.overdue,
  }));

  return (
    <div>
      <h2 className="text-base">
        진척도 · {sem}학기
        {sem !== activeSem && (
          <span className="ml-2 text-xs text-neutral-400">(과거/타 학기 조회 중)</span>
        )}
      </h2>
      <p className="mt-0.5 text-xs text-neutral-400">
        학기 전체 차시를 생성하고, 이번주·연체 예정 차시를 예정/미진행/완료로
        처리하세요. 수업내용·핵심개념 기입은{" "}
        <Link href="/classroom/plan/session" className="underline">
          수업 계획실 · 차시 계획
        </Link>
        에서 합니다.
      </p>

      <ProgressBoard
        year={year}
        semester={sem}
        sections={sectionViews}
        popup={popupViews}
        stats={stats satisfies SectionProgressStat[]}
        statusLabel={STATUS_LABEL}
      />
    </div>
  );
}
