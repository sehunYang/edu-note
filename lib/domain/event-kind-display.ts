/**
 * 학사일정 event_kind 표기(라벨·색상) 단일 정의. 세팅실 보정 UI 와 오늘의학교 월간
 * 캘린더가 공유한다. 색상은 상담(green)·구글(blue)·메모(purple)와 겹치지 않게 배정해
 * 캘린더에서 서로 구분되게 한다.
 */
import type { EventKind } from "./calendar-keywords";

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  exam: "지필평가",
  mock_exam: "수능·모의고사",
  vacation: "방학",
  holiday: "휴업일",
  club: "동아리",
  self_activity: "자율활동",
  career_activity: "진로활동",
  etc: "기타",
};

/**
 * 캘린더 칩 색상(Tailwind). event_kind 별 고유 색. 상담(green)·구글/오늘(blue)·메모(purple)
 * 와 겹치지 않는 hue 만 사용하고, 다크 디자인에서 remap 된 hue 만 쓴다(fuchsia/indigo 등
 * 미remap hue 는 다크에서 밝게 튀므로 회피). 계열끼리 인접 hue 로 묶어 구분+연관을 동시에:
 * 시험류=red/rose, 휴무류=orange/amber, 창체류=violet/cyan/teal.
 */
export const EVENT_KIND_CHIP: Record<EventKind, string> = {
  exam: "bg-red-100 text-red-700", // 지필평가
  mock_exam: "bg-rose-100 text-rose-700", // 수능·모의고사
  vacation: "bg-amber-100 text-amber-800", // 방학
  holiday: "bg-orange-100 text-orange-700", // 휴업일
  club: "bg-violet-100 text-violet-700", // 동아리
  self_activity: "bg-cyan-100 text-cyan-700", // 자율활동
  career_activity: "bg-teal-100 text-teal-700", // 진로활동
  etc: "bg-neutral-200 text-neutral-700", // 기타
};

/** 방학 구간 배경 밴드 색상(칸 배경). 칩 색상보다 옅게. */
export const VACATION_BAND_BG = "bg-amber-50";
