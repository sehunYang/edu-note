"use client";
import { useEffect, useState, useTransition } from "react";
import type { TodayLesson } from "@/lib/db/queries";
import { toggleTodaySessionAction } from "./actions";

/**
 * 오늘의 학교 "오늘 수업" 카드 (QC v7 comp1, AC-1.1~1.4). 오늘 시간표에 걸린
 * 분반별로 교시·수업명·차시번호·차시내용·체크박스를 나열한다. 체크는
 * useTransition으로 낙관적 토글 후 서버액션이 class_sessions.status를
 * upsert한다(R3 — 실패 시 revalidate로 서버 상태 재수화).
 */
export function TodayLessonsCard({
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

  return (
    <section className={`rounded-lg border border-neutral-200 p-4 ${className ?? ""}`}>
      <h2 className="text-sm font-normal text-neutral-700">오늘 수업</h2>
      {lessons.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">오늘 수업이 없습니다.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {lessons.map((l) => (
            <li
              key={l.sectionId}
              className="flex items-center gap-3 rounded border border-neutral-200 px-2 py-1.5"
            >
              <input
                type="checkbox"
                checked={doneBySection[l.sectionId] ?? l.done}
                disabled={pending}
                onChange={(e) => handleToggle(l.sectionId, e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span className="w-16 shrink-0 text-xs opacity-70">
                {l.periods.join("·")}교시
              </span>
              <span className="font-normal">
                {l.subjectName} <span className="opacity-70">{l.label}</span>
              </span>
              <span className="text-xs opacity-70">{l.ordinal}차시</span>
              <span className="truncate text-neutral-500">
                {l.content ?? "내용 미입력"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
