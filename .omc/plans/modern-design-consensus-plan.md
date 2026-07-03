# Edu_Note 모던 디자인 적용 — 합의 계획 (v3, 최종)

- 입력 명세: `.omc/specs/deep-interview-modern-design.md` (모호도 5.0%, PASSED)
- 상태: **✅ 합의 완료 (Architect REVISE→반영, Critic APPROVED) — pending approval (실행 승인 대기)**
- 모드: RALPLAN-DR short | 합의 이터레이션: 2회 (max 5)

## 계층 경계 규칙 (Architect 합의 사항)
**무상태 장식 → 전역 CSS** (press scale, focus ring, reduced-motion 가드, 페이지 크로스페이드) / **유상태 동작 → `Button` 컴포넌트** (loading, destructive). 이 경계는 의도적 설계다 — 향후 수정 시 어느 계층을 만질지는 이 규칙으로 판단한다.

## RALPLAN-DR Summary

### Principles (원칙)
1. **브랜드 보존**: xAI 다크 토큰(canvas/card/hairline/필 버튼/Pretendard·Geist Mono)은 불변 — 새 기술은 그 위에 얹는다.
2. **CSS-first**: 의존성 0을 기본값으로, 라이브러리는 CSS로 불가능한 지점에만 선별 도입.
3. **회귀 0**: 각 단계는 통합 테스트 전건(착수 전 실측 핀, 현 기록 ≈460) green + 빌드 green을 유지한 채로만 배포된다.
4. **단계별 출하**: 저위험→고위험 3단계, 각 단계는 독립적으로 가치 있고 되돌릴 수 있다.
5. **접근성 기본값**: reduced-motion·focus-visible·터치 타깃은 옵션이 아니라 기본이다.

### Decision Drivers (결정 동인)
1. 1인 실사용 프로덕션 — 깨지면 수업이 멈춘다 (안정성 > 속도)
2. 성능 예산 +15kb·transform/opacity 전용 (경량성)
3. Linear/Vercel 감각 — 절제·고속(150-200ms)·밀도 (품질 기준)

### Viable Options
**Option A (선택): CSS-first(무상태) + Button 컴포넌트(유상태) 전량 스윕**
- press·focus·reduced-motion·전환은 전역 CSS로 마크업 무수정 적용, 유상태(loading·destructive)는 `<Button>` 단일 소유자로 110곳/50파일 **기계적 스크립트 치환** 일괄 이관.
- Pros: **런타임 의존성 0**(+~5kb, 예산 내), 스윕이 검증된 스크립트 치환(1차 리디자인 전례)이라 기계적·diff 검토 가능, 상태 소유자가 한 곳.
- Cons: 50파일 기계적 diff 1회 — **구조적 중(中)위험**으로 등급 명시하며 저위험으로 부르지 않는다. 테스트 전건 + 치환 검증(아래)으로 게이트.

**Option B (기각): framer-motion 전면 + 버튼 수작업 컴포넌트 재작성**
- Pros: 표현력 최대, 일관성 강제. Cons: +30kb로 예산 2배 초과(Driver 2 위반), 스크립트 치환이 불가능한 **API 수준 수작업 재작성**이라 회귀 위험이 기계적 치환과 질적으로 다름(Driver 1 위반), 스프링 물리는 Linear 감각에 과함(Driver 3 부합도 낮음).
- **기각 근거**: 3개 동인 전부에 반한다. (A와 B의 차이는 "파일 수"가 아니라 **의존성 유무와 치환의 기계성**이다 — Critic Major #2 화해)

---

## Stage 1 — 토큰·버튼·표면 (저위험)

**1-1. 모션·상태 토큰 기반** — `tailwind.config.ts`
- `transitionDuration` 기본 150ms/200ms 토큰, `keyframes`: `fade-in-up`(8px·opacity), `scale-in`(0.96→1), `shimmer`.
- 신규 색: `glow: rgba(255,255,255,0.06)` 계열 표면 하이라이트.

**1-2. 전역 인터랙션 CSS** — `app/globals.css` `@layer base`
- `button:active:not(:disabled), [role="button"]:active { transform: scale(0.97); }` + 120ms transition — 전 버튼 press 촉감을 마크업 무수정으로.
- `:focus-visible { outline: 2px solid rgba(255,255,255,0.6); outline-offset: 2px; }` — 키보드 링.
- `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-duration:0.01ms !important; transition-duration:0.01ms !important; } }` — 전역 가드.
- 기존 `@media print` 블록(globals.css:41-53)에 `animation: none !important; transition: none !important;` 추가 — 인쇄에는 OS 설정과 무관하게 무모션 보장 (Critic Missing #3).

**1-3. 공유 버튼 프리미티브 신설 + 전량 스윕** — `app/ui/button.tsx` (신규, 앱 첫 공유 UI 디렉터리)
- `<Button variant="outline|solid|destructive" loading>`: loading 시 스피너(SVG, CSS spin)+라벨 유지, `disabled` 자동.
- **점진 채택이 아니라 전량 일괄 전환**: 버튼 관용구(`rounded-full border border-white/25`) 110곳/50파일을 1차 리디자인에서 검증된 스크립트 치환 방식으로 Stage 1에서 전부 `<Button>`으로 이관 — "이 press가 CSS에서 오나 컴포넌트에서 오나"의 2계층 모호성을 남기지 않는다 (Architect synthesis).
- destructive: 기존 `text-red-*` 삭제 버튼들을 `variant="destructive"`(red-400 텍스트 #f87171 + **red-500/40 보더**)로 동일 스윕에 포함. (⚠ 이 프로젝트의 red-300은 리매핑된 어두운 적갈색 #632b30이라 보더로 부적합 — tailwind.config.ts:48, Critic Minor #1)
- **치환 검증(구체화)**: 스윕 전후 `rounded-full border border-white/25` 관용구 개수(기준 110) 및 `<Button` 출현 수 grep 대조 — 합계 보존 확인. 잔존 관용구 0건이 스윕 완료 조건.
- 감사 1건: `overflow-hidden` 컨테이너 2곳([app/staffroom/page.tsx](app/staffroom/page.tsx))에 키보드 포커스 가능한 요소가 없는지 확인 (focus ring `outline-offset: 2px` 클리핑 방지).

**1-4. 표면 효과**
- 카드 호버 보더 하이라이트: `hover:border-white/20 transition-colors` — 카드 관용구(`rounded-lg border border-neutral-200`) 스크립트 치환.
- 헤로/허브 상단 라디얼 그라디언트 유틸: `bg-[radial-gradient(...)]` 토큰화(`.hero-glow`).
- 검증·배포: 빌드+460 테스트+번들 델타 측정(`next build` 출력 비교) → 커밋 → Vercel.

## Stage 2 — 모션 시스템

**2-0. `(shell)` 라우트 그룹 구조 이관 — 무시각변경 (확정 경로, Critic Major #1 해소)**
- Stage 2 첫 하위단계로 `app/(shell)/` 그룹을 생성하고 셸 대상 최상위 라우트 약 18개를 이동한다. **시각 변경 0** — 그룹 layout은 `{children}` 패스스루만. URL 불변, `@/` 별칭이라 임포트 안전.
- 게이트: 빌드 green + 통합 테스트 전건 green + 대표 URL 3곳 응답 확인. 구조 이동(중위험·기계적)과 셸 UI(고위험·Stage 3)를 분리해 순차 배포 원칙을 유지한다. ~~실행 시 판단~~ 문구 폐기 — 이 경로가 유일한 확정 경로다.

**2-1. 페이지·실 전환** — `app/(shell)/template.tsx` (신규; **루트 배치 금지** — Architect Rec 2, 2-0이 선행하므로 그룹은 이미 존재)
- 셸 내부 콘텐츠 슬롯만 감싸 `fade-in-up 180ms ease-out` 1회 — Stage 3에서 사이드바·글래스 헤더가 들어와도 크롬은 재마운트되지 않음.
- **명세 승계 노트**: 명세의 "View Transitions API 기반 크로스페이드"(구화면 아웃+신화면 인)를 **fade-in-up(신규 콘텐츠 등장만)으로 의미 변경**하여 승계한다 — Next 15.1에서 View Transitions는 실험 플래그 필요로 보류(근거는 본 문단으로 자족, 상세는 하단 ADR). 명세가 허용한 "라이브러리 1-2곳" 슬롯도 **의도적으로 0으로 소거**(CSS-only로 충분 판단, Stage 2 실측에서 아코디언 계단 현상 등 발견 시에만 재개방).
- `?semester` 등 쿼리 파라미터 내비([app/classroom/layout.tsx](app/classroom/layout.tsx) 55행 시맨틱)에서도 template이 재실행되어 페이드가 재생됨 — 180ms·8px의 절제 수준으로 **수용**한다(별도 게이트 없음).

**2-2. 등장 스태거** — 벤토 카드·주요 리스트 첫 로드
- `animation-delay: calc(var(--stagger-i) * 40ms)` 인라인 CSS 변수(index), 첫 8개 요소 한정. 대상: 허브 카드, [app/today/page.tsx](app/today/page.tsx) 위젯, 테이블 첫 페이지 행.

**2-3. 상호작용 모핑** (CSS-only)
- 아코디언: `grid-template-rows: 0fr→1fr` 200ms — 세팅실·사이드바 하위메뉴.
- 탭 인디케이터 슬라이드: 실 레이아웃 탭 4곳([app/classroom/layout.tsx](app/classroom/layout.tsx):44-54, clubroom, homeroom, setting).
  **⚠ 명시 선행 작업(Architect Rec 3)**: 현재 탭은 활성 상태 로직이 전혀 없는 plain `<Link>` — `usePathname` 기반 활성 감지 클라이언트 컴포넌트(`app/ui/tab-nav.tsx`) 신설이 필요하며, 이 신규 클라이언트 JS는 성능 예산에 계상한다. 이 로직 없이는 Stage 2-3이 독립 출하 불가.
- 모달 `scale-in`: 기존 `bg-black/40` 오버레이 모달 전부(+overlay fade).

**2-4. 수치 카운트업** — `app/ui/count-up.tsx` (신규, rAF 훅 ~1kb)
- 통계·진도 수치에 400ms 카운트업, 프로그레스바 width transition. `prefers-reduced-motion` 시 즉시 값 표시.
- 검증·배포: Stage 1과 동일 + reduced-motion 수동 확인.

## Stage 3 — 셸 + 벤토 허브 (고위험)

**3-1. 앱 셸** — `app/app-shell.tsx` + `app/layout.tsx` 통합
- 데스크톱(≥768px): 좌측 고정 사이드바 — 8공간(오늘·교실·담임·동아리실·세팅실·통계·교무실·허브 로고) + 하위 메뉴 아코디언(각 실 layout.tsx의 기존 탭 항목 이관), 접힘 토글(width transition).
- 모바일(<768px): 하단 탭바 — 허브·오늘·교실·담임·더보기(나머지 공간 드로어). `safe-area-inset-bottom` 패딩, 본문 `pb-16` 보정.
- 글래스 스티키 헤더: `sticky top-0 backdrop-blur-md bg-canvas/70 border-b border-hairline` — 페이지 제목+빵부스러기.
- **셸 제외는 route group `(shell)`로 확정** (pathname 분기 대안 폐기 — Architect Rec 1): 루트 [app/layout.tsx](app/layout.tsx):30는 현재 bare `<body>{children}</body>`라 html/폰트만 유지하고, `app/(shell)/layout.tsx`가 사이드바·헤더를 소유한다. 셸 대상 최상위 라우트 약 18개(today·classroom·homeroom·clubroom·setting·staffroom·stats·activities·sessions + 레거시 플랫 라우트들)를 `(shell)/`로 이동(URL 불변·`@/` 별칭이라 임포트 안전). `p/`·`login/`·`auth/`·`print/`는 그룹 밖에 남아 **셸 JS가 공개 학생 번들에 실리지 않는다** — pathname 분기로는 불가능한 보장. 미들웨어 모바일→/today 리다이렉트(middleware.ts:46-51 matcher와 경계 일치)는 무변경.
- 기존 실 상단 탭은 사이드바 하위메뉴로 대체하되, **Stage 3의 1차 릴리스**에서는 병존시키고 사용 확인 후 2차 릴리스에서 제거 (Critic 모호성 지적 명확화).

**3-2. 벤토 허브** — [app/page.tsx](app/page.tsx) 재구성
- 12-col 그리드 크기 차등: 오늘 시간표(대), 급식·공지(중), 신규 요약 통계(중), 실 바로가기(소, 사용빈도순).
- /today 위젯 재사용: [app/today/notice-widget.tsx](app/today/notice-widget.tsx)·급식·시간표 위젯을 공유 가능하게 export 정리(로직 무변경).
- 신규 통계 위젯: 주간 진도율·미기록 세특 수·상담 예약 현황 — 기존 쿼리 조합 우선, 부족 시 `lib/db/queries/`에 읽기 전용 집계 1-2개 추가(스키마 변경 없음).
- 검증·배포: 전 공간 내비 수동 점검 + 460 green + 모바일 뷰포트 확인.

## Acceptance Criteria (명세 승계)
- [ ] 통합 테스트 **전건** green + 빌드 green (단계마다; 착수 전 `RUN_DB_ITEST=1 … vitest run` 1회 실측으로 기준 개수 핀 고정 — 하드코딩 460에 의존 금지)
- [ ] First Load JS 증가 **경로별** +15kb 이내 (단계별 `next build` 출력 기록·비교, 셸 라우트 기준) **+ `/p/[token]` First Load JS 델타 ≈ 0** (셸 JS 미유입 증명 — Architect Rec 5). 헤드리스 라이브러리(Radix 등) 도입 시 예산 파기이므로 금지
- [ ] 모션 transform/opacity 전용 (grep 검증: `animation.*(width|height|top|left)` 0건, 프로그레스바 width는 GPU 예외로 문서화)
- [ ] reduced-motion 시 장식 모션 전부 비활성 (전역 가드 + count-up 분기)
- [ ] 모션 4지점·버튼 4상태·사이드바/탭바·벤토·글래스 헤더 각 렌더 확인
- [ ] 공개 학생 페이지 **및 로그인 페이지**에 버튼·표면·모션 적용, 셸 미적용 (명세 "전부 동일 적용" 승계 — Critic Missing #2)
- [ ] 인쇄(@media print)에서 장식 모션 무효 확인
- [ ] 3단계 각각 독립 커밋·배포·사용 확인

## Risks & Mitigations
| 위험 | 완화 |
|---|---|
| 셸 도입으로 전 페이지 레이아웃 회귀 | Stage 3 격리 + 기존 탭 병존 기간 + route group으로 공개/인쇄 경로 원천 분리 |
| backdrop-blur 저사양 성능 | blur 반경 ≤12px, 헤더 1곳 한정, `will-change` 미사용 |
| template.tsx 전환이 매 내비마다 발생해 피로감 | 180ms·8px 이동으로 절제, reduced-motion 가드 |
| 통계 위젯 신규 쿼리로 허브 로드 지연 | 기존 쿼리 재사용 우선, 신규 집계는 단일 count 쿼리로 제한, Suspense 스트리밍 |
| 버튼 스크립트 치환 부작용 | 1차 리디자인에서 검증된 관용구 치환 방식 + 단계 커밋으로 diff 리뷰 |
| 하단 탭바가 기존 하단 고정 요소와 충돌 | 전 화면 `pb` 보정 + 충돌 요소 grep 사전 조사 |

## ADR — 모던 디자인 적용 방식
- **Decision**: CSS-first 전역 훅(무상태) + `<Button>` 단일 소유(유상태) 전량 스윕, route group `(shell)` 구조 선행 이관(Stage 2-0, 무시각변경) 후 셸 UI(Stage 3), 페이지 전환은 template.tsx CSS fade-in-up.
- **Drivers**: 1인 프로덕션 안정성(회귀 0) > 성능 예산(+15kb 경로별, `/p` 델타 ≈ 0) > Linear/Vercel 감각.
- **Alternatives considered**: ① framer-motion 전면+수작업 컴포넌트 재작성(기각 — 예산 2배·수작업 회귀 위험·과한 스프링 물리), ② View Transitions API(보류 — Next 15.1 실험 플래그 필요, 안정화 시 template 방식에서 무파괴 전환 가능), ③ pathname 분기 셸(기각 — 공개 번들에 셸 JS 유입).
- **Why chosen**: 의존성 0을 유지하면서 상태 소유권을 한 곳(Button)에 두고, 치환의 기계성(스크립트+grep 대조)으로 50파일 스윕의 위험을 게이트할 수 있는 유일한 조합.
- **Consequences**: (+) 공개 페이지 번들 무영향 보장, 단계별 롤백 가능. (−) 라우트 디렉터리 ~18개 이동으로 git 이력 이동 1회, 크로스페이드가 아닌 등장 모션으로 명세 대비 의미 축소, 탭 활성 로직 신규 클라이언트 JS 발생.
- **Follow-ups**: View Transitions 안정화 시 재평가, 아코디언 CSS 계단 현상 Stage 2 실측 확인, 병존 탭 제거(Stage 3 2차 릴리스).

## Changelog
- **v3 (Critic REVISE 반영)**: [Major#1] Stage 2-0 신설 — `(shell)` 그룹 구조 이관을 무시각변경 하위단계로 확정, "실행 시 판단" 폐기. [Major#2] Option A/B 비교를 "의존성 유무·치환의 기계성"으로 정직화, 버튼 스윕을 구조적 중위험으로 재등급 + grep 대조 검증법 명시. [Minor] destructive 보더 red-300/25→red-500/40(리매핑 스케일 #632b30 오독 교정), ADR 섹션 신설(dangling 참조 해소), 테스트 개수 하드코딩 제거(실측 핀), 크로스페이드→fade-in-up 의미 전환 명기, 0-라이브러리 의도 명기, 로그인 AC 명시, 인쇄 무모션 가드 추가, 베이스라인 캡처 0단계 신설, "1단계 병존"→"Stage 3 1차 릴리스" 명확화.
- **v2 (Architect REVISE 반영)**: ① route group `(shell)` 확정·pathname 분기 폐기(공개 번들 보호) ② template.tsx를 `(shell)` 콘텐츠 슬롯으로 이동, `?semester` 재생은 수용으로 결정 ③ 탭 활성 로직(`app/ui/tab-nav.tsx`, usePathname) 명시 작업화·예산 계상 ④ 버튼 스윕 점진→110곳 전량 일괄로 변경, 계층 경계 규칙 문서화, overflow-hidden 감사 추가 ⑤ 예산을 경로별로 재정의(+`/p` 델타 ≈ 0), 헤드리스 라이브러리 금지 명문화.

## Verification Steps
0. **베이스라인 캡처(Stage 1 착수 전 필수)**: 변경 전 `npm run build`의 경로별 First Load JS 스냅샷 + `RUN_DB_ITEST=1 vitest run` 실측 테스트 개수를 `.omc/state/modern-design-baseline.md`에 기록 — 이후 모든 델타 비교의 기준점.
1. 각 단계: `npm run build` exit 0 + First Load JS 델타 기록(0단계 기준 대비)
2. `RUN_DB_ITEST=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run` 전건 green (0단계 실측 핀 기준)
3. reduced-motion: DevTools 에뮬레이션으로 스태거·카운트업·전환 비활성 확인
4. 모바일(375px)·데스크톱(1280px) 뷰포트에서 셸·탭바·벤토 렌더 확인
5. 공개 페이지 토큰 링크로 버튼 로딩·press 동작 확인
