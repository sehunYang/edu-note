import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getTeacherTimetable, getTeacherProfile } from "@/lib/db/queries";
import { SyncForm } from "./sync-form";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["월", "화", "수", "목", "금"];

/** 시간표 화면 (계획 §4 B). 컴시간 동기화 + 주간 시간표 그리드. */
export default async function TimetablePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();

  const [slots, profile] = await Promise.all([
    getTeacherTimetable(db, ownerId, year),
    getTeacherProfile(db, ownerId),
  ]);

  // [weekday][period] → 셀
  const maxPeriod = slots.reduce((m, s) => Math.max(m, s.period), 0);
  const cell = new Map<string, { subjectName: string; label: string }>();
  for (const s of slots) {
    cell.set(`${s.weekday}-${s.period}`, {
      subjectName: s.subjectName,
      label: s.label,
    });
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">시간표 ({year})</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-semibold text-neutral-700">컴시간 동기화</h2>
        <p className="mt-1 text-xs text-neutral-400">
          컴시간알리미에 등록된 학교·교사명으로 본인 시간표를 가져옵니다(읽기 전용).
          {profile?.lastTimetableSyncAt && (
            <>
              {" "}마지막 동기화:{" "}
              {new Date(profile.lastTimetableSyncAt).toLocaleString("ko-KR")}
            </>
          )}
        </p>
        <div className="mt-3">
          <SyncForm
            defaultSchool={profile?.comciganSchool ?? ""}
            defaultTeacher={profile?.comciganTeacher ?? ""}
            year={year}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-700">주간 시간표</h2>
        {slots.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            아직 시간표가 없습니다. 위에서 컴시간 동기화를 실행하세요.
          </p>
        ) : (
          <table className="mt-3 w-full border-collapse text-center text-sm">
            <thead>
              <tr className="text-neutral-400">
                <th className="border border-neutral-200 px-2 py-1 font-medium">
                  교시
                </th>
                {WEEKDAYS.map((w) => (
                  <th
                    key={w}
                    className="border border-neutral-200 px-2 py-1 font-medium"
                  >
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((p) => (
                <tr key={p}>
                  <td className="border border-neutral-200 px-2 py-2 text-neutral-400">
                    {p}
                  </td>
                  {WEEKDAYS.map((_, wi) => {
                    const c = cell.get(`${wi + 1}-${p}`);
                    return (
                      <td
                        key={wi}
                        className="border border-neutral-200 px-2 py-2"
                      >
                        {c ? (
                          <span>
                            <span className="font-medium">{c.subjectName}</span>
                            <br />
                            <span className="text-xs text-neutral-400">
                              {c.label}
                            </span>
                          </span>
                        ) : (
                          <span className="text-neutral-200">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
