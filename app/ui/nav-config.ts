/**
 * 앱 셸 내비게이션 구성 (Stage 3-1). 사이드바·글래스 헤더·하단 탭바가 공유하는
 * 단일 소스다. 9개 공간과 하위 탭 라벨은 각 실 layout.tsx의 TABS 배열을 그대로
 * 이관해 하드코딩했다(공개 번들 격리 유지 — lib import 금지). 실 레이아웃의 탭이
 * 바뀌면 이 파일도 함께 갱신해야 한다.
 */

export type SubTab = { href: string; label: string };
export type Space = {
  href: string;
  label: string;
  icon: string;
  tabs?: SubTab[];
};

export const SPACES: Space[] = [
  { href: "/", label: "Edu_Note", icon: "📆" },
  { href: "/today", label: "오늘의 학교", icon: "🗓️" },
  {
    href: "/classroom",
    label: "교실",
    icon: "🏫",
    tabs: [
      { href: "/classroom/plan", label: "수업 계획실" },
      { href: "/classroom/progress", label: "진척도" },
      { href: "/classroom/grades", label: "성적 기록" },
      { href: "/classroom/observations", label: "교과 관찰" },
      { href: "/classroom/report", label: "학생 보고서" },
      { href: "/classroom/setech", label: "세특 작성" },
    ],
  },
  {
    href: "/homeroom",
    label: "담임 교실",
    icon: "🏠",
    tabs: [
      { href: "/homeroom/activities", label: "자율·진로활동" },
      { href: "/homeroom/attendance", label: "출결 관리" },
      { href: "/homeroom/behavior", label: "행동특성 기록" },
      { href: "/homeroom/counsel", label: "상담실" },
      { href: "/homeroom/notice", label: "공지실" },
      { href: "/homeroom/record", label: "생기부 작성" },
    ],
  },
  {
    href: "/clubroom",
    label: "동아리실",
    icon: "🎬",
    tabs: [
      { href: "/clubroom/create", label: "동아리 개설" },
      { href: "/clubroom/assign", label: "부원 배정" },
      { href: "/clubroom/plan", label: "활동 계획" },
      { href: "/clubroom/entry", label: "활동 입력" },
      { href: "/clubroom/record", label: "생기부 작성" },
    ],
  },
  { href: "/setting", label: "세팅실", icon: "⚙️" },
  // 라벨은 페이지 제목·홈 카드와 같아야 한다 — 예전엔 사이드바만 "통계"라
  // 같은 화면을 두 이름으로 부르고 있었다(사용성 개선 P1-5).
  { href: "/stats", label: "통계실", icon: "📊" },
  { href: "/print", label: "인쇄실", icon: "🖨️" },
  { href: "/staffroom", label: "교무실", icon: "🗂️" },
];

/**
 * 후보 href 중 현재 경로에 매칭되는 **가장 긴 하나**를 고른다(최장 prefix 우선).
 * app/ui/tab-nav.tsx의 활성 판정 로직과 동일하다. "/"는 `pathname === "/"`일 때만
 * 매칭되고("//"로는 startsWith 불가) 길이 1이라 더 깊은 매칭이 있으면 밀린다.
 */
export function matchLongestHref(
  pathname: string,
  hrefs: string[],
): string | null {
  let best: string | null = null;
  for (const h of hrefs) {
    const matches = pathname === h || pathname.startsWith(h + "/");
    if (matches && (best === null || h.length > best.length)) {
      best = h;
    }
  }
  return best;
}

/** 현재 경로가 속한 공간의 href(최장 prefix). 없으면 null. */
export function activeSpaceHref(pathname: string): string | null {
  return matchLongestHref(
    pathname,
    SPACES.map((s) => s.href),
  );
}

/**
 * 글래스 헤더용 페이지 제목. 활성 공간의 하위 탭이 매칭되면 그 탭 라벨을, 아니면
 * 공간 라벨을 반환한다. 홈("/")은 "홈"으로 표기한다.
 */
export function pageTitle(pathname: string): string {
  const activeHref = activeSpaceHref(pathname);
  const space = SPACES.find((s) => s.href === activeHref);
  if (!space) return "Edu_Note";
  if (space.href === "/") return "홈";
  if (space.tabs) {
    const subHref = matchLongestHref(
      pathname,
      space.tabs.map((t) => t.href),
    );
    const sub = space.tabs.find((t) => t.href === subHref);
    if (sub) return sub.label;
  }
  return space.label;
}
