# Deep Interview Spec: 간접등(코브 조명) 효과 강화 + 전 서비스 적용

## Metadata
- Interview ID: di-cove-light-2026-07-17
- Rounds: 8 (+Round 0 토폴로지)
- Final Ambiguity Score: 4.3%
- Type: brownfield
- Generated: 2026-07-17
- Threshold: 0.05
- Threshold Source: user explicit override ("모호도 5% 미만", settings 부재로 기본 0.2 대체)
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.97 | 0.35 | 0.34 |
| Constraint Clarity | 0.95 | 0.25 | 0.24 |
| Success Criteria | 0.95 | 0.25 | 0.24 |
| Context Clarity | 0.95 | 0.15 | 0.14 |
| **Total Clarity** | | | **0.957** |
| **Ambiguity** | | | **4.3%** |

## Topology
| Component | Status | Description | Coverage |
|-----------|--------|-------------|----------|
| 간접등 효과 강화 | active | 현 hero-glow를 '턱+새어나오는 빛' 구조의 실감나는 코브 조명으로 재설계 | AC-1~5 전부 커버 |
| 전 서비스 적용 | active | 강화된 효과를 교사 앱·로그인·학생 페이지 전체에 일관 적용 | AC-6~8 커버 |

## Goal
현재 홈에만 있는 은은한 상단 글로우(`.hero-glow`)를 **실제 코브(간접등) 조명 구조를 재현한 효과**로 재설계한다: 화면 최상단에 광원을 가리는 몰딩(턱) 실루엣이 있고, 그 아래로 **따뜻한 전구색 빛이 다층으로 은은하게 새어나오는** 구성. 이 효과는 **뷰포트에 고정**되어 스크롤해도 실제 방의 천장처럼 항상 화면 위에 머물고, **미세한 숨쉬기**(느린 주기의 밝기 변화)로 살아있는 공간감을 준다. 인쇄를 제외한 **서비스 전체**(교사 앱 전 화면 + 로그인 + 학생 공개 페이지, 데스크톱·모바일)에 일관 적용한다.

## Constraints
- **간접등의 본질 유지**: 광원 자체는 절대 노출하지 않음 — 빛은 반드시 턱 아래에서 "새어나오는" 형태. 밝기는 적당히만 상향(직접광처럼 보이면 실패). "위로는 새까맣게"는 배경(#0a0a0a)이 자연 충족.
- **색**: 따뜻한 전구색(웜 앰버 힌트, 2700~3000K 인상) — 앱 시그니처(아이콘 배지 #2A2110/#EFD34D, 넛지 앰버)와 동계열. 순백색 금지.
- **뷰포트 고정**: `position: fixed` 오버레이(또는 동등 기법) — 스크롤과 무관하게 화면 상단 상주. 콘텐츠 가림·클릭 방해 금지(pointer-events 없음), 헤더(글래스 헤더)와 자연 공존.
- **미세한 숨쉬기**: ≥10초 주기의 아주 느린 밝기 변화. `prefers-reduced-motion` 시 정지(기존 전역 가드 존재 — globals.css:112). 성능 영향 최소(GPU 합성 가능한 속성만).
- **적용 범위**: 교사 앱 전 화면 + `/login` + `/p/[token]`(학생, 모바일 4탭). **인쇄 페이지 제외**(기존 print media 규칙이 배경 강제 제거 — globals.css:123 확인, 오버레이도 print에서 숨김).
- **기존 정책 불변**: no-shadow 브랜드 원칙(빛은 배경 그라디언트/오버레이로, box-shadow 아님), 보안 헤더·성능 작업 무영향.

## Non-Goals
- 카드/요소별 개별 간접등 (R1에서 명시 기각 — 페이지 천장만)
- 페이지별 다른 색 (R3 기각 — 전 표면 동일 웜 톤)
- 라이트 모드 대응 (앱은 다크 전용)
- 인쇄 페이지 적용

## Acceptance Criteria
- [ ] AC-1 화면 최상단에 코브 구조 렌더: 어두운 몰딩(턱) 경계 + 그 아래로 다층(2~3겹) 웜 그라디언트 빛 — 광원 직접 노출 없음
- [ ] AC-2 빛 색상이 웜 앰버 계열(순백 아님), 배경 #0a0a0a와 자연스럽게 소멸
- [ ] AC-3 오버레이는 뷰포트 고정 — 긴 페이지(세팅실 등) 스크롤 시에도 화면 상단 상주, 콘텐츠 클릭/가독성 방해 없음(pointer-events: none)
- [ ] AC-4 미세한 숨쉬기 애니메이션(주기 ≥10초, 미세한 opacity 변화만) + prefers-reduced-motion 시 정지
- [ ] AC-5 기존 `.hero-glow`(홈 1곳)는 새 효과로 대체·제거 — 중복 광원 없음
- [ ] AC-6 적용 표면: (shell) 레이아웃 전 화면 + /login + /p/[token] — 데스크톱·모바일 모두. 인쇄(@media print 및 /print 라우트)에서는 완전 숨김
- [ ] AC-7 **후보 갤러리 게이트(사용자 선정)**: 강도·턱 경계 표현(또렷/부드러움)이 다른 후보 2~3안을 로컬 렌더 스크린샷 갤러리(Artifact)로 제시 → 사용자 선택·피드백 반복 → 확정본만 배포
- [ ] AC-8 typecheck/test/build 그린 + 배포 후 실기기(데스크톱·모바일) 확인(사용자 게이트)

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 요소별 광원일 것 | 턱이 어디에 있나? (R1) | 페이지 천장만 |
| 모든 페이지=교사 앱만 | 표면 4종 제시 (R2) | 학생 페이지까지 전부(인쇄 제외) |
| 순백색 유지 | 집 간접등은 웜톤 (R3) | 따뜻한 전구색 |
| 더 강조=더 밝게 | Contrarian: 직접광화 위험 (R4) | 구조 재현(턱+다층 빛), 밝기는 적당히 |
| 스크롤 따라 사라져도 됨 | 실제 천장은 고정 (R5) | 뷰포트 고정 |
| 정적이 당연 | 화면에선 숨쉬기가 공간감 (R7) | 미세한 숨쉬기 채택 |

## Technical Context (brownfield)
- 현 효과: `.hero-glow`(app/globals.css:57) = `radial-gradient(ellipse 80% 40% at 50% 0%, rgba(255,255,255,0.06), transparent 70%)`, 홈(`app/(shell)/page.tsx`) `<main>` 1곳 사용 — 문서 부착(스크롤 시 소멸), 순백.
- 적용 지점 3곳: `app/(shell)/layout.tsx`(교사 앱 전체), `app/login/`(루트 레이아웃 경유 가능), `app/p/[token]/`(학생). 루트 `app/layout.tsx`에 넣으면 3곳 일괄 커버 가능하나 **인쇄 라우트(/print) 제외 필요** — @media print 숨김 + /print 라우트 처리 확인.
- reduced-motion 전역 가드 존재(globals.css:112-120), print 배경 제거 규칙 존재(:123-137).
- 글래스 헤더(app/ui/glass-header.tsx) 존재 — fixed 오버레이와 z-order 공존은 후보 스크린샷에서 검증.
- 후보 스크린샷 도구: playwright-core(+로컬 Chrome, 설치됨) — /login은 미인증 렌더 가능해 후보 검증 표면으로 적합.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| 코브 조명 오버레이 | core domain | fixed, 웜 앰버, 다층 그라디언트, 숨쉬기 | 모든 표면 위에 상주 |
| 몰딩(턱) 실루엣 | core domain | 최상단 어두운 경계 | 광원을 가림, 빛의 시작점 |
| 적용 표면 | supporting | shell 전체, login, /p (인쇄 제외) | 오버레이를 마운트 |
| 후보 갤러리 게이트 | supporting | 강도·경계 축 2~3안 | 배포 전 사용자 선정 |
| 숨쉬기 애니메이션 | supporting | ≥10s 주기, opacity만, reduced-motion 정지 | 오버레이에 적용 |

## Ontology Convergence
| Round | Count | New | Changed | Stable | Stability |
|-------|-------|-----|---------|--------|-----------|
| 1 | 3 | 3 | - | - | N/A |
| 2 | 3 | 0 | 0 | 3 | 100% |
| 3 | 4 | 1(색온도) | 0 | 3 | 75%→100% 수렴 |
| 4 | 5 | 1(턱 실루엣) | 0 | 4 | 100% |
| 5 | 6 | 1(스크롤 거동) | 0 | 5 | 100% |
| 6 | 7 | 1(검증 게이트) | 0 | 6 | 100% |
| 7 | 8 | 1(숨쉬기) | 0 | 7 | 100% |
| 8 | 8 | 0 | 0 | 8 | 100% (확정) |

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds + R0)</summary>

**R0 토폴로지:** 2컴포넌트(효과 강화/전 페이지 적용) → "맞습니다"
**R1 광원 위치:** → "페이지 천장만 강화" (52%)
**R2 적용 범위:** → "학생 페이지까지 전부" (41%)
**R3 빛 색:** → "따뜻한 전구색" (33%)
**R4 ⚡Contrarian 실감의 정체:** 더 밝게=직접광화 위험 → "구조 재현(턱+다층)" (26%)
**R5 스크롤 거동:** → "뷰포트 고정" (20%)
**R6 🔪Simplifier 검증:** → "후보 스크린샷 비교(갤러리 게이트)" (9.5%)
**R7 동적성:** → "미세한 숨쉬기" (6.5%)
**R8 종합 확인:** 5개 결정 요약 → "이대로 확정" (4.3% ✅)
</details>
