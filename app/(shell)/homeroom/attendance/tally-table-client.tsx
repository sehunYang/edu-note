"use client";

import { Button } from "@/app/ui/button";
import { downloadCsv } from "@/lib/ui/download-csv";
import {
  TALLY_KINDS,
  TALLY_REASONS,
  TALLY_KIND_LABELS,
  TALLY_REASON_LABELS,
  sumTallies,
  tallyToCsv,
  type StudentTally,
} from "@/lib/domain/attendance-tally";

/**
 * NEIS 출결상황 집계표 (연간시나리오 기능갭 #1).
 *
 * 열이 학번·이름·수업일수 + 4성격×4사유 + 미제출 = 20개라 모바일에서는 반드시
 * 가로 스크롤이 된다. 그건 줄일 수 없는 정보량이라(NEIS 입력란이 그렇게 생겼다)
 * 숨기는 대신 **학번·이름 열을 sticky 로 고정**해서 오른쪽으로 밀어도 어느 학생
 * 줄인지 잃지 않게 한다.
 *
 * 0 은 흐린 `·` 로 죽인다 — 32명 × 16칸이면 0 이 대부분이고, 그걸 다 같은 밝기로
 * 찍으면 실제 값이 묻힌다. CSV 에는 0 을 그대로 적는다(열 밀림 방지).
 */
export function TallyTableClient({
  rows,
  schoolDays,
  from,
  to,
  periodLabel,
}: {
  rows: StudentTally[];
  schoolDays: number;
  from: string;
  to: string;
  periodLabel: string;
}) {
  const totals = sumTallies(rows);
  const grandTotal = rows.reduce((n, r) => n + r.total, 0);
  const unsubmitted = rows.reduce((n, r) => n + r.unsubmittedReports, 0);

  if (rows.length === 0) {
    return (
      <p className="mt-4 text-sm text-neutral-400">
        담임반 학생 명단이 비어 있습니다.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-neutral-500">
          {periodLabel} · {from}~{to} · 수업일수{" "}
          {schoolDays > 0 ? (
            <span className="text-neutral-700">{schoolDays}일</span>
          ) : (
            <span className="text-amber-700">
              0일 — 세팅실에서 학사일정을 동기화하세요
            </span>
          )}
          {" · "}기록 {grandTotal}건
          {unsubmitted > 0 && (
            <span className="text-amber-700"> · 미제출 신고서 {unsubmitted}건</span>
          )}
        </p>
        <Button
          type="button"
          onClick={() =>
            downloadCsv(
              tallyToCsv(rows, schoolDays),
              `출결집계_${from}_${to}.csv`,
            )
          }
          className="px-3 py-1.5 text-xs"
        >
          CSV 다운로드
        </Button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs text-neutral-500">
              <th
                scope="col"
                rowSpan={2}
                className="sticky left-0 z-10 bg-canvas px-2 py-1 text-left"
              >
                학번
              </th>
              <th
                scope="col"
                rowSpan={2}
                className="sticky left-[4.5rem] z-10 bg-canvas px-2 py-1 text-left"
              >
                이름
              </th>
              {TALLY_KINDS.map((k) => (
                <th
                  key={k}
                  scope="colgroup"
                  colSpan={TALLY_REASONS.length}
                  className="border-l border-neutral-200 px-2 py-1 text-center"
                >
                  {TALLY_KIND_LABELS[k]}
                </th>
              ))}
              <th
                scope="col"
                rowSpan={2}
                className="border-l border-neutral-200 px-2 py-1 text-center"
              >
                미제출
              </th>
            </tr>
            <tr className="border-b border-neutral-200 text-xs text-neutral-400">
              {TALLY_KINDS.flatMap((k) =>
                TALLY_REASONS.map((r, i) => (
                  <th
                    key={`${k}-${r}`}
                    scope="col"
                    className={`px-2 py-1 text-center font-normal ${
                      i === 0 ? "border-l border-neutral-200" : ""
                    }`}
                  >
                    {TALLY_REASON_LABELS[r]}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.studentYearId}
                className="border-b border-neutral-100"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-canvas px-2 py-1 text-left font-normal text-neutral-500"
                >
                  {row.sid}
                </th>
                <td className="sticky left-[4.5rem] z-10 bg-canvas px-2 py-1 whitespace-nowrap">
                  {row.name}
                </td>
                {TALLY_KINDS.flatMap((k) =>
                  TALLY_REASONS.map((r, i) => {
                    const n = row.counts[k][r];
                    return (
                      <td
                        key={`${k}-${r}`}
                        className={`px-2 py-1 text-center ${
                          i === 0 ? "border-l border-neutral-200" : ""
                        } ${n === 0 ? "text-neutral-300" : "text-neutral-800"}`}
                      >
                        {n === 0 ? "·" : n}
                      </td>
                    );
                  }),
                )}
                <td
                  className={`border-l border-neutral-200 px-2 py-1 text-center ${
                    row.unsubmittedReports === 0
                      ? "text-neutral-300"
                      : "text-amber-700"
                  }`}
                >
                  {row.unsubmittedReports === 0 ? "·" : row.unsubmittedReports}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-300 text-sm">
              <th
                scope="row"
                colSpan={2}
                className="sticky left-0 z-10 bg-canvas px-2 py-1 text-left text-xs text-neutral-500"
              >
                합계 {rows.length}명
              </th>
              {TALLY_KINDS.flatMap((k) =>
                TALLY_REASONS.map((r, i) => (
                  <td
                    key={`${k}-${r}`}
                    className={`px-2 py-1 text-center ${
                      i === 0 ? "border-l border-neutral-200" : ""
                    } ${totals[k][r] === 0 ? "text-neutral-300" : "text-neutral-700"}`}
                  >
                    {totals[k][r] === 0 ? "·" : totals[k][r]}
                  </td>
                )),
              )}
              <td className="border-l border-neutral-200 px-2 py-1 text-center text-neutral-700">
                {unsubmitted === 0 ? "·" : unsubmitted}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        결석·지각·조퇴는 일수, 결과는 교시 수로 셉니다(한 날 3교시 결과 = 3).
      </p>
    </div>
  );
}
