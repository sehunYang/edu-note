import type { MealItem } from "./today-lib";

/**
 * 오늘 급식 위젯 (AC-7.8) — 메뉴/칼로리/영양 표. 표시 전용: 평탄화된 급식 항목을
 * props로 받는다(readMeals 가공은 페이지가 수행).
 */
export function MealsWidget({
  todayMeals,
  className,
}: {
  todayMeals: MealItem[];
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-neutral-200 p-4 ${className ?? ""}`}>
      <h2 className="text-sm font-normal text-neutral-700">오늘 급식</h2>
      {todayMeals.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">급식 정보가 없습니다.</p>
      ) : (
        <table className="mt-2 w-full table-fixed border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="border border-neutral-200 bg-neutral-50 px-2 py-1 font-normal">
                메뉴
              </th>
              <th className="w-16 border border-neutral-200 bg-neutral-50 px-2 py-1 font-normal">
                칼로리
              </th>
              <th className="w-32 border border-neutral-200 bg-neutral-50 px-2 py-1 font-normal">
                영양
              </th>
            </tr>
          </thead>
          <tbody>
            {todayMeals.map((m, i) => (
              <tr key={i}>
                <td className="max-w-0 break-words border border-neutral-200 px-2 py-1 align-top whitespace-pre-line">
                  {m.menu.join("\n")}
                </td>
                <td className="border border-neutral-200 px-2 py-1 align-top text-neutral-600">
                  {m.calInfo ?? "-"}
                </td>
                <td className="break-words border border-neutral-200 px-2 py-1 align-top whitespace-pre-line text-xs text-neutral-600">
                  {m.ntrInfo ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
