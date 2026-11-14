/**
 * 결석 기간 묶음 규칙 (0066).
 *
 * 결석을 기간으로 입력하면 수업일마다 출결 행이 생기지만, 서류(결석계)는 교외체험처럼
 * 기간 1건 = 1장이다. 같은 입력으로 만든 행은 absence_group_id 를 공유하고, 마감은
 * 기간의 마지막 날을 기준으로 한다. 이 파일은 그 판단을 DB 없이 하는 순수 함수다.
 */

interface GroupRow {
  id: string;
  date: string;
  absenceGroupId: string | null;
}

/**
 * 묶음 앵커 = 서류가 필요한 행 중 가장 늦은 날짜(동률이면 id 가 큰 쪽). 없으면 null.
 * 신고서 추적(report_tracking)은 이 행 하나에만 두어, 마감 기준일이 마지막 날이 된다.
 */
export function groupAnchor<
  T extends { id: string; date: string; reportRequired: boolean },
>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!r.reportRequired) continue;
    if (!best || r.date > best.date || (r.date === best.date && r.id > best.id)) {
      best = r;
    }
  }
  return best;
}

/**
 * 출결 행들을 서류 1건 단위로 접는다. 묶음 밖 행은 각자 1건.
 * first = 가장 이른 날짜의 행(대표), lastDate = 가장 늦은 날짜(마감 기준일).
 * 입력 순서와 무관하게 결과가 같다(날짜·id 로 결정). 순서는 처음 나온 순.
 */
export function collapseAbsenceGroups<T extends GroupRow>(
  rows: readonly T[],
): { first: T; lastDate: string }[] {
  const byKey = new Map<string, { first: T; lastDate: string }>();
  for (const r of rows) {
    const key = r.absenceGroupId ? `g:${r.absenceGroupId}` : `r:${r.id}`;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, { first: r, lastDate: r.date });
      continue;
    }
    if (r.date < cur.first.date || (r.date === cur.first.date && r.id < cur.first.id)) {
      cur.first = r;
    }
    if (r.date > cur.lastDate) cur.lastDate = r.date;
  }
  return [...byKey.values()];
}

/** 이어붙이기 판단에 필요한 출결 행의 최소 형태. */
export interface JoinableRow {
  kind: string;
  reason: string;
  reportRequired: boolean;
  reportSubmitted: boolean;
  fieldTripId: string | null;
}

/**
 * 따로 입력한 결석을 같은 서류로 묶을 수 있는가 — 바로 앞·뒤 수업일의 결석끼리 쓴다.
 *  - 결석끼리만(지각·조퇴·결과는 서류가 날마다 따로다).
 *  - 사유가 같아야 한다(비고는 보지 않는다 — "몸살 감기"/"감기"는 같은 결석).
 *  - 양쪽 다 서류가 필요하고 아직 미제출이어야 한다. 이미 받은 서류에는 새 날짜가
 *    없으므로, 제출된 결석에 붙이면 제출 상태가 거짓이 된다.
 *  - 교외체험이 만든 결석은 사후보고서로 받으므로 묶지 않는다.
 */
export function isJoinableAbsence(seed: JoinableRow, cand: JoinableRow): boolean {
  const ok = (r: JoinableRow) =>
    r.kind === "absent" && r.reportRequired && !r.reportSubmitted && !r.fieldTripId;
  return ok(seed) && ok(cand) && seed.reason === cand.reason;
}
