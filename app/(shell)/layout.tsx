/**
 * (shell) 라우트 그룹 레이아웃.
 *
 * Stage 2-0: 구조 이관만 — children 패스스루(시각 변경 0). 사이드바·글래스
 * 헤더 등 실제 셸 UI는 Stage 3에서 이 레이아웃에 추가한다. 공개/인쇄 경로
 * (/p·/login·/auth·/print)는 이 그룹 밖에 있어 셸 JS가 실리지 않는다.
 */
export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
