/**
 * 통계실 이상징후 경보 도메인 (통계실·인쇄실 재구축 AD-1). 순수 함수(DB·네트워크
 * 없음) — 집계된 입력값을 받아 결정론적 규칙으로 경보 여부만 산출한다.
 *
 * 경보 3종:
 *  - attendanceSurge: 출결(지각+조퇴+결석+결과) 최근 30일 급증.
 *  - gradeDrop: 동일 과목 중간→기말 환산점수 급락.
 *  - recordGap: 최근 21일 관찰/행특 기록 공백.
 */

/** 출결 급증 판정 임계 건수(최근 30일). */
export const ATTENDANCE_SURGE_MIN = 3;

/**
 * 성적 급락 판정 임계(환산점수 기준, 점).
 * 주의: 중간·기말 **환산점수**를 비교한다(스펙 R9 원문 그대로, 의도적 선택).
 * 중간/기말 가중치(`subjects.jipilMidWeight`/`FinalWeight`)가 과목마다 달라
 * 환산 만점 자체가 다를 수 있어, 같은 15점 하락이라도 과목별 체감 낙폭이
 * 과대/과소평가될 수 있다(버그 아님 — 후속에서 원점수 기준 전환 여지 있음).
 */
export const GRADE_DROP_POINTS = 15;

/** 기록 공백 판정 기준 일수(최근 N일 관찰/행특 0건). */
export const RECORD_GAP_DAYS = 21;

/** 출결 급증 판정에 사용하는 비교 윈도(일). */
export const ATTENDANCE_WINDOW_DAYS = 30;

/**
 * 출결 급증 경보. 최근 30일 출결 건수가 임계(3건) 이상이고, 직전 30일 대비
 * 증가했을 때만 true. 임계 미만이면 증가 여부와 무관하게 false(소음 방지).
 */
export function attendanceSurge(recent30: number, prev30: number): boolean {
  return recent30 >= ATTENDANCE_SURGE_MIN && recent30 > prev30;
}

/**
 * 성적 급락 경보. 중간·기말 환산점수 중 하나라도 없으면 비교 불가 → false.
 * 둘 다 있으면 중간 - 기말 낙폭이 임계(15점) 이상일 때 true.
 */
export function gradeDrop(
  midConverted: number | null,
  finalConverted: number | null,
): boolean {
  if (midConverted === null || finalConverted === null) return false;
  return midConverted - finalConverted >= GRADE_DROP_POINTS;
}

/**
 * 기록 공백 경보(최근 21일 기준 카운트 입력).
 * 담임반 학생: 관찰·행특 둘 다 0건이어야 경보(행특 채널이 있으므로 함께 판단).
 * 비담임(수업 학생): 행특 채널이 없으므로 관찰 0건만으로 경보(behaviorCount21d 무시).
 */
export function recordGap(
  obsCount21d: number,
  behaviorCount21d: number,
  isHomeroomStudent: boolean,
): boolean {
  if (isHomeroomStudent) {
    return obsCount21d === 0 && behaviorCount21d === 0;
  }
  return obsCount21d === 0;
}

// ───────────────────────── 경보 요약(신호 대 잡음비) ─────────────────────────

/** 경보 종류. 딥링크 대상과 심각도 가중치를 이 키로 결정한다. */
export type AlertKind = "attendance" | "gradeDrop" | "recordGap";

/** 학생 1명의 경보 사유 1건(화면 문구 + 종류). */
export interface AlertReason {
  kind: AlertKind;
  text: string;
}

/** 학생 1명의 경보 묶음. */
export interface AlertEntry {
  studentYearId: string;
  name: string;
  reasons: AlertReason[];
}

/**
 * 모집단 과반에서 발생해 개별 경보로서의 정보량을 잃은 종류. 학생별 카드 대신
 * 요약 1줄로 접는다(예: 방학 중에는 전원 관찰 0건 → "관찰 공백 118명").
 */
export interface SystemicAlert {
  kind: AlertKind;
  count: number;
  /** 모집단 대비 발생 비율(0~1). */
  ratio: number;
}

export interface AlertSummary {
  /** 심각도 내림차순 개별 경보(systemic 으로 접힌 종류는 제외됨). */
  individual: AlertEntry[];
  /** 모집단 과반에서 발생해 접힌 종류들. */
  systemic: SystemicAlert[];
}

/**
 * 경보 종류별 심각도 가중치. 출결 급증·성적 급락은 즉각 개입이 필요한 신호이고,
 * 기록 공백은 교사 업무 진척 신호라 낮게 둔다.
 */
export const ALERT_SEVERITY: Record<AlertKind, number> = {
  attendance: 3,
  gradeDrop: 3,
  recordGap: 1,
};

/**
 * 이 비율 이상의 학생에게서 같은 종류가 발생하면 "이상"이 아니라 "현재 상태"로
 * 보고 개별 카드에서 걷어낸다. 모집단 100%에 걸리는 경보는 정보량이 0이며,
 * 실제로 방학 기간에는 관찰 공백이 전원에게 발생해 화면을 8,500px 이상 채웠다.
 */
export const SYSTEMIC_RATIO = 0.5;

/** 학생 1명의 심각도 점수(사유 가중치 합). 정렬 키. */
export function entrySeverity(entry: AlertEntry): number {
  return entry.reasons.reduce((sum, r) => sum + ALERT_SEVERITY[r.kind], 0);
}

/**
 * 경보 목록을 화면용으로 요약한다.
 *  1. 종류별 발생 비율이 SYSTEMIC_RATIO 이상이면 그 종류를 systemic 으로 접고
 *     모든 학생의 사유에서 제거한다.
 *  2. 남은 사유가 없는 학생은 개별 경보에서 빠진다.
 *  3. 남은 학생은 심각도 내림차순(동점이면 사유 수, 그다음 이름)으로 정렬한다.
 *
 * cohortSize 가 0 이하면 비율 계산이 불가하므로 접기를 수행하지 않는다.
 */
export function summarizeAlerts(
  entries: AlertEntry[],
  cohortSize: number,
): AlertSummary {
  const countByKind = new Map<AlertKind, number>();
  for (const e of entries) {
    for (const kind of new Set(e.reasons.map((r) => r.kind))) {
      countByKind.set(kind, (countByKind.get(kind) ?? 0) + 1);
    }
  }

  const systemic: SystemicAlert[] = [];
  const collapsed = new Set<AlertKind>();
  if (cohortSize > 0) {
    for (const [kind, count] of countByKind) {
      const ratio = count / cohortSize;
      if (ratio >= SYSTEMIC_RATIO) {
        collapsed.add(kind);
        systemic.push({ kind, count, ratio });
      }
    }
  }
  systemic.sort((a, b) => b.count - a.count);

  const individual = entries
    .map((e) => ({
      ...e,
      reasons: e.reasons.filter((r) => !collapsed.has(r.kind)),
    }))
    .filter((e) => e.reasons.length > 0)
    .sort(
      (a, b) =>
        entrySeverity(b) - entrySeverity(a) ||
        b.reasons.length - a.reasons.length ||
        a.name.localeCompare(b.name, "ko"),
    );

  return { individual, systemic };
}

/**
 * 오늘 날짜(Asia/Seoul 기준, YYYY-MM-DD). 서버가 UTC로 구동되어도 자정 경계
 * 오류 없이 KST 기준 오늘을 반환한다(경보 윈도 3종 모두 이 값에서 역산).
 * `Intl.DateTimeFormat`의 `timeZone` 옵션으로 UTC 순간을 KST 벽시계 날짜로
 * 변환한다(en-CA 로케일은 YYYY-MM-DD 포맷을 그대로 반환).
 */
export function todayKST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}
