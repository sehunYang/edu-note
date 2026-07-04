import { AppShell } from "@/app/ui/app-shell";

/**
 * (shell) 라우트 그룹 레이아웃.
 *
 * Stage 3-1: 앱 셸 장착 — 데스크톱 좌측 사이드바 + 글래스 스티키 헤더 + 모바일
 * 하단 탭바. 공개/인쇄 경로(/p·/login·/auth·/print)는 이 그룹 밖에 있어 셸 JS가
 * 실리지 않는다. 콘텐츠 전환(template.tsx fade)은 children 내부에서 그대로 동작한다.
 */
export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
