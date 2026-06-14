import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listCounselingLogs,
  listCounselSlots,
  listCounselReservations,
} from "@/lib/db/queries";
import { listHomeroomStudents } from "@/lib/db/queries/observations";
import {
  createCounselingAction,
  deleteCounselingAction,
  updateCounselingAction,
  openSlotAction,
  closeSlotAction,
  reserveSlotAction,
  cancelReservationAction,
  getCounselCsvAction,
} from "./actions";
import { CounselCsvPanel } from "./counsel-csv-panel";

export const dynamic = "force-dynamic";

const TARGET_LABEL: Record<string, string> = {
  student: "학생",
  parent: "학부모",
};

/**
 * 상담실 (US-B9, AC-9.2/9.3/9.5).
 * - 상담일지 작성·인라인 수정·삭제
 * - 슬롯 개설/폐쇄·예약 목록
 * - 담임반 학생만(listHomeroomStudents)
 * - 코워크 CSV 내보내기/업로드 패널
 */
export default async function CounselPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const [students, logs, slots, reservations] = await Promise.all([
    listHomeroomStudents(db, ownerId, year),
    listCounselingLogs(db, ownerId),
    listCounselSlots(db, ownerId),
    listCounselReservations(db, ownerId),
  ]);

  const nameById = new Map(students.map((s) => [s.id, s]));

  // 슬롯별 예약 목록 색인
  const reservationsBySlot = new Map<string, typeof reservations>();
  for (const r of reservations) {
    const list = reservationsBySlot.get(r.slotId) ?? [];
    list.push(r);
    reservationsBySlot.set(r.slotId, list);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">상담실 ({year})</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      {/* ── 새 상담일지 ── */}
      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-semibold text-neutral-700">새 상담일지</h2>
        {students.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            먼저{" "}
            <Link href="/students" className="underline">
              학생 명단
            </Link>
            을 임포트하세요.
          </p>
        ) : (
          <form action={createCounselingAction} className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-3">
              <select
                name="studentYearId"
                required
                className="rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sid} {s.name}
                  </option>
                ))}
              </select>
              <select
                name="target"
                defaultValue="student"
                className="rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                <option value="student">학생</option>
                <option value="parent">학부모</option>
              </select>
              <input
                type="date"
                name="date"
                defaultValue={today}
                className="rounded border border-neutral-300 px-2 py-1 text-sm"
              />
            </div>
            <textarea
              name="body"
              required
              rows={4}
              placeholder="상담 내용"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
              상담일지 저장
            </button>
          </form>
        )}
      </section>

      {/* ── AC-9.3: 슬롯 개설 ── */}
      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">
          상담 슬롯 개설
        </h2>
        <form action={openSlotAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500">날짜</label>
            <input
              type="date"
              name="date"
              defaultValue={today}
              required
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500">정원</label>
            <input
              type="number"
              name="capacity"
              defaultValue={1}
              min={1}
              max={30}
              required
              className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </div>
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
            슬롯 개설
          </button>
        </form>

        {/* 슬롯 목록 */}
        {slots.length > 0 && (
          <ul className="mt-4 space-y-2">
            {slots.map((slot) => {
              const slotReservations = reservationsBySlot.get(slot.id) ?? [];
              return (
                <li
                  key={slot.id}
                  className="rounded-lg border border-neutral-200 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{slot.date}</span>
                    <span className="text-xs text-neutral-500">
                      정원 {slot.capacity} · 예약 {slot.reservedCount} · 잔여{" "}
                      {slot.remaining}
                    </span>
                    <form action={closeSlotAction} className="inline">
                      <input type="hidden" name="slotId" value={slot.id} />
                      <button className="text-xs text-red-500 hover:underline">
                        폐쇄
                      </button>
                    </form>
                  </div>

                  {/* 예약 목록 */}
                  {slotReservations.length > 0 && (
                    <ul className="mt-2 space-y-1 pl-2">
                      {slotReservations.map((r) => {
                        const st = nameById.get(r.studentYearId);
                        return (
                          <li
                            key={r.id}
                            className="flex items-center justify-between text-xs text-neutral-600"
                          >
                            <span>
                              {st
                                ? `${st.sid} ${st.name}`
                                : "(미등록 학생)"}
                            </span>
                            <form action={cancelReservationAction} className="inline">
                              <input
                                type="hidden"
                                name="reservationId"
                                value={r.id}
                              />
                              <button className="text-red-400 hover:underline">
                                취소
                              </button>
                            </form>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* 교사 직접 예약 등록 */}
                  {slot.remaining > 0 && students.length > 0 && (
                    <form
                      action={reserveSlotAction}
                      className="mt-2 flex flex-wrap gap-2"
                    >
                      <input type="hidden" name="slotId" value={slot.id} />
                      <select
                        name="studentYearId"
                        className="rounded border border-neutral-300 px-2 py-1 text-xs"
                      >
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.sid} {s.name}
                          </option>
                        ))}
                      </select>
                      <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                        예약 등록
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── AC-9.5: 코워크 CSV 패널 (클라이언트 컴포넌트) ── */}
      <CounselCsvPanel year={year} getCsvAction={getCounselCsvAction} />

      {/* ── 상담 기록 목록 (AC-9.2 인라인 수정 포함) ── */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-700">
          상담 기록 {logs.length}건
        </h2>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            아직 상담 기록이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {logs.map((l) => {
              const st = nameById.get(l.studentYearId);
              return (
                <li
                  key={l.id}
                  className="rounded-lg border border-neutral-200 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {st ? `${st.sid} ${st.name}` : "(이전 연도 학생)"}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-neutral-400">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                        {TARGET_LABEL[l.target]}
                      </span>
                      <span>{l.date}</span>
                      <form action={deleteCounselingAction} className="inline">
                        <input type="hidden" name="id" value={l.id} />
                        <button className="text-red-500 hover:underline">
                          삭제
                        </button>
                      </form>
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-neutral-700">
                    {l.body}
                  </p>

                  {/* AC-9.2: 인라인 수정 폼 */}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-600">
                      수정
                    </summary>
                    <form
                      action={updateCounselingAction}
                      className="mt-2 space-y-2"
                    >
                      <input type="hidden" name="id" value={l.id} />
                      <div className="flex flex-wrap gap-2">
                        <select
                          name="target"
                          defaultValue={l.target}
                          className="rounded border border-neutral-300 px-2 py-1 text-xs"
                        >
                          <option value="student">학생</option>
                          <option value="parent">학부모</option>
                        </select>
                        <input
                          type="date"
                          name="date"
                          defaultValue={l.date}
                          className="rounded border border-neutral-300 px-2 py-1 text-xs"
                        />
                      </div>
                      <textarea
                        name="body"
                        defaultValue={l.body}
                        rows={3}
                        className="w-full rounded border border-neutral-300 px-3 py-2 text-xs"
                      />
                      <button className="rounded bg-neutral-700 px-2 py-1 text-xs text-white hover:bg-neutral-600">
                        저장
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
