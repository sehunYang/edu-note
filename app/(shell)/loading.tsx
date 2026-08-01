/**
 * (shell) 공통 로딩 스켈레톤 (지연 개선 ④ — 스트리밍 내비게이션).
 *
 * 이 파일이 있으면 (shell) 하위 어떤 경로로 이동하든 서버 데이터가 준비되기 전에
 * 셸(사이드바·헤더)은 유지된 채 콘텐츠 영역에 즉시 스켈레톤이 뜬다 — "클릭했는데
 * 반응이 없는" 체감을 제거한다. 각 페이지가 자체 `mx-auto max-w-*` 컨테이너를
 * 가지므로 여기서도 중립적인 중앙 컨테이너 폭을 쓴다.
 */
export default function ShellLoading() {
  return (
    <div
      className="animate-pulse"
      aria-busy="true"
      aria-label="불러오는 중"
    >
      {/* 페이지 제목 + 설명 자리 */}
      <div className="h-7 w-44 rounded-md bg-neutral-200" />
      <div className="mt-3 h-4 w-72 max-w-full rounded bg-neutral-100" />

      {/* 카드/섹션 자리 */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="h-36 rounded-xl border border-neutral-200 bg-neutral-100" />
        <div className="h-36 rounded-xl border border-neutral-200 bg-neutral-100" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-10 rounded-lg border border-neutral-200 bg-neutral-100" />
        <div className="h-10 rounded-lg border border-neutral-200 bg-neutral-100" />
        <div className="h-10 rounded-lg border border-neutral-200 bg-neutral-100" />
      </div>
    </div>
  );
}
