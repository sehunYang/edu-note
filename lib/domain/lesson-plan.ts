/**
 * 수업 계획실 도메인 (교실 2-2 단계2). 순수 함수(네트워크·DB 없음).
 *
 * 차시 N = 학기 범위의 수업일(school_day_calendar) 중 과목 시간표 슬롯 요일에
 * 해당하는 날짜 수. 요일 판정은 sessions.ts 차시 엔진과 동일한 UTC 규약을 쓴다
 * (`new Date(date+"T00:00:00Z").getUTCDay()`, 0=일..6=토). 결정론·타임존 무관.
 */

/** 날짜 문자열(YYYY-MM-DD)의 요일. 0=일 .. 6=토 (sessions.ts와 동일 규약). */
export function weekdayOf(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

/**
 * 차시 N 산출. 수업일 목록 중 요일이 슬롯 요일 집합에 속하는 날짜 수.
 *
 * 규약: sessions.ts 차시 엔진과 동일하게 timetableSlots.weekday 값을 그대로
 * weekdayOf(getUTCDay) 결과와 비교한다. 월~금은 두 규약(1=월..5=금)이 일치하므로
 * 실제 수업 슬롯에서 정확하다(일요일만 7 vs 0 으로 갈리나 수업 슬롯 부재).
 */
export function computePlanLength(
  schoolDays: { date: string }[],
  slotWeekdays: Set<number>,
): number {
  if (slotWeekdays.size === 0) return 0;
  let n = 0;
  for (const { date } of schoolDays) {
    if (slotWeekdays.has(weekdayOf(date))) n += 1;
  }
  return n;
}

/** 한 분반의 시간표 슬롯 요일 목록(중복 가능 — 슬롯 수 = 주당 시수). */
export interface SectionSlots {
  sectionId: string;
  /** timetableSlots.weekday 값들(슬롯당 1개, 같은 요일 복수 슬롯이면 중복 포함). */
  weekdays: number[];
}

/**
 * QC v3 AC-1.1/1.2 — 차시 N 의 **대표 분반** 선정. 같은 과목 분반들은 동일 시수를
 * 진행하므로(분반 무관), 주당 슬롯 수(=시수)가 **최대**인 분반 하나의 요일 집합을 쓴다.
 * 기존 버그(분반 요일 UNION)는 분반이 많을수록 커버리지가 부풀어 N 이 과대(물리=97).
 * 동률이면 입력 순서상 첫 분반(결정론). 빈 입력이면 빈 Set.
 */
export function pickRepresentativeSection(
  sections: SectionSlots[],
): Set<number> {
  let best: SectionSlots | null = null;
  for (const s of sections) {
    if (best === null || s.weekdays.length > best.weekdays.length) best = s;
  }
  return new Set(best?.weekdays ?? []);
}

/**
 * QC v3 AC-1.3 — 대표 분반의 수업일(차시) 날짜를 오름차순으로. ordinal k 의 날짜 =
 * 반환 배열[k-1]. 월/주차·시험마커 산출에 사용.
 */
export function representativeDates(
  schoolDays: { date: string }[],
  weekdays: Set<number>,
): string[] {
  if (weekdays.size === 0) return [];
  return schoolDays
    .filter((d) => weekdays.has(weekdayOf(d.date)))
    .map((d) => d.date)
    .sort();
}

/**
 * QC v3 AC-1.3 — 날짜의 '월/주차' 라벨(대략적 시기). weekOfMonth 는 달 안에서의
 * 주차로 floor((일-1)/7)+1 (1~5). 결정론·타임존 무관(UTC 파싱).
 */
export function monthWeekLabel(date: string): { month: number; weekOfMonth: number } {
  const d = new Date(date + "T00:00:00Z");
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return { month, weekOfMonth: Math.floor((day - 1) / 7) + 1 };
}

/* ──────────────────────────────────────────────────────────────────────────
 * QC v5 c1/c2 — 여유차시(slack) 시프트 도메인. 순수 함수(DB·네트워크 없음).
 *
 * 여유차시 = 내용 없는 빈 차시. ordinal 은 보존하되 unitId/content 가 모두 null 인
 * 차시를 "여유차시(slack)"로 간주한다. 이 predicate 는 **1곳 정의·공용**으로,
 *  - c1 "여유차시로 등록" 토글(시프트/해제)이 빈 차시를 만들고,
 *  - c2 진척도 last-done-unit 도출이 빈 차시를 건너뛴다.
 * ──────────────────────────────────────────────────────────────────────── */

/** 시프트 대상이 되는 차시 내용 셀(ordinal 무관, 내용 필드만). */
export interface PlanCell {
  unitId: string | null;
  content: string | null;
  keywords: string[] | null;
}

/** ordinal 을 가진 차시 셀(시프트 입출력 단위). */
export interface PlanSlot extends PlanCell {
  ordinal: number;
}

/**
 * 여유차시(slack) 판정(M2 — 이 1곳이 유일 정의). unitId·content 둘 다 null 이면
 * 내용 없는 빈(여유) 차시다. keywords 는 판정에 쓰지 않는다(빈 차시는 내용 기준).
 * c1 시프트(빈 차시 생성)와 c2 도출(빈 차시 제외)이 동일 기준을 공유한다.
 */
export function isSlackCell(plan: PlanCell): boolean {
  return plan.unitId == null && plan.content == null;
}

/** 빈 셀(여유차시) 1개. 시프트 시 비워진 칸을 채운다. */
function emptyCell(): PlanCell {
  return { unitId: null, content: null, keywords: null };
}

/**
 * "여유차시로 등록" 토글 — 순수 시프트(AC-1.5). ordinal `k` 부터 끝까지
 * {unitId,content,keywords} 를 한 칸씩 뒤로 이관하고, ordinal k 칸을 빈(여유)
 * 차시로 만든다. ordinal 자체는 1..N 으로 보존(연속). 마지막 칸의 기존 내용은
 * 밀려나므로, 호출 측이 슬랙 한도(빈 차시 예약 수) 안에서만 허용해야 한다.
 *
 * 입력 plans 는 ordinal 1..N 연속(빈 차시는 빈 셀로 포함)을 가정한다. 반환은
 * 동일 길이·동일 ordinal 의 새 배열(원본 불변). DB 반영 순서는 쿼리 계층 책임.
 */
export function shiftSlackCell(plans: PlanSlot[], k: number): PlanSlot[] {
  const sorted = [...plans].sort((a, b) => a.ordinal - b.ordinal);
  const cells: PlanCell[] = sorted.map((p) => ({
    unitId: p.unitId,
    content: p.content,
    keywords: p.keywords,
  }));
  const idx = sorted.findIndex((p) => p.ordinal === k);
  if (idx < 0) return sorted;
  // idx 부터 끝까지 한 칸 뒤로 이관(마지막 셀은 범위 밖으로 탈락), idx 는 빈 셀.
  for (let i = cells.length - 1; i > idx; i--) {
    cells[i] = cells[i - 1];
  }
  cells[idx] = emptyCell();
  return sorted.map((p, i) => ({ ordinal: p.ordinal, ...cells[i] }));
}

/**
 * 토글 해제 — `shiftSlackCell` 역연산(AC-1.5). ordinal k 의 빈(여유) 차시를 없애고
 * k+1..N 내용을 한 칸씩 앞으로 당겨 원위치 복원한다(마지막 칸은 빈 셀). 토글→해제
 * 시 (탈락 셀이 없었다면) 원본과 동일하다. 원본 불변, 동일 길이/ordinal 반환.
 */
export function unshiftSlackCell(plans: PlanSlot[], k: number): PlanSlot[] {
  const sorted = [...plans].sort((a, b) => a.ordinal - b.ordinal);
  const cells: PlanCell[] = sorted.map((p) => ({
    unitId: p.unitId,
    content: p.content,
    keywords: p.keywords,
  }));
  const idx = sorted.findIndex((p) => p.ordinal === k);
  if (idx < 0) return sorted;
  // idx 부터 끝-1 까지 다음 셀을 당겨오고, 마지막 셀은 빈 셀.
  for (let i = idx; i < cells.length - 1; i++) {
    cells[i] = cells[i + 1];
  }
  cells[cells.length - 1] = emptyCell();
  return sorted.map((p, i) => ({ ordinal: p.ordinal, ...cells[i] }));
}
