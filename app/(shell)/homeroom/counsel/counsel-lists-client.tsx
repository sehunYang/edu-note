"use client";
import { useState } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import type {
  CounselingRow,
  CounselSlotRow,
  CounselReservationRow,
} from "@/lib/db/queries";
import { Button } from "@/app/ui/button";
import { ConfirmButton } from "@/app/ui/confirm-button";

/**
 * 상담실 목록 클라이언트 (QC v4 US-8, AC-8.2). 서버 컴포넌트의 슬롯·상담기록
 * 목록을 10개씩 번호식 페이지네이션으로 감싼다. 서버액션은 props 로 주입받아
 * 각 행의 폼이 그대로 사용한다(기존 동작·정렬 유지, 페이지만 분할).
 */

const PAGE_SIZE = 10;

type FormAction = (formData: FormData) => void | Promise<void>;

interface StudentOption {
  id: string;
  sid: string;
  name: string;
}

const TARGET_LABEL: Record<string, string> = {
  student: "학생",
  parent: "학부모",
};

/** 상담 슬롯 목록(예약 목록 + 직접 예약 등록 포함). */
export function CounselSlotList({
  slots,
  reservationsBySlot,
  studentsById,
  students,
  closeSlotAction,
  reserveSlotAction,
  cancelReservationAction,
  approveCancelAction,
}: {
  slots: CounselSlotRow[];
  reservationsBySlot: Record<string, CounselReservationRow[]>;
  studentsById: Record<string, { sid: string; name: string }>;
  students: StudentOption[];
  closeSlotAction: FormAction;
  reserveSlotAction: FormAction;
  cancelReservationAction: FormAction;
  approveCancelAction: FormAction;
}) {
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(
    slots,
    page,
    PAGE_SIZE,
  );

  if (slots.length === 0) return null;

  return (
    <>
      <ul className="mt-4 space-y-2">
        {pageItems.map((slot) => {
          const slotReservations = reservationsBySlot[slot.id] ?? [];
          return (
            <li
              key={slot.id}
              className="rounded-lg border border-neutral-200 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-normal">{slot.date}</span>
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
                    const st = studentsById[r.studentYearId];
                    return (
                      <li
                        key={r.id}
                        className="flex items-center justify-between text-xs text-neutral-600"
                      >
                        <span className="flex items-center gap-1.5">
                          {st ? `${st.sid} ${st.name}` : "(미등록 학생)"}
                          {r.cancelRequested && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                              취소 요청
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          {r.cancelRequested && (
                            <form action={approveCancelAction} className="inline">
                              <input
                                type="hidden"
                                name="reservationId"
                                value={r.id}
                              />
                              <button className="text-amber-600 hover:underline">
                                취소 승인
                              </button>
                            </form>
                          )}
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
                        </span>
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
                  <select aria-label="학생"
                    name="studentYearId"
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sid} {s.name}
                      </option>
                    ))}
                  </select>
                  <Button className="px-2 py-1 text-xs">
                    예약 등록
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <Paginator
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        className="mt-3"
      />
    </>
  );
}

/** 상담 기록 목록(인라인 수정·삭제 포함). */
export function CounselLogList({
  logs,
  studentsById,
  deleteCounselingAction,
  updateCounselingAction,
}: {
  logs: CounselingRow[];
  studentsById: Record<string, { sid: string; name: string }>;
  deleteCounselingAction: FormAction;
  updateCounselingAction: FormAction;
}) {
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, currentPage } = paginate(
    logs,
    page,
    PAGE_SIZE,
  );

  if (logs.length === 0) {
    return (
      <p className="mt-3 text-sm text-neutral-400">아직 상담 기록이 없습니다.</p>
    );
  }

  return (
    <>
      <ul className="mt-3 space-y-2">
        {pageItems.map((l) => {
          const st = studentsById[l.studentYearId];
          return (
            <li
              key={l.id}
              className="rounded-lg border border-neutral-200 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-normal">
                  {st ? `${st.sid} ${st.name}` : "(이전 연도 학생)"}
                </span>
                <span className="flex items-center gap-2 text-xs text-neutral-400">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                    {TARGET_LABEL[l.target]}
                  </span>
                  <span>{l.date}</span>
                  <form action={deleteCounselingAction} className="inline">
                    <input type="hidden" name="id" value={l.id} />
                    <ConfirmButton
                      message="이 상담 일지를 삭제할까요? 되돌릴 수 없습니다."
                      className="text-red-500 hover:underline"
                    >
                      삭제
                    </ConfirmButton>
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
                    <select aria-label="상담 대상"
                      name="target"
                      defaultValue={l.target}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs"
                    >
                      <option value="student">학생</option>
                      <option value="parent">학부모</option>
                    </select>
                    <input aria-label="상담일"
                      type="date"
                      name="date"
                      defaultValue={l.date}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </div>
                  <textarea aria-label="상담 내용"
                    name="body"
                    defaultValue={l.body}
                    rows={3}
                    className="w-full rounded border border-neutral-300 px-3 py-2 text-xs"
                  />
                  <Button className="px-2 py-1 text-xs">
                    저장
                  </Button>
                </form>
              </details>
            </li>
          );
        })}
      </ul>
      <Paginator
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        className="mt-3"
      />
    </>
  );
}
