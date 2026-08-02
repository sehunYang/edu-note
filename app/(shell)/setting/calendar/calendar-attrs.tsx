"use client";
import { useActionState, useState } from "react";
import { Paginator } from "@/lib/ui/paginator";
import { paginate } from "@/lib/db/pagination";
import {
  calendarSyncAction,
  bulkSaveCalendarAction,
  type CalendarSyncState,
  type BulkSaveCalendarState,
} from "../actions";
import type { CalendarEventAttrView } from "@/lib/db/queries";
import type { EventKind } from "@/lib/domain/calendar-keywords";
import {
  EVENT_KIND_LABEL,
  EVENT_KIND_CHIP,
} from "@/lib/domain/event-kind-display";
import { Button } from "@/app/ui/button";

const PAGE_SIZE = 20;

const KINDS = Object.keys(EVENT_KIND_LABEL) as EventKind[];

interface Draft {
  eventKind: EventKind;
  examSemester: string;
  examOrdinal: string;
}

/**
 * QC v2 학사일정 보정 UI (AC-B1~B9). 자동 분류 결과를 표로 보여주고 교사가 7종으로 교정한다.
 * 미분류(self_activity fallback)는 ⚠ 경고 배지. 맨 위 '일괄 저장' 으로 변경을 한 번에 반영
 * (저장 시 needsReview 해제). 보정이 최종 진실원.
 */
export function CalendarAttrs({ events }: { events: CalendarEventAttrView[] }) {
  const [syncState, sync, syncing] = useActionState<CalendarSyncState, FormData>(
    calendarSyncAction,
    null,
  );
  const [saveState, save, saving] = useActionState<
    BulkSaveCalendarState,
    FormData
  >(bulkSaveCalendarAction, null);

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      events.map((e) => [
        e.id,
        {
          eventKind: e.eventKind,
          examSemester: e.examSemester?.toString() ?? "",
          examOrdinal: e.examOrdinal?.toString() ?? "",
        },
      ]),
    ),
  );

  function patch(id: string, p: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  }

  const [page, setPage] = useState(1);
  const {
    pageItems: eventsPage,
    totalPages,
    currentPage,
  } = paginate(events, page, PAGE_SIZE);

  const reviewCount = events.filter((e) => e.needsReview).length;
  const updatesJson = JSON.stringify(
    events.map((e) => {
      const d = drafts[e.id];
      const isExam = d.eventKind === "exam";
      return {
        eventId: e.id,
        eventKind: d.eventKind,
        examSemester: isExam && d.examSemester ? Number(d.examSemester) : null,
        examOrdinal: isExam && d.examOrdinal ? Number(d.examOrdinal) : null,
      };
    }),
  );

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex flex-wrap items-baseline gap-2 text-sm text-neutral-700">
            NEIS 동기화
            <span className="text-xs font-normal text-neutral-400">학사일정 · 급식</span>
          </h3>
          <form action={sync}>
            <Button
              type="submit"
              disabled={syncing}
              className="px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {syncing ? "동기화 중…" : "동기화"}
            </Button>
          </form>
        </div>
        {syncState && syncState.ok && (
          <p role="status" className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
            ✅ 수업일 {syncState.schoolDays}일 · 이벤트 {syncState.events}건 동기화
          </p>
        )}
        {syncState && !syncState.ok && (
          <p role="status" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {syncState.message}
          </p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm text-neutral-700">
            자동 분류 결과 보정 ({events.length}건)
            {reviewCount > 0 && (
              <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                ⚠ 미검토 {reviewCount}
              </span>
            )}
          </h3>
          <form action={save}>
            <input type="hidden" name="updates" value={updatesJson} />
            <Button
              type="submit"
              disabled={saving || events.length === 0}
              className="px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {saving ? "저장 중…" : "일괄 저장"}
            </Button>
          </form>
        </div>
        {saveState && saveState.ok && (
          <p role="status" className="mt-2 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
            ✅ {saveState.count}건 저장 · 경고 해제
          </p>
        )}
        {saveState && !saveState.ok && (
          <p role="status" className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {saveState.message}
          </p>
        )}

        {events.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            학사일정 없음 · 위에서 동기화
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {eventsPage.map((e) => {
              const d = drafts[e.id];
              return (
                <div
                  key={e.id}
                  className="flex flex-col gap-2 rounded border border-neutral-200 px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center"
                >
                  <span className="w-24 shrink-0 text-xs text-neutral-500">
                    {e.date}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] xl:text-xs ${EVENT_KIND_CHIP[d.eventKind]}`}
                    title={`캘린더 색상: ${EVENT_KIND_LABEL[d.eventKind]}`}
                  >
                    {EVENT_KIND_LABEL[d.eventKind]}
                  </span>
                  <span className="w-full break-words sm:min-w-0 sm:w-auto sm:flex-1 sm:truncate">
                    {e.needsReview && (
                      <span className="mr-1 text-amber-600">⚠</span>
                    )}
                    {e.title}
                  </span>
                  <select aria-label="일정 종류"
                    value={d.eventKind}
                    onChange={(ev) =>
                      patch(e.id, { eventKind: ev.target.value as EventKind })
                    }
                    className="w-full rounded border border-neutral-300 px-2 py-1 text-xs sm:w-auto"
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {EVENT_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  {d.eventKind === "exam" && (
                    <>
                      <select aria-label="시험 학기"
                        value={d.examSemester}
                        onChange={(ev) =>
                          patch(e.id, { examSemester: ev.target.value })
                        }
                        className="w-full rounded border border-neutral-300 px-2 py-1 text-xs sm:w-auto"
                      >
                        <option value="">학기?</option>
                        <option value="1">1학기</option>
                        <option value="2">2학기</option>
                      </select>
                      <select aria-label="시험 회차"
                        value={d.examOrdinal}
                        onChange={(ev) =>
                          patch(e.id, { examOrdinal: ev.target.value })
                        }
                        className="w-full rounded border border-neutral-300 px-2 py-1 text-xs sm:w-auto"
                      >
                        <option value="">회차?</option>
                        <option value="1">1차(중간)</option>
                        <option value="2">2차(기말)</option>
                      </select>
                    </>
                  )}
                </div>
              );
            })}
            <Paginator
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              className="mt-3"
            />
          </div>
        )}
      </section>
    </div>
  );
}
