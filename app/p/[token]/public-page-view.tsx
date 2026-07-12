"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PublicPagePayload } from "@/lib/public";
import { HomeTab } from "./_components/home-tab";
import { ScheduleTab } from "./_components/schedule-tab";
import { TimetableTab } from "./_components/timetable-tab";
import { RecordsTab } from "./_components/records-tab";
import { TabBar, type TabId } from "./_components/tab-bar";

const VALID_TABS: TabId[] = ["home", "schedule", "timetable", "records"];

function normalizeTab(value: string | null): TabId {
  return (VALID_TABS as string[]).includes(value ?? "") ? (value as TabId) : "home";
}

/**
 * 공개 학생 안내 페이지 클라이언트 뷰 (public-page-mobile-v2). 4탭 셸(홈/일정/시간표/
 * 나의기록) — 탭 상태는 `useState`(source of truth) + 초기값 `useSearchParams()` +
 * 변경 시 `history.replaceState`로 URL만 동기화한다. 이 페이지는 `force-dynamic`
 * (page.tsx)이라 `router.replace`를 쓰면 탭 전환마다 RSC 페이로드가 재요청된다 —
 * 그 재페치를 피하려고 History API를 직접 쓴다.
 *
 * 모든 데이터는 allowlist DTO(get_public_page → parsePublicPagePayload) 로 사전집계된 값.
 * 쓰기(선택과목 자가매핑·상담신청·메모 CRUD 등)는 토큰 스코프 서버액션으로만 수행한다.
 */
export function PublicPageView({
  token,
  payload,
}: {
  token: string;
  payload: PublicPagePayload;
}) {
  const search = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => normalizeTab(search.get("tab")));

  function selectTab(next: TabId) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-6">
      <header>
        <h1 className="text-2xl font-normal tracking-tight">
          {payload.studentName ? `${payload.studentName} 학생 안내 페이지` : "학생 안내 페이지"}
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          이 페이지의 링크는 외부에 공유하지 마세요.
        </p>
      </header>

      <div key={tab} className="mt-6 animate-fade-in-up space-y-4">
        {tab === "home" && (
          <HomeTab
            token={token}
            payload={payload}
            onNavigateTimetable={() => selectTab("timetable")}
            onNavigateSchedule={() => selectTab("schedule")}
          />
        )}
        {tab === "schedule" && (
          <ScheduleTab
            token={token}
            todos={payload.weekTodos}
            memos={payload.studentMemos}
            vacationSpans={payload.vacationSpans}
          />
        )}
        {tab === "timetable" && (
          <TimetableTab token={token} slots={payload.timetable} meals={payload.meals} />
        )}
        {tab === "records" && (
          <RecordsTab
            token={token}
            matrix={payload.attendance2D}
            records={payload.attendanceDetail}
            counselSlots={payload.counselSlots}
          />
        )}
      </div>

      <TabBar active={tab} onSelect={selectTab} />
    </div>
  );
}
