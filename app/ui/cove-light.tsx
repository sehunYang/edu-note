/**
 * 코브 조명(간접등) 오버레이 — 순수 표시용 서버 컴포넌트(JS 0).
 * 스타일은 globals.css `.cove-light`(구조·색·숨쉬기·print 숨김) 참조.
 *
 * 마운트 목록(전 서비스 = 이 3곳, cove-lighting 계획 AC-6):
 *   1. app/(shell)/layout.tsx   — 교사 앱 전체(다크 인쇄실 룸 포함 — 의도됨)
 *   2. app/login/page.tsx       — 로그인
 *   3. app/p/[token]/page.tsx   — 학생 공개 페이지(정상·gone 분기)
 * 종이 출력 라우트(app/print/*)에는 절대 마운트하지 않는다. 새 최상위 표면을
 * 추가하면 이 목록을 갱신할 것 — 검증: grep -rl "CoveLight" app/ == 4파일.
 *
 * 배치 규칙: template.tsx 등 transform 애니메이션 조상 **바깥**에 두어야
 * position: fixed 앵커링이 깨지지 않는다.
 */
export function CoveLight() {
  return <div aria-hidden className="cove-light" />;
}
