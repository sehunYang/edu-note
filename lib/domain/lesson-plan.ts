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

/**
 * 주어진 날짜와 같은 월·주차에 배치된 첫 차시 번호(없으면 null).
 *
 * 차시 계획은 한 과목이 50차시를 넘어 10개씩 페이지네이션된다. "다음 수업을
 * 계획한다"는 흔한 작업에서 매번 페이지를 훑지 않도록, 오늘이 속한 주차의
 * 차시로 바로 이동시키기 위한 조회다.
 */
export function ordinalForWeekOf(
  ordinals: { ordinal: number; month: number; weekOfMonth: number }[],
  date: string,
): number | null {
  const { month, weekOfMonth } = monthWeekLabel(date);
  const hit = ordinals
    .filter((o) => o.month === month && o.weekOfMonth === weekOfMonth)
    .sort((a, b) => a.ordinal - b.ordinal)[0];
  return hit ? hit.ordinal : null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * QC v6 US-1 — 시험 구간(1=중간 전 / 2=기말 전) 차시 도메인. 순수 함수(DB·네트워크 없음).
 * ──────────────────────────────────────────────────────────────────────── */

/** 세부단원 최소차시 합산용 입력(minOrdinals 만 사용). */
export interface UnitOrdinal {
  minOrdinals: number;
}

/**
 * AC-1.2 — 세부단원 최소차시(minOrdinals) 합 = 차시계획 총 차시 수(결정·표시용).
 * 음수/비정수는 0 으로 무시(방어). 빈 입력은 0.
 */
export function computeUnitOrdinalSum(units: UnitOrdinal[]): number {
  let sum = 0;
  for (const u of units) {
    const n = u.minOrdinals;
    if (Number.isFinite(n) && n > 0) sum += Math.floor(n);
  }
  return sum;
}

/** 시험 구간 1개(차수별 진행/여유 차시 + 시험일). examDate 출처=calendarEvents. */
export interface ExamSegment {
  ordinal: 1 | 2;
  /** 시험일(YYYY-MM-DD). 미지정(미등록)이면 null. */
  examDate: string | null;
  plannedPeriods: number;
  slackPeriods: number;
}

/** computeRemainingToExam 입력. today 와 대표분반 수업일 목록은 호출 측이 결정한다. */
export interface RemainingToExamInput {
  /** 오늘 날짜(YYYY-MM-DD). */
  today: string;
  /** 대표분반 수업일(차시) 날짜 오름차순 — representativeDates() 결과. */
  representativeDates: string[];
  /** 학교 수업일 목록(오름차순). 남은 수업일(a) 산출용. */
  schoolDays: { date: string }[];
  /** 대표분반 슬롯 요일 집합 — pickRepresentativeSection() 결과. */
  representativeWeekdays: Set<number>;
  /** 시험 구간(1/2). examDate 가 있는 구간만 활성 후보. */
  segments: ExamSegment[];
}

export interface RemainingToExamView {
  /** 활성 구간 차수(1|2). 활성 구간이 없으면 null. */
  activeOrdinal: 1 | 2 | null;
  /** 활성 구간 시험일(없으면 null). */
  examDate: string | null;
  /** (a) 남은 수업일 = (today, examDate] 중 대표분반 요일 수. clamp ≥ 0. */
  remainingSchoolDays: number;
  /** (b) 남은 차시 = (planned + slack) − 소비 ordinal 수. clamp ≥ 0. */
  remainingPeriods: number;
}

/**
 * AC-1.3 — "시험까지 남은 차시" 카운터(둘 다). 결정론·타임존 무관(문자열 비교).
 *
 * 활성 구간 선택: today > segment1.examDate 이면 2회로 전환(구간 리셋). 그 외엔 examDate
 * 가 있는 가장 이른 미경과(today ≤ examDate) 구간. 둘 다 경과면 2회(있으면)를 활성으로 둔다.
 *
 * (a) 남은 수업일 = schoolDays 중 (today, examDate] ∩ 대표분반 요일 수.
 * (b) 남은 차시 = (active.plannedPeriods + active.slackPeriods) − 소비 ordinal 수.
 *     소비 ordinal = representativeDates 중 날짜 ≤ today 인 차시 수.
 *     구간 리셋 시 이전 구간 여유차시는 active 구간 값만 쓰므로 자동 제외된다.
 * 둘 다 clamp ≥ 0.
 */
export function computeRemainingToExam(
  input: RemainingToExamInput,
): RemainingToExamView {
  const { today, representativeDates, schoolDays, representativeWeekdays } =
    input;
  const seg1 = input.segments.find((s) => s.ordinal === 1) ?? null;
  const seg2 = input.segments.find((s) => s.ordinal === 2) ?? null;

  // 활성 구간 선택(구간 리셋 포함).
  let active: ExamSegment | null = null;
  if (seg1 && seg1.examDate && today <= seg1.examDate) {
    active = seg1; // 1회 미경과 → 1회 활성.
  } else if (seg2 && seg2.examDate) {
    active = seg2; // 1회 경과(또는 1회 미등록) → 2회 활성.
  } else if (seg1 && seg1.examDate) {
    active = seg1; // 2회 미등록 + 1회 경과 → 1회로 표시(경과지만 fallback).
  }

  if (!active || !active.examDate) {
    return {
      activeOrdinal: active?.ordinal ?? null,
      examDate: active?.examDate ?? null,
      remainingSchoolDays: 0,
      remainingPeriods: 0,
    };
  }
  const examDate = active.examDate;

  // (a) 남은 수업일 = (today, examDate] 중 대표분반 요일 수.
  let remainingSchoolDays = 0;
  for (const { date } of schoolDays) {
    if (date > today && date <= examDate && representativeWeekdays.has(weekdayOf(date))) {
      remainingSchoolDays += 1;
    }
  }

  // (b) 남은 차시 = (planned + slack) − 소비 ordinal(대표분반 날짜 ≤ today).
  let consumed = 0;
  for (const d of representativeDates) {
    if (d <= today) consumed += 1;
  }
  const capacity = active.plannedPeriods + active.slackPeriods;
  const remainingPeriods = Math.max(0, capacity - consumed);

  return {
    activeOrdinal: active.ordinal,
    examDate,
    remainingSchoolDays: Math.max(0, remainingSchoolDays),
    remainingPeriods,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 세부단원 → 차시계획 자동 배치 (수업계획실 수정 2026-07 ③). 순수 함수.
 *
 * 규칙: 6자리 코드 오름차순으로 각 단원이 최소차시(minOrdinals)만큼 연속 차시를
 * 차지한다. 1차 시험 목표진도의 '종료 단원' 코드가 있으면 그 코드 **이하** 단원은
 * 1차 시험 마커(시험일 이후 첫 차시) 앞까지, 초과 단원은 마커부터 순서대로 배치한다.
 * 1차 그룹이 시험 전 차시 수를 넘거나 전체가 총 차시를 넘으면 오류(저장 차단).
 * ──────────────────────────────────────────────────────────────────────── */

/** 배치 대상 단원(코드·최소차시·식별자). */
export interface LayoutUnit {
  id: string;
  /** 6자리 코드(sixDigitCode). 오름차순 배치 기준. */
  code: number;
  minOrdinals: number;
}

export interface UnitLayoutInput {
  units: LayoutUnit[];
  /** 차시계획 총 차시 수(대표분반 차시 N). 1 이상이어야 배치 가능. */
  totalOrdinals: number;
  /** 1차 시험 마커 ordinal(시험일 이후 첫 차시). null 이면 분할 없음. */
  exam1MarkerOrdinal: number | null;
  /** 1차 목표진도 '종료 단원' 코드. null 이면 분할 없음. */
  exam1ToCode: number | null;
}

export type UnitLayoutResult =
  | {
      ok: true;
      /** index i → ordinal i+1 에 배치할 unitId(빈 차시는 null). 길이 = totalOrdinals. */
      unitIdByOrdinal: (string | null)[];
    }
  | { ok: false; error: string };

/**
 * 세부단원 자동 배치(②③ 검증 + 배치). 결정론(입력 동일 → 출력 동일)·원본 불변.
 *
 * - 전체 최소차시 합 > totalOrdinals → 오류(② 총 차시 초과).
 * - 분할 시 1차 그룹(코드 ≤ exam1ToCode) 합 > 마커 앞 차시 수 → 오류(③ 구간 초과).
 * - 분할 시 2차 그룹이 마커부터 배치되어 totalOrdinals 를 넘으면 → 오류.
 * - exam1MarkerOrdinal/exam1ToCode 중 하나라도 null 이면 분할 없이 1번 차시부터 연속.
 */
export function layoutUnitsByExamTargets(
  input: UnitLayoutInput,
): UnitLayoutResult {
  const { totalOrdinals, exam1MarkerOrdinal, exam1ToCode } = input;
  if (!Number.isInteger(totalOrdinals) || totalOrdinals < 1) {
    return { ok: false, error: "총 차시 수가 없어 자동 배치할 수 없습니다." };
  }
  const units = [...input.units].sort((a, b) => a.code - b.code);
  const need = (u: LayoutUnit): number =>
    Number.isFinite(u.minOrdinals) && u.minOrdinals > 0
      ? Math.floor(u.minOrdinals)
      : 1;
  const totalNeed = units.reduce((s, u) => s + need(u), 0);
  if (totalNeed > totalOrdinals) {
    return {
      ok: false,
      error: `세부 단원 최소차시 합(${totalNeed})이 이 수업의 총 차시(${totalOrdinals})를 초과합니다.`,
    };
  }

  const out: (string | null)[] = Array.from(
    { length: totalOrdinals },
    () => null,
  );
  const place = (group: LayoutUnit[], startOrdinal: number): number => {
    let cursor = startOrdinal; // 1-based
    for (const u of group) {
      for (let k = 0; k < need(u); k++) {
        out[cursor - 1] = u.id;
        cursor += 1;
      }
    }
    return cursor;
  };

  const split =
    exam1MarkerOrdinal !== null &&
    Number.isInteger(exam1MarkerOrdinal) &&
    exam1MarkerOrdinal >= 1 &&
    exam1ToCode !== null;
  if (!split) {
    place(units, 1);
    return { ok: true, unitIdByOrdinal: out };
  }

  const marker = exam1MarkerOrdinal as number;
  const group1 = units.filter((u) => u.code <= (exam1ToCode as number));
  const group2 = units.filter((u) => u.code > (exam1ToCode as number));
  const need1 = group1.reduce((s, u) => s + need(u), 0);
  const capacity1 = marker - 1; // 마커 차시(시험일 이후 첫 차시) 앞까지.
  if (need1 > capacity1) {
    return {
      ok: false,
      error: `1차 시험 진도 단원의 최소차시 합(${need1})이 1차 시험 전 차시 수(${capacity1})를 초과합니다.`,
    };
  }
  const need2 = group2.reduce((s, u) => s + need(u), 0);
  const capacity2 = totalOrdinals - marker + 1; // 마커부터 끝까지.
  if (need2 > capacity2) {
    return {
      ok: false,
      error: `1차 시험 이후 단원의 최소차시 합(${need2})이 1차 시험 후 차시 수(${capacity2})를 초과합니다.`,
    };
  }
  place(group1, 1);
  place(group2, marker);
  return { ok: true, unitIdByOrdinal: out };
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
