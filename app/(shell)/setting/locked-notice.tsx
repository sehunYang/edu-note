/** 잠긴 단계 URL 직접 진입 시 안내 (AC-0.1 서버측 게이팅 표시). */
export function LockedNotice() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
      🔒 선행 단계를 먼저 완료해야 이 단계를 설정할 수 있습니다.
    </div>
  );
}
