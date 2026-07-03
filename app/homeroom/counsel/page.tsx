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
  approveCancelAction,
  getCounselCsvAction,
} from "./actions";
import { CounselCsvPanel } from "./counsel-csv-panel";
import { CounselSlotList, CounselLogList } from "./counsel-lists-client";
import { Button } from "@/app/ui/button";

export const dynamic = "force-dynamic";

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

  // 학생 라벨 색인(클라이언트 목록에 직렬화 전달용 plain record).
  const studentsById: Record<string, { sid: string; name: string }> = {};
  for (const s of students) studentsById[s.id] = { sid: s.sid, name: s.name };

  // 슬롯별 예약 목록 색인(plain record).
  const reservationsBySlot: Record<string, typeof reservations> = {};
  for (const r of reservations) {
    (reservationsBySlot[r.slotId] ??= []).push(r);
  }

  return (
    <div>
      <h2 className="text-lg font-normal text-neutral-800">상담실 ({year})</h2>

      {/* ── 새 상담일지 ── */}
      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-normal text-neutral-700">새 상담일지</h2>
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
            <Button className="px-3 py-1.5 text-sm">
              상담일지 저장
            </Button>
          </form>
        )}
      </section>

      {/* ── AC-9.3: 슬롯 개설 ── */}
      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="mb-3 text-sm font-normal text-neutral-700">
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
          <Button className="px-3 py-1.5 text-sm">
            슬롯 개설
          </Button>
        </form>

        {/* 슬롯 목록 (10개씩 페이지네이션) */}
        <CounselSlotList
          slots={slots}
          reservationsBySlot={reservationsBySlot}
          studentsById={studentsById}
          students={students.map((s) => ({ id: s.id, sid: s.sid, name: s.name }))}
          closeSlotAction={closeSlotAction}
          reserveSlotAction={reserveSlotAction}
          cancelReservationAction={cancelReservationAction}
          approveCancelAction={approveCancelAction}
        />
      </section>

      {/* ── AC-9.5: 코워크 CSV 패널 (클라이언트 컴포넌트) ── */}
      <CounselCsvPanel year={year} getCsvAction={getCounselCsvAction} />

      {/* ── 상담 기록 목록 (AC-9.2 인라인 수정 포함) ── */}
      <section className="mt-8">
        <h2 className="text-sm font-normal text-neutral-700">
          상담 기록 {logs.length}건
        </h2>
        <CounselLogList
          logs={logs}
          studentsById={studentsById}
          deleteCounselingAction={deleteCounselingAction}
          updateCounselingAction={updateCounselingAction}
        />
      </section>
    </div>
  );
}
