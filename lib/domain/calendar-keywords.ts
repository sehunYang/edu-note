/**
 * 학사일정 키워드 추출 규칙 (QC v1 C3, AC-3.1~3.4). NEIS 자유텍스트 행사명을
 * event_kind 로 분류하고, 시험이면 학기(1/2)·회차(1차=중간/2차=기말)를 파생한다.
 *
 * best-effort: 분류는 동기화 시 자동 부여하되 **교사 보정 UI 가 최종 진실원**이다
 * (오탐/누락 시 updateEventAttributes 로 교정). 규칙을 순수 함수로 분리해 다양한
 * NEIS 표기 케이스를 단위테스트로 고정한다.
 */
export type EventKind =
  | "exam"
  | "vacation_start"
  | "vacation_end"
  | "club"
  | "none";

export interface EventClassification {
  eventKind: EventKind;
  examSemester?: number; // 1 | 2
  examOrdinal?: number; // 1(중간/1차) | 2(기말/2차)
}

/** 공백 제거한 소문자 정규화(한글은 그대로). 키워드 부분일치 안정화. */
function normalize(title: string): string {
  return title.replace(/\s+/g, "");
}

function detectSemester(t: string): number | undefined {
  if (/1학기|일학기/.test(t)) return 1;
  if (/2학기|이학기/.test(t)) return 2;
  return undefined;
}

function detectOrdinal(t: string): number | undefined {
  // 중간/1차 → 1, 기말/2차 → 2
  if (/중간|1차|일차/.test(t)) return 1;
  if (/기말|2차|이차/.test(t)) return 2;
  return undefined;
}

/** 지필평가/고사/시험 계열(수행평가는 제외). */
function isExam(t: string): boolean {
  if (/수행평가/.test(t)) return false;
  return /지필|고사|중간|기말|학력평가|시험/.test(t);
}

export function classifyEvent(title: string): EventClassification {
  const t = normalize(title);
  if (t.length === 0) return { eventKind: "none" };

  // 개학식(vacation_end) 을 방학(vacation_start) 보다 먼저 — "개학" 우선
  if (/개학/.test(t)) return { eventKind: "vacation_end" };
  if (/방학/.test(t)) return { eventKind: "vacation_start" };

  if (isExam(t)) {
    return {
      eventKind: "exam",
      examSemester: detectSemester(t),
      examOrdinal: detectOrdinal(t),
    };
  }

  if (/동아리/.test(t)) return { eventKind: "club" };

  return { eventKind: "none" };
}
