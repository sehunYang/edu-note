import Link from "next/link";

/**
 * 화면 내 구획 전환용 밑줄 탭 (연간시나리오 QC D).
 *
 * 같은 성격의 인페이지 전환이 화면마다 다른 모양이었다 — 출결 5개 뷰는
 * 컨테이너 `border-b` + 항목 `-mb-px border-b-2`(비활성 transparent, 글자
 * neutral-500), 생기부 3개 뷰는 컨테이너 `border-b` + **활성 항목만**
 * `border-b-2`(비활성은 밑줄 자체가 없고 글자 neutral-400). 밑줄 굵기가
 * 같은데도 비활성 처리가 달라 두 화면이 미묘하게 다른 컴포넌트로 보였다.
 * 여기로 모아 한 규약만 남긴다.
 *
 * 링크 모드(`href`)와 버튼 모드(`onSelect`)를 모두 지원한다 — 출결은 URL
 * 상태(`?view=`)라 Link 가, 생기부는 로컬 상태라 button 이 맞다. 둘 중 하나만
 * 주면 된다.
 *
 * 높이: 모바일 44px(HIG) — 이전 실측 38px 이었고 출결은 조회 시간에 폰으로
 * 가장 자주 여는 화면이다. 데스크톱은 min-h 를 풀어 globals 의 2rem 바닥을
 * 그대로 받는다(탭이 과하게 두꺼워지지 않게).
 */
export type UnderlineTabItem = {
  key: string;
  label: string;
  /** 주면 Link 로 렌더한다. 없으면 button + onSelect. */
  href?: string;
};

const BASE =
  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors md:min-h-0 md:py-2";
const ACTIVE = "border-neutral-800 text-neutral-800";
const INACTIVE =
  "border-transparent text-neutral-500 hover:text-neutral-700";

export function UnderlineTabs({
  items,
  activeKey,
  onSelect,
  ariaLabel,
  className,
}: {
  items: UnderlineTabItem[];
  activeKey: string;
  /** 버튼 모드에서 탭 선택 시 호출. 링크 모드면 불필요. */
  onSelect?: (key: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-1 border-b border-neutral-200 ${
        className ?? ""
      }`}
    >
      {items.map((t) => {
        const active = t.key === activeKey;
        const cls = `${BASE} ${active ? ACTIVE : INACTIVE}`;

        if (t.href) {
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cls}
            >
              {t.label}
            </Link>
          );
        }

        return (
          <button
            key={t.key}
            type="button"
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect?.(t.key)}
            className={cls}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
