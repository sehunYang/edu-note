/**
 * 접이식 섹션 — 점진적 공개(progressive disclosure)의 공용 그릇 (밀도 개선 D-4).
 *
 * 이 앱의 밀도 문제는 양방향이었다. 한쪽에는 빈 화면이, 다른 쪽에는 "전부 펼친
 * 평면 목록"이 있었다. 실측:
 *   /setting/courses          6,136px  (분반 4개 명단 전개)
 *   /clubroom/assign          2,006px  (체크박스 129개, 검색·그룹 없음)
 *   /clubroom/entry           3,157px  (차시 11개 동일 카드 전개)
 *   /homeroom/notice          2,417px  (고정반 체크박스 68개 상시 노출)
 * 어느 것도 "지금 할 일"이 아니다. 밀도 칼럼의 "당장 필요하지 않지만 필요할 때
 * 펼칠 수 있는 2차 정보는 접어라"에 정확히 해당한다.
 *
 * 네이티브 <details>/<summary> 를 쓴다 — JS 없이 동작하고, 브라우저가 키보드·
 * 스크린리더·Ctrl+F(모던 브라우저의 hidden=until-found 대체)를 이미 처리한다.
 * 요약 줄에 `count`(내용물 규모)와 `hint`(대표값)를 함께 실어, 펼치지 않아도
 * 안에 무엇이 얼마나 있는지 알 수 있게 한다. 접힌 상태가 정보 손실이 되지
 * 않도록 하는 것이 이 컴포넌트의 핵심 계약이다.
 */
export function Disclosure({
  title,
  count,
  hint,
  defaultOpen = false,
  children,
  tone = "card",
}: {
  title: string;
  /** 안에 든 항목 수. 접힌 채로도 규모를 알 수 있게 한다. */
  count?: number | string;
  /** 대표 상태 한 줄(예: "3건 미작성"). 접힌 채로도 이상 여부를 알 수 있게 한다. */
  hint?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** card = 테두리 있는 블록, plain = 목록 안에 끼워 넣는 줄 */
  tone?: "card" | "plain";
}) {
  return (
    <details
      open={defaultOpen}
      className={
        tone === "card"
          ? "group rounded-lg border border-neutral-200 [&[open]]:bg-white/[0.02]"
          : "group border-b border-neutral-200 last:border-b-0"
      }
    >
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 py-2.5 text-sm marker:content-none ${
          tone === "card" ? "px-4" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className="shrink-0 text-xs text-neutral-400 transition-transform duration-120 group-open:rotate-90"
        >
          ▶
        </span>
        <span className="font-medium text-white">{title}</span>
        {count !== undefined && (
          <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-xs text-neutral-500">
            {count}
          </span>
        )}
        {hint ? (
          <span className="ml-auto truncate text-xs text-neutral-400">
            {hint}
          </span>
        ) : null}
      </summary>
      <div className={tone === "card" ? "px-4 pb-4" : "pb-4"}>{children}</div>
    </details>
  );
}
