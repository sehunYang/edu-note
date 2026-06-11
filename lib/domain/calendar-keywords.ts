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
  | "career_activity" // 진로활동
  | "etc"; // 기타 — 수동 전용(교사 재분류). classifyOne/classifySchedule 은 자동 부여하지 않음.
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
 * 시퀀스 분류(QC v2 2-1 B + 후속: cluster-local 방학 종료). 날짜 오름차순으로 2-phase 처리.
 *
 * Phase 1 — 방학 구간 마스크(vacation[]). 방학 opener(제목 '방학')에서 클러스터를 **local**
 * 하게 닫는다(분기 우선순위 고정: isReopen → isVac → base):
 *  - 개학 키워드 → 그날부터 비방학(개학식 당일 제외, endIdx=개학−1).
 *  - 방학 키워드 → 클러스터 확장(lastVac 갱신).
 *  - 그 외 positively-classified(exam/club/career/mock_exam/자율활동) 행 → 학교 가동 신호로
 *    클러스터 종료(endIdx=lastVac). [방학 중 키워드행이 조기 종료시킬 수 있음 — 교사 보정 전제]
 *  - 중립(미분류) 행 → tentative(계속 스캔). 개학이 없으면 이 클러스터의 **마지막 방학일**까지만
 *    방학(그 이후는 개학 간주). → cross-term merge(전 학기 silent vacation) 방지.
 *
 * Phase 2 — 분류 매핑(우선순위 vacation > classifyOne > holiday > self_activity+needsReview).
 * exam 은 학기 미상 시 8/15 자동(제목 명시 우선). needsReview 는 미분류 fallback 만 true.
 */
export function classifySchedule(entries: ScheduleEntry[]): ClassifiedEvent[] {
  const sorted = [...entries].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const n = sorted.length;

  // 사전계산(컨텍스트 무관 부분).
  const isVac = sorted.map((e) => /방학/.test(normalize(e.title)));
  const isReopen = sorted.map((e) => /개학/.test(normalize(e.title)));
  const base = sorted.map((e) => classifyOne(e.title));

  // Phase 1 — 방학 구간 마스크.
  const vacation = new Array<boolean>(n).fill(false);
  let i = 0;
  while (i < n) {
    if (!isVac[i]) {
      i += 1;
      continue;
    }
    // 방학 opener
    let lastVac = i;
    let breakKind: "reopen" | "positive" | "end" = "end";
    let breakIdx = n;
    for (let j = i + 1; j < n; j++) {
      if (isReopen[j]) {
        breakKind = "reopen"; // ① 개학 우선
        breakIdx = j;
        break;
      }
      if (isVac[j]) {
        lastVac = j; // ② 방학 키워드 → 클러스터 확장
        continue;
      }
      if (base[j] !== null) {
        breakKind = "positive"; // ③ 학교 가동 신호 → 클러스터 종료
        breakIdx = j;
        break;
      }
      // 중립(base null) → tentative, 계속 스캔
    }
    const endIdx = breakKind === "reopen" ? breakIdx - 1 : lastVac;
    for (let k = i; k <= endIdx; k++) vacation[k] = true;
    i = endIdx + 1;
  }

  // Phase 2 — 분류 매핑.
  return sorted.map((e, idx) => {
    const b = base[idx];
    let eventKind: EventKind;
    let examSemester: number | null = null;
    let examOrdinal: number | null = null;
    let needsReview = false;

    if (vacation[idx]) {
      eventKind = "vacation";
    } else if (b) {
      eventKind = b.eventKind;
      if (eventKind === "exam") {
        examSemester = b.examSemester ?? semesterFromDate(e.date);
        examOrdinal = b.examOrdinal ?? null;
      }
    } else if (!e.isSchoolDay) {
      eventKind = "holiday";
    } else {
      eventKind = "self_activity";
      needsReview = true;
    }

    return {
      date: e.date,
      title: e.title,
      eventKind,
      examSemester,
      examOrdinal,
      needsReview,
    };
  });
}

/**
 * 하위호환 단건 분류(기존 호출부). classifyOne 결과가 없으면 self_activity 로 떨어뜨린다
 * (컨텍스트 없는 단건 경로 — 시퀀스 정보가 필요한 holiday/vacation-span 은 classifySchedule 사용).
 */
export function classifyEvent(title: string): EventClassification {
  return classifyOne(title) ?? { eventKind: "self_activity" };
}
