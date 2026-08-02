/**
 * 실(공간) 공통 헤더 — 제목 한 줄 (밀도 개선 D-2, 간략화 S-1).
 *
 * 이전에는 각 실 layout 이 `이모지 + 24px 제목` / `설명 문단` / (일부는 두 번째
 * 보조 문단) / `← 홈` 링크를 세로로 쌓아 실측 88~110px 을 먹었다. D-2 에서 제목과
 * 설명을 한 줄로 합쳤고, `← 홈` 은 사이드바·하단 탭바와 중복이라 지웠다.
 *
 * S-1 에서 `desc` 를 선택 항목으로 낮춘다. 대부분의 실 설명은 바로 아래 탭 바를
 * 문장으로 옮겨 적은 것이었다("동아리 개설·부원 배정·활동 계획·…을 한곳에서
 * 관리합니다" ↔ 탭 5개). 같은 것을 두 번 말하는 줄은 안내가 아니라 소음이다.
 * 남기는 건 탭에서 못 읽는 것뿐 — 학년도 같은 현재 맥락, note 같은 상시 제약.
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
  /** 탭·제목에서 읽을 수 없는 맥락일 때만. 탭 목록을 문장으로 옮긴 설명은 넣지 않는다. */
  desc?: string;
  note?: string;
  actions?: React.ReactNode;
}) {
  const sub = [desc, note].filter(Boolean).join(" · ");
  return (
    <div className="flex items-baseline gap-3">
      <h1 className="shrink-0 text-base tracking-tight">
        <span aria-hidden="true">{icon}</span> {title}
      </h1>
      {sub ? (
        <p className="hidden min-w-0 flex-1 truncate text-xs text-neutral-400 md:block">
          {sub}
        </p>
      ) : null}
      {actions ? <div className="ml-auto shrink-0">{actions}</div> : null}
    </div>
  );
}
