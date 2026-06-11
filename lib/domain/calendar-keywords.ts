/**
 * 학사일정 키워드 분류 (QC v2 2-1 단계 B). NEIS 자유텍스트 행사명 + 날짜 + NEIS 비수업일
 * 플래그를 종합해 event_kind 로 분류한다(context-aware).
 *
 * - 단건(classifyOne): 제목 키워드만으로 분류(컨텍스트 무관 부분). mock_exam 검사를
 *   isExam 보다 **우선**한다('학력평가'가 지필 exam 로 오분류되는 것 방지).
 * - 시퀀스(classifySchedule): 날짜 오름차순 정렬 후 방학 구간(방학식~개학식)·휴업일(NEIS
 *   비수업일 ∧ 방학 아님)·지필 학기(8/15 자동, 제목 명시 우선)·미분류 경고를 산출한다.
 *
 * best-effort: 자동 분류 후 교사 보정(updateEventAttributes/일괄저장)이 최종 진실원.
 */
import { activeSemester } from "./school-year";

export type EventKind =
  | "exam" // 지필평가/고사 (examSemester·examOrdinal 동반)
  | "mock_exam" // 수능·모의고사·학력평가 (학기/회차 없음, 지필 경계 제외)
  | "vacation" // 방학(방학식~개학식 구간 + 제목 '방학')
  | "holiday" // 휴업일(NEIS 비수업일 ∧ 방학 아님: 국경일·대체공휴일·재량휴업일)
  | "club" // 동아리 활동
  | "self_activity" // 자율활동(미분류 기본값 포함)
  | "career_activity"; // 진로활동
// (DB enum 에는 구 값 vacation_start/vacation_end/none 이 미사용으로 잔존)

export interface EventClassification {
  eventKind: EventKind;
  examSemester?: number; // 1 | 2 (exam 만)
  examOrdinal?: number; // 1(중간/1차) | 2(기말/2차) (exam 만)
}

/** 공백 제거 정규화(키워드 부분일치 안정화). 한글은 그대로. */
function normalize(title: string): string {
  return title.replace(/\s+/g, "");
}

function detectSemester(t: string): number | undefined {
  if (/1학기|일학기/.test(t)) return 1;
  if (/2학기|이학기/.test(t)) return 2;
  return undefined;
}

function detectOrdinal(t: string): number | undefined {
  if (/중간|1차|일차/.test(t)) return 1;
  if (/기말|2차|이차/.test(t)) return 2;
  return undefined;
}

/** 지필평가/고사/시험 계열(수행평가·학력평가 제외 — 학력평가는 mock_exam). */
function isExam(t: string): boolean {
  if (/수행평가/.test(t)) return false;
  return /지필|고사|중간|기말|시험/.test(t);
}

/**
 * 제목 키워드 단건 분류. 컨텍스트(방학구간·비수업일·날짜)는 classifySchedule 가 처리한다.
 * 분류 불가(미분류) 시 null.
 */
export function classifyOne(title: string): EventClassification | null {
  const t = normalize(title);
  if (t.length === 0) return null;

  // 수능·모의고사 검사를 지필(exam) 보다 우선 — '학력평가'가 exam 로 새는 것 방지.
  if (/모의고사|학력평가|수학능력시험/.test(t)) return { eventKind: "mock_exam" };
  // 방학 키워드(방학식 포함) → vacation
  if (/방학/.test(t)) return { eventKind: "vacation" };
  if (isExam(t)) {
    return {
      eventKind: "exam",
      examSemester: detectSemester(t),
      examOrdinal: detectOrdinal(t),
    };
  }
  if (/동아리/.test(t)) return { eventKind: "club" };
  if (/진로활동/.test(t)) return { eventKind: "career_activity" };
  if (/자율활동/.test(t)) return { eventKind: "self_activity" };
  return null;
}

export interface ScheduleEntry {
  date: string; // YYYY-MM-DD
  title: string;
  isSchoolDay: boolean; // NEIS 수업일 여부(false=비수업일)
}

export interface ClassifiedEvent {
  date: string;
  title: string;
  eventKind: EventKind;
  examSemester: number | null;
  examOrdinal: number | null;
  needsReview: boolean; // 미분류 fallback(self_activity)만 true
}

/** 날짜(YYYY-MM-DD)에서 지필 학기 산정(8/15 학년도-aware 경계). */
function semesterFromDate(date: string): number {
  return activeSemester(new Date(`${date}T00:00:00Z`));
}

/**
 * 시퀀스 분류(QC v2 2-1 B). 날짜 오름차순으로 처리하며:
 * ① 방학식~개학식 구간 + 제목 '방학' → vacation(방학 우선)
 * ② 위가 아니고 비수업일(isSchoolDay=false) → holiday
 * ③ 제목 분류(classifyOne) → 그 값. exam 은 학기 미상 시 8/15 자동(제목 명시 우선)
 * ④ 어디에도 해당 없음 → self_activity + needsReview(경고)
 * 반환은 날짜 오름차순.
 */
export function classifySchedule(entries: ScheduleEntry[]): ClassifiedEvent[] {
  const sorted = [...entries].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  let inVacation = false;
  const out: ClassifiedEvent[] = [];

  for (const e of sorted) {
    const t = normalize(e.title);
    const isVacationKeyword = /방학/.test(t); // 방학식 포함
    const isReopen = /개학/.test(t); // 개학식 = 방학 구간 종료

    // 개학식이면 이 이벤트 처리 전에 방학 구간 종료(개학식 당일은 방학 아님).
    if (isReopen) inVacation = false;

    const base = classifyOne(e.title);
    let eventKind: EventKind;
    let examSemester: number | null = null;
    let examOrdinal: number | null = null;
    let needsReview = false;

    if (isVacationKeyword || inVacation) {
      eventKind = "vacation";
    } else if (base) {
      eventKind = base.eventKind;
      if (eventKind === "exam") {
        examSemester = base.examSemester ?? semesterFromDate(e.date);
        examOrdinal = base.examOrdinal ?? null;
      }
    } else if (!e.isSchoolDay) {
      eventKind = "holiday";
    } else {
      eventKind = "self_activity";
      needsReview = true;
    }

    out.push({
      date: e.date,
      title: e.title,
      eventKind,
      examSemester,
      examOrdinal,
      needsReview,
    });

    // 방학식 이후부터 구간 시작(개학식까지 후속 이벤트 vacation).
    if (isVacationKeyword) inVacation = true;
  }

  return out;
}

/**
 * 하위호환 단건 분류(기존 호출부). classifyOne 결과가 없으면 self_activity 로 떨어뜨린다
 * (컨텍스트 없는 단건 경로 — 시퀀스 정보가 필요한 holiday/vacation-span 은 classifySchedule 사용).
 */
export function classifyEvent(title: string): EventClassification {
  return classifyOne(title) ?? { eventKind: "self_activity" };
}
