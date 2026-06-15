export const dynamic = "force-dynamic";

/**
 * 담임 교실 허브 랜딩 (QC v4 US-8, AC-3.1). 헤더·탭 바·담임 게이팅은 공유 셸
 * (app/homeroom/layout.tsx)이 담당하므로, 이 페이지는 묶음 역할만 한다(안내 문구).
 */
export default function HomeroomPage() {
  return (
    <p className="text-sm text-neutral-500">
      위 탭에서 자율·진로활동, 출결 관리, 행동특성 기록, 상담실, 공지실, 생기부
      작성으로 이동하세요.
    </p>
  );
}
