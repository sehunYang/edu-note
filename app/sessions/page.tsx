import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listSectionsWithProgress,
  getSectionSessions,
  type SectionProgress,
  type SessionRow,
} from "@/lib/db/queries";
import { GenerateButton } from "./generate-button";
import { setBoundaryAction, setStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  planned: "예정",
  done: "완료",
  not_held: "미진행",
};

/** 시수(차시) 관리 화면 (계획 §4 B). 시험경계 설정 → 차시 생성 → 완료/미진행 마킹. */
export default async function SessionsPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();

  const sections = await listSectionsWithProgress(db, ownerId, year);
  const sessionsBySection = new Map<string, SessionRow[]>();
  await Promise.all(
    sections.map(async (s) => {
      sessionsBySection.set(
        s.sectionId,
        await getSectionSessions(db, ownerId, s.sectionId),
      );
    }),
  );

  // 과목별 그룹
  const bySubject = new Map<string, SectionProgress[]>();
  for (const s of sections) {
    const arr = bySubject.get(s.subjectId) ?? [];
    arr.push(s);
    bySubject.set(s.subjectId, arr);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-normal tracking-tight">시수 관리 ({year})</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <p className="text-xs text-neutral-400">
          과목별 <strong>시험 날짜</strong>를 정하면, 오늘부터 그날까지 시간표·수업일
          기준으로 남은 차시를 계산합니다. (잔여 = 아직 안 한 예정 차시)
        </p>
        <div className="mt-3">
          <GenerateButton />
        </div>
      </section>

      {sections.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-400">
          분반이 없습니다. 먼저{" "}
          <Link href="/timetable" className="underline">
            시간표
          </Link>
          에서 컴시간 동기화를 하세요.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {[...bySubject.values()].map((secs) => {
            const subject = secs[0];
            return (
              <section key={subject.subjectId}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2">
                  <h2 className="font-normal">{subject.subjectName}</h2>
                  <form
                    action={setBoundaryAction}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input type="hidden" name="subjectId" value={subject.subjectId} />
                    <label className="text-xs text-neutral-500">시험 날짜</label>
                    <input
                      type="date"
                      name="date"
                      defaultValue={subject.boundary ?? ""}
                      className="rounded border border-neutral-300 px-2 py-1"
                    />
                    <button className="rounded-full border border-white/25 px-2 py-1 text-xs hover:bg-white/10">
                      저장
                    </button>
                  </form>
                </div>

                <div className="mt-3 space-y-3">
                  {secs.map((sec) => (
                    <SectionBlock
                      key={sec.sectionId}
                      sec={sec}
                      sessions={sessionsBySection.get(sec.sectionId) ?? []}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function SectionBlock({
  sec,
  sessions,
}: {
  sec: SectionProgress;
  sessions: SessionRow[];
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-normal">{sec.label}</span>
        <span className="text-sm">
          <span className="text-neutral-400">잔여</span>{" "}
          <span className="font-normal">{sec.plannedUpToBoundary}</span>차시
          <span className="ml-3 text-neutral-400">완료</span> {sec.done}
          <span className="ml-3 text-neutral-400">미진행</span> {sec.notHeld}
          {sec.boundary === null && (
            <span className="ml-3 text-amber-600">시험 날짜 미설정</span>
          )}
        </span>
      </div>

      {sessions.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-neutral-500">
            차시 {sessions.length}개 보기/표시
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <span className="w-24 text-neutral-500">{s.date}</span>
                <span className="w-12 text-xs text-neutral-400">
                  {STATUS_LABEL[s.status]}
                </span>
                <span className="flex gap-1">
                  {(["done", "not_held", "planned"] as const).map((st) => (
                    <form key={st} action={setStatusAction} className="inline">
                      <input type="hidden" name="sessionId" value={s.id} />
                      <input type="hidden" name="status" value={st} />
                      <button
                        className={`rounded border px-2 py-0.5 text-xs ${
                          s.status === st
                            ? "border-neutral-800 border border-white/25 bg-transparent text-white"
                            : "border-white/25 hover:bg-white/10"
                        }`}
                      >
                        {STATUS_LABEL[st]}
                      </button>
                    </form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
