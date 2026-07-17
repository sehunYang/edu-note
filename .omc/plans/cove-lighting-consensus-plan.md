# 간접등(코브 조명) 효과 강화 + 전 서비스 적용 계획

**Status:** pending approval (consensus / RALPLAN-DR short mode)
**Date:** 2026-07-17
**Input Spec:** `.omc/specs/deep-interview-cove-lighting.md` (모호도 4.3%, PASSED)

---

## 요구사항 요약

현 홈 전용 `.hero-glow`(순백 6% 라디얼)를 **실제 코브 조명 구조를 재현한 효과**로 재설계: 화면 최상단 몰딩(턱) 실루엣 + 그 아래로 새어나오는 **따뜻한 전구색 다층 빛**. **뷰포트 고정**(스크롤 무관 상주) + **미세한 숨쉬기**(≥10s 주기, reduced-motion 정지). 적용 = 교사 앱 전 화면 + 로그인 + 학생 공개 페이지(데스크톱·모바일), **인쇄 제외**. 합격 판정 = **후보 2~3안 스크린샷 갤러리 → 사용자 선정** 게이트.

### 핵심 코드 사실
- 현 효과: `.hero-glow`(`app/globals.css:57-63`) — 홈(`app/(shell)/page.tsx`) `<main>` 1곳. 문서 부착(스크롤 시 소멸)·순백 — 전면 대체 대상.
- 마운트 지점: `/p/[token]`은 **자체 layout 없음**(page.tsx가 정상/gone/notFound 3분기 직접 반환 — 공통 최상위 요소 없음) → 3곳 마운트: `app/(shell)/layout.tsx`, `app/login/page.tsx`, `app/p/[token]/page.tsx`(각 분기 트리에 삽입, notFound 404는 미적용 — 수용).
- **인쇄 제외의 확정 해석(스펙 R2 근거)**: 제외 대상 = **종이 출력 표면**(`app/print/*` 미리보기 + 모든 화면의 @media print). 인쇄실 룸(`app/(shell)/print/*`)은 **다크 룸 UI로서 교사 앱의 일부 → 코브 적용**(화면), 인쇄 시에만 숨김. ⚠ 정정: `app/print/*`도 **화면에선 다크**(라이트는 @media print에서만) — 제외 근거는 배경색이 아니라 "종이 출력 의미론"임.
- **루트 마운트 대안(Option B) 정정**: `usePathname` 없이도 zero-JS 루트 마운트 가능(@media print + 선택적 `:has()` 마커) — 기각은 강제가 아닌 **의도적 트레이드오프**(구조적 print 확실성 > 커버리지 자동성). 3곳 마운트의 누락 위험(R6)은 grep 검증으로 방어.
- 글래스 헤더: `sticky top-0 z-40 backdrop-blur`(`app/ui/glass-header.tsx:16`) — 오버레이 z를 그 아래(z-10)로 두면 헤더 블러가 빛을 자연스럽게 덮음(천장 아래 헤더 느낌). 모달은 z-50.
- ⚠ **print 함정**: 전역 print 규칙(`globals.css:127`)은 `background-color`만 transparent 강제 — **그라디언트는 background-image라 잔존**. `.cove-light { display: none }`을 `@media print`에 명시해야 함(마운트 제외와 이중 방어).
- reduced-motion 전역 가드 존재(`globals.css:112-120`) — 애니메이션 duration 0.01ms 강제 → 숨쉬기 자동 정적화.
- 스크린샷 도구: playwright-core + 로컬 Chrome 설치됨(이전 세션 검증) — `/login`은 미인증 렌더 가능해 후보 검증 표면으로 적합.

---

## RALPLAN-DR 요약 (short mode)

### Principles
1. **광원 은닉이 본질**: 빛은 항상 턱 아래에서 새어나온다 — 광원 노출·직접광화는 실패. 밝기보다 구조.
2. **단일 컴포넌트 + 순수 CSS**: `<CoveLight />` 1개 + globals.css 클래스. 런타임 JS 0, 애니메이션은 opacity만(컴포짓 전용).
3. **콘텐츠 무해성**: `pointer-events: none`, z-10(헤더 z-40·모달 z-50 아래). 가독성 훼손되는 후보는 탈락.
4. **사용자 게이트 우선**: 강도·경계 표현 축 후보 2~3안 갤러리 → 선정 후에만 배포.
5. **인쇄 절대 침범 금지**: 마운트 구조 제외 + `@media print` display:none 이중 방어.

### Decision Drivers (top 3)
1. 간접등의 절제 미학 — 사용자가 명시한 취향의 충실 재현.
2. 전 표면 일관성 — 서비스 어디서나 같은 천장.
3. 성능·접근성 무회귀 — 기존 지연 개선·reduced-motion 정책 보존.

### Viable Options
#### Option A — fixed 오버레이 div + globals.css 다층 그라디언트, 3곳 마운트 (**선정**)
- **Pros:** 뷰포트 고정·숨쉬기·다층 구조 전부 자연 구현, JS 0, 인쇄 구조 제외 확실, 후보 튜닝이 CSS 값 교체만.
- **Cons:** 마운트 3곳 유지(신규 표면 추가 시 기억 필요 — 주석으로 완화).
#### Option B — 루트 layout 1곳 마운트 + usePathname 분기로 /print 제외
- **Pros:** 마운트 1곳.
- **Cons:** 클라이언트 JS 필요(원칙 2 위반), 경로 문자열 분기는 새 print성 라우트 추가 시 조용히 누락(원칙 5 위반 위험). **기각.**
#### Option C — 현 방식 확장(각 페이지 background-image)
- **Cons:** background-attachment: fixed는 iOS Safari 비호환·성능 문제 → 뷰포트 고정 불가, 숨쉬기 구현 곤란. **기각.**

---

## 수용 기준 (스펙 AC-1~8 상속·매핑)

- **AC-1 (구조)** `.cove-light`: 최상단 얇은 몰딩 실루엣(배경 #0a0a0a보다 어두운 순흑 바, ~6-10px) + 바로 아래 밝은 웜 심(seam) + 30~45vh에 걸친 부드러운 다층 falloff. 광원 원형 노출 없음.
- **AC-2 (색)** 웜 앰버 계열(rgb 대역: R 255, G 185~215, B 110~160), seam 최대 불투명도 0.10~0.18 범위 내 후보 튜닝. 순백 금지.
- **AC-3 (거동)** `position: fixed; inset: 0 0 auto 0; pointer-events: none; z-index: 10` — 긴 페이지 스크롤 시 상주, 클릭·선택 방해 없음, 헤더(z-40)가 위에 페인트.
- **AC-4 (숨쉬기)** **기본 상태 = 최대 밝기 고정**: `.cove-light { opacity: 1 }` + `@keyframes cove-breathe { 0%,100% { opacity: 1 } 50% { opacity: 0.85 } }`, 주기 12~16s ease-in-out infinite. — reduced-motion 가드(iteration-count:1 강제, fill 기본값)가 적용되면 애니메이션 종료 후 **기본 opacity로 복귀**하므로 기본을 1로 두어야 흐린 상태로 얼어붙지 않음(Architect P1 — dim-freeze 방지).
- **AC-5 (대체)** 홈 `hero-glow` 클래스 사용 제거 + `.hero-glow` 정의 삭제(사용처 0 확인 후) — 중복 광원 없음.
- **AC-6 (범위)** `<CoveLight />` 마운트: `app/(shell)/layout.tsx`(**배치 필수 규칙**: `<><CoveLight /><AppShell>{children}</AppShell></>` — template.tsx의 `animate-fade-in-up` transform 조상 **바깥**이어야 fixed 앵커링이 깨지지 않음, Critic RC4) + `app/login/page.tsx` + `app/p/[token]/page.tsx`(정상·gone 분기 각각). `app/print/*`(종이 출력)에는 구조적 미마운트 + `@media print { .cove-light { display: none !important } }` 명시(그라디언트=background-image라 기존 print 규칙 미적용 — 필수). **`app/(shell)/print/*`(다크 인쇄실 룸)은 화면에서 코브 적용이 의도된 동작**(RC3 확정 해석 — 검증에서 존재를 확인해 가시화).
- **AC-7 (게이트 1, 검증 범위 명시 — RC1/RC2 반영)** 후보 2~3안 각각 로컬 `next start`의 `/login`에서 데스크톱(1280×800)·모바일(390×844) 스크린샷 → base64 임베드 갤러리 Artifact → 사용자 선정·피드백 반복 → 확정본만 남김.
  - **게이트 1이 검증하는 것**: 빛의 모양·색·강도·턱 경계 표현 + 상단 인접 텍스트 가독성(/login 폼·제목).
  - **게이트 1이 검증 못하는 것(정직하게 게이트 2로 이관)**: ①글래스 헤더 블러와의 상호작용(/login·/p 모두 헤더 없음 — shell 화면은 인증 필요) ②실제 학생 페이지(/p는 DB 시드 토큰 필요 + 실데이터 스크린샷 회피) → **배포 후 사용자 본인 브라우저에서 즉시 확인·피드백으로 재조정**(아이콘 프로세스처럼 반복 가능).
  - 후보 축 정의(RC5): `--cove-seam-alpha`(0.10~0.18) + `--cove-edge` = **seam 그라디언트 전이 폭(px)** — 후보 A(부드러움): 40~60px, 후보 B(또렷): 8~16px.
- **AC-8 (검증)** typecheck/test/build 그린 + 배포 후 실기기(데스크톱·모바일, 교사 앱/학생 페이지) 확인(게이트 2, 사용자).

## 구현 단계

### 1. CSS — `app/globals.css`
- `@layer utilities`에 `.cove-light` 추가: 컨테이너(fixed/inset/height/pointer-events/z-10) + `::before`(몰딩 바) + 다층 그라디언트 배경 + `animation: cove-breathe`.
- `@keyframes cove-breathe` 정의(globals 하단, tailwind.config 수정 불필요).
- `@media print` 블록에 `.cove-light { display: none !important; }` 추가.
- `.hero-glow` 정의 삭제(5단계에서 사용처 제거 후).

### 2. 컴포넌트 — `app/ui/cove-light.tsx` (신규, 서버 컴포넌트)
- `<div aria-hidden className="cove-light" />` 만 반환. 주석에 "새 최상위 표면 추가 시 여기 마운트 목록 갱신" 명시(Option A cons 완화).

### 3. 마운트 3곳
- `app/(shell)/layout.tsx`: children 앞에 `<CoveLight />`.
- `app/login/page.tsx`: 페이지 루트에 추가.
- `app/p/[token]/page.tsx`: 정상 뷰·gone 뷰 공통 지점에 추가(page 분기 상단).

### 4. 후보 제작 (게이트 1 준비)
- 후보 A: 부드러운 경계 + 중간 강도(seam α≈0.12) / 후보 B: 또렷한 심 라인 + 중간 강도 / 후보 C: 사용자 반응 보고 A 또는 B의 강화판(α≈0.16~0.18).
- CSS 변수(예: `--cove-seam-alpha`, `--cove-edge`)로 후보 전환을 값 교체만으로.

### 5. hero-glow 대체
- `app/(shell)/page.tsx`에서 `hero-glow` 클래스 제거. grep으로 사용처 0 확인 후 CSS 정의 삭제.

### 6. 검증 8a (자동, 게이트 전)
- typecheck/test/build 그린.
- 로컬 `next start` DOM 검증: `/login`에 `.cove-light` **존재**, `app/print/*` 경로(예: /print/roster — 미인증 접근성 확인 후) DOM에 **부재**, `(shell)/print` 인쇄실 룸은 shell 마운트 상속으로 **존재**(RC3 의도 동작의 가시화 — 인증 필요 시 코드 경로 확인으로 대체).
- **마운트 카운트 검증(Architect P2/R6)**: `grep -rl "CoveLight" app/ | sort` == 정확히 4파일(컴포넌트 + 3 마운트) — 초과/미달 시 실패 처리.

### 7. 게이트 1 — 후보 갤러리
- playwright-core(채널 chrome, headless)로 후보별 `/login` 데스크톱·모바일 스크린샷 → 갤러리 HTML(Artifact, base64 임베드) 게시 → 사용자 선정·피드백 반복(아이콘 프로세스 동일).

### 8. 확정 후 마무리
- 확정 후보만 남기고 정리 → 최종 typecheck/test/build → (실행 승인 흐름에 따라) 커밋·배포 → 게이트 2(실기기, 사용자).

## 위험 및 완화

| 위험 | 완화 |
|---|---|
| R1: 상단 콘텐츠 가독성 저하(오버레이가 콘텐츠 위 페인트) | seam α 상한 0.18 + 후보 갤러리를 실제 텍스트 있는 /login 폼으로 검증(원칙 3: 훼손 후보 탈락) |
| R2: 모바일에서 falloff 과다 | 후보 스크린샷에 모바일 뷰포트 필수 포함, 필요시 높이 vh→px 혼합 조정 |
| R3: 인쇄에 그라디언트 잔존 | background-image는 기존 print 규칙 미적용(실측) → `.cove-light{display:none}` 명시 + 마운트 구조 제외 이중 방어 |
| R4: 숨쉬기 리페인트 비용 | opacity만 애니메이트(컴포짓 전용), will-change 미사용 |
| R5: 학생 페이지 4탭 UX 간섭 | 모바일 후보 검증 + 배포 후 실기기 게이트에서 /p 확인 |
| R6: 마운트 누락(미래 신규 표면) | cove-light.tsx 주석에 마운트 목록 명시 |

## 검증 단계
1. typecheck/test/build (자동)
2. `/login` DOM에 오버레이 존재 + print 라우트 부재 확인 (자동)
3. 후보 갤러리 → 사용자 선정 (게이트 1)
4. 배포 후 실기기 확인 (게이트 2, 사용자)

---

## ADR
- **Decision:** 순수 CSS fixed 오버레이(`<CoveLight />` + `.cove-light`)로 코브 조명을 재현하고 3개 최상위 표면에 구조적으로 마운트한다. 후보 2~3안 갤러리 게이트로 강도·경계를 사용자가 확정한다.
- **Drivers:** 절제 미학 충실 재현 > 전 표면 일관성 > 성능·접근성 무회귀.
- **Alternatives considered:** (B) 루트 마운트+pathname 분기 — JS 필요·print 누락 위험, 기각. (C) background-image 확장 — 뷰포트 고정 불가(iOS), 기각.
- **Why chosen:** 뷰포트 고정·다층 구조·숨쉬기·인쇄 제외라는 4개 제약을 전부 자연 충족하는 유일한 구조이며, 후보 튜닝이 CSS 값 교체만으로 가능해 갤러리 게이트와 궁합이 최적.
- **Consequences:** 마운트 지점 3곳 유지 필요(주석 완화). 오버레이가 콘텐츠 위에 페인트되므로 α 상한 규율 필수. hero-glow는 완전 대체·삭제.
- **Follow-ups:** (1) 선정 후보의 α·높이를 CSS 변수로 남겨 미래 미세조정 용이화. (2) 필요시 페이지 하단 바닥 반사광(2차 간접등) 검토는 별도 사이클.

## 변경 이력
- Planner 초안.
- **Consensus 반영 (Architect SOUND-WITH-CONCERNS + Critic REJECTED→요구사항 전부 충족):**
  - Architect P1a: dim-freeze 방지 — 기본 opacity 1 고정, 키프레임 0/100%=1·50%=0.85 (AC-4).
  - Critic RC1+RC2: 게이트 1 범위 정직화 — /login이 검증하는 것/못하는 것 명시, 헤더 블러·학생 페이지는 게이트 2(배포 후 본인 브라우저)로 이관. /p 시드 토큰 요구·실데이터 스크린샷 회피 근거 기록 (AC-7).
  - Critic RC3: "인쇄 제외" 확정 해석 — 종이 출력 표면만(스펙 R2의 사용자 표현 근거). 다크 인쇄실 룸은 코브 적용이 의도 동작, 검증에서 가시화 (AC-6, 검증 8a).
  - Critic RC4: 마운트 배치 규칙 — CoveLight는 template transform 조상 밖(`<><CoveLight/><AppShell>…`) (AC-6).
  - Critic RC5: `--cove-edge` = seam 전이 폭(px), 후보 A 40~60 / B 8~16 정의 (AC-7).
  - Architect P2: R6 방어를 주석→grep 마운트 카운트 검증으로 격상 (검증 8a). print 라우트 "라이트 배경" 오기 정정 + Option B 기각을 의도적 트레이드오프로 재서술 (코드 사실/ADR).
