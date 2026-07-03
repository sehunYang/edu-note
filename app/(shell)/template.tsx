/**
 * (shell) 콘텐츠 전환 (Stage 2-1). 셸 내부 페이지가 바뀔 때마다 재마운트되어
 * 콘텐츠만 fade-in-up 1회 재생한다. 루트가 아닌 (shell) 안에 있으므로 Stage 3의
 * 사이드바·글래스 헤더(레이아웃 소유)는 재마운트되지 않는다. reduced-motion 시엔
 * globals.css 전역 가드가 애니메이션을 무효화한다.
 */
export default function ShellTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="animate-fade-in-up">{children}</div>;
}
