"use client";
import { useEffect, useState, useTransition } from "react";
import type { TodayLesson } from "@/lib/db/queries";
import { assignSubjectColors } from "@/lib/domain/subject-colors";
import { toggleTodaySessionAction } from "./actions";

/**
 * 오늘의 학교 "오늘 시간표" 통합 카드 (today-schedule-merge 계획).
 * 기존 "오늘 수업"(체크)과 "오늘 시간표"(교시·시간·색)를 하나로 합쳤다:
 * 행 = 교시 단위(시간표 골격), 각 행에 체크박스 + N차시 + 내용 요약 이식.
 * - 체크는 분반+날짜 단위(class_sessions 유일 진실원, 시수관리 연동)라 같은
 *   분반의 다른 교시 행도 함께 토글된다(낙관 상태가 sectionId 키 — AC-3).
 * - 완료 행 = 흐림+취소선(AC-4). 데스크톱 한 줄/모바일 두 줄(AC-5).
 */

// 교시별 표준 수업 시간(기존 timetable-widget에서 이관). 일반 중·고 기준.
const PERIOD_TIMES: Record<number, string> = {
  1: "09:00",
  2: "10:00",
  3: "11:00",
  4: "12:00",
  5: "13:50",
  6: "14:50",
  7: "15:50",
};

// 과목별 안정 색 — lib/domain/subject-colors 단일 정의(학생 공개 페이지와 공유).

export function TodayScheduleCard({
  lessons,
  date,
  className,
}: {
  lessons: TodayLesson[];
  date: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [doneBySection, setDoneBySection] = useState<Record<string, boolean>>(
    () => Object.fromEntries(lessons.map((l) => [l.sectionId, l.done])),
  );

  // revalidatePath 로 새 lessons 가 들어올 때마다 서버 확정 상태로 재동기화
  // — 서버액션 실패로 낙관 상태가 어긋난 경우 여기서 롤백된다.
  useEffect(() => {
    setDoneBySection(Object.fromEntries(lessons.map((l) => [l.sectionId, l.done])));
  }, [lessons]);

  function handleToggle(sectionId: string, checked: boolean) {
    setDoneBySection((prev) => ({ ...prev, [sectionId]: checked }));
    startTransition(async () => {
      await toggleTodaySessionAction(sectionId, date, checked);
    });
  }

  // 교시별 행으로 펼쳐 교시순 정렬(시간표 골격, AC-2).
  const rows = lessons
    .flatMap((l) => l.periods.map((period) => ({ lesson: l, period })))
    .sort((a, b) => a.period - b.period);

  // 교시순 등장 순서 기준 과목별 안정 색 배정.
  const colorBySubject = assignSubjectColors(rows.map((r) => r.lesson.subjectName));

  return (
    <section className={`rounded-lg border border-neutral-200 p-4 ${className ?? ""}`}>
      <h2 className="text-sm font-normal text-neutral-700">오늘 시간표</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">
          오늘 수업이 없거나 시간표 미동기화.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {rows.map(({ lesson: l, period }) => {
            const done = doneBySection[l.sectionId] ?? l.done;
            const strike = done ? "line-through" : "";
            return (
              <li
                key={`${l.sectionId}-${period}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded border px-2 py-1.5 ${
                  colorBySubject.get(l.subjectName) ?? "border-neutral-200"
                } ${done ? "opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={done}
                  disabled={pending}
                  onChange={(e) => handleToggle(l.sectionId, e.target.checked)}
                  className="h-4 w-4 shrink-0"
                />
                <span className={`w-20 shrink-0 text-xs opacity-70 ${strike}`}>
                  {period}교시
                  {PERIOD_TIMES[period] && (
                    <span className="ml-1">{PERIOD_TIMES[period]}</span>
                  )}
                </span>
                <span className={`font-normal ${strike}`}>
                  {l.subjectName} <span className="opacity-70">{l.label}</span>
                </span>
                {/* 모바일: 둘째 줄(w-full, 체크박스만큼 들여쓰기·줄바꿈 허용) /
                    데스크톱: 같은 줄 잔여 폭에서 truncate (AC-5) */}
                <span
                  className={`w-full pl-7 text-xs opacity-70 md:w-auto md:flex-1 md:truncate md:pl-0 ${strike}`}
                >
                  {l.ordinal}차시 · {l.content ?? "내용 미입력"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
