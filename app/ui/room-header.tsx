/**
 * 실(공간) 공통 헤더 — 한 줄 압축판 (밀도 개선 D-2).
 *
 * 이전에는 각 실 layout 이 `이모지 + 24px 제목` / `설명 문단` / (일부는 두 번째
 * 보조 문단) / `← 홈` 링크를 세로로 쌓아 실측 88~110px 을 먹었다. 이 블록은 실
 * 하위 17개 화면 **전부**에서 글자 하나 다르지 않게 반복됐고, 그 위에는 이미
 * 같은 정보를 말하는 것이 둘 더 있었다 — 스티키 글래스 헤더의 페이지 제목과
 * 사이드바의 활성 실 표시. 스크롤 없이 보이는 900px 중 12%가 "지금 어디인지"를
 * 세 번째로 알려주는 데 쓰였다.
 *
 * 밀도 칼럼의 "필요할 때 펼칠 수 있는 2차 정보는 접어라"를 그대로 적용한다:
 * - 제목은 16px 로 낮추고 설명과 **같은 줄**에 둔다(합계 ~28px, 60~70% 절감).
 * - 설명은 md 이상에서만, 그것도 truncate 로 한 줄. 실을 처음 여는 사람에게는
 *   보이고, 매일 쓰는 사람의 시선은 잡지 않는다.
 * - `← 홈` 은 삭제한다. 데스크톱은 사이드바 최상단 "Edu_Note", 모바일은 하단
 *   탭바 "허브"가 같은 목적지를 이미 상시 노출한다(중복 3중 → 1중).
 *
 * note 는 실 전체에 걸리는 상시 제약(예: "학기 구분 없이 사용")이라 설명과
 * 함께 접힌다.
 */
export function RoomHeader({
  icon,
  title,
  desc,
  note,
  actions,
}: {
  icon: string;
  title: string;
  desc: string;
  note?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <h1 className="shrink-0 text-base tracking-tight">
        <span aria-hidden="true">{icon}</span> {title}
      </h1>
      <p className="hidden min-w-0 flex-1 truncate text-xs text-neutral-400 md:block">
        {desc}
        {note ? ` · ${note}` : ""}
      </p>
      {actions ? <div className="ml-auto shrink-0">{actions}</div> : null}
    </div>
  );
}
