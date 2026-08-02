/**
 * 잔여 시수 계산 (계획 §3.4 remainingSessions, AC-B/§5).
 *
 * 남은차시 = count(planned, date ≤ 경계) − count(done).
 * not_held(미진행)는 planned/done 어디에도 포함하지 않고 별도 집계.
 * 경계 = COALESCE(section.exam_boundary_date, subject.exam_boundary_date).
 */
import type { SessionStatus } from "./types";

export interface SessionLike {
  date: string; // YYYY-MM-DD
  status: SessionStatus;
  /**
   * 보강일 (기능갭 #3). not_held 차시에만 의미가 있다. null/undefined = 미회복.
   * 이 값이 없으면 기존 동작과 완전히 동일하다(전부 미회복으로 집계).
   */
  makeupDate?: string | null;
}

/** 분반 경계 우선, 없으면 과목 경계 (둘 다 없으면 null). */
export function resolveBoundary(
  sectionBoundary?: string | null,
  subjectBoundary?: string | null,
): string | null {
  return sectionBoundary ?? subjectBoundary ?? null;
}

export interface SessionTally {
  /** 경계까지의 planned 수. */
  plannedUpToBoundary: number;
  done: number;
  notHeld: number;
  /** not_held 중 보강일이 지정된 것(회복됨). */
  makeupPlanned: number;
  /** not_held 중 보강일이 없는 것 — 실제 진도 손실. */
  unrecovered: number;
  /** planned(≤경계) − done. */
  remaining: number;
}

export function tallySessions(
  sessions: SessionLike[],
  boundary: string | null,
): SessionTally {
  let plannedUpToBoundary = 0;
  let done = 0;
  let notHeld = 0;
  let makeupPlanned = 0;

  for (const s of sessions) {
    if (s.status === "not_held") {
      notHeld += 1;
      // 보강일이 적혀 있으면 회복된 결손. 빈 문자열은 미입력으로 본다.
      if (s.makeupDate) makeupPlanned += 1;
    } else if (s.status === "done") {
      done += 1;
    } else if (s.status === "planned") {
      // 경계가 없으면 모든 planned 포함(경계 미설정 = 학기 전체).
      if (boundary === null || s.date <= boundary) plannedUpToBoundary += 1;
    }
  }

  return {
    plannedUpToBoundary,
    done,
    notHeld,
    makeupPlanned,
    unrecovered: notHeld - makeupPlanned,
    remaining: plannedUpToBoundary - done,
  };
}
