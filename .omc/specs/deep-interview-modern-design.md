# Deep Interview Spec: Edu_Note 최신 디자인 기술 적용 (모션·버튼·레이아웃·표면)

## Metadata
- Interview ID: di-design-modern-2026-07-03
- Rounds: 12 (토폴로지 게이트 1 + 본 인터뷰 11)
- Final Ambiguity Score: 5.0%
- Type: brownfield
- Generated: 2026-07-03
- Threshold: 0.05
- Threshold Source: user prompt ("모호도 5%까지 반복"; settings 미설정으로 기본값 0.2 대체)
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.33 |
| Constraint Clarity | 0.95 | 0.25 | 0.24 |
| Success Criteria | 0.95 | 0.25 | 0.24 |
| Context Clarity | 0.95 | 0.15 | 0.14 |
| **Total Clarity** | | | **0.95** |
| **Ambiguity** | | | **5.0%** |

## Topology
| Component | Status | Description | Coverage |
|-----------|--------|-------------|----------|
| 모션/마이크로인터랙션 | active | 페이지·실 전환, 리스트/카드 등장 스태거, 상호작용 모핑, 수치 카운트업·프로그레스 | R3(수단)·R8(지점)·R7(기준) 확정 |
| 버튼·인터랙티브 고도화 | active | 로딩·진행 상태, press 촉감, focus-visible 링, destructive 구분 | R6 확정(4종 전부) |
| 레이아웃 현대화 | active | 전역 사이드바 셸(데스크톱) + 하단 탭바(모바일) + 메인 허브 벤토 대시보드 | R2(범위)·R5(모바일)·R9(벤토)·R12(내비 항목) 확정 |
| 표면·시각 효과 | active | 미묘한 그라디언트·보더 글로우 + 글래스(블러) 스티키 헤더 | R4 확정 |

## Goal
Edu_Note(xAI 다크 브랜드 적용 완료 상태)를 **Linear/Vercel 대시보드 감각**으로 고도화한다:
1. **모션**: 현재 0인 모션을 4개 지점에 도입 — (a) 페이지·실 전환(View Transitions API 기반 크로스페이드), (b) 대시보드 카드·테이블 행 등장 스태거(초기 로드 1회), (c) 상호작용 모핑(아코디언 펼침, 탭 인디케이터 슬라이드, 모달 스케일인, 사이드바 접힘), (d) 통계 수치 카운트업·프로그레스바 채움.
2. **버튼**: 전 버튼에 4종 상태 시스템 — 저장 중 스피너+라벨 변경, active scale(≈0.97)+밝기 press 촉감, 흰색 오프셋 focus-visible 링, destructive(삭제·회수) 빨간 계열 일관 구분.
3. **레이아웃**: 전역 사이드바 셸(데스크톱 ≥768px, 전체 8공간+하위 메뉴 아코디언) + 하단 탭바(모바일, 사용빈도 기준: 허브·오늘·교실·담임+더보기) + 메인 허브를 벤토 대시보드로(기존 /today 위젯 재사용 + 요약 통계 위젯 신규 + 실 바로가기 카드 크기 차등).
4. **표면**: 카드 호버 보더 하이라이트·헤로 라디얼 그라디언트 등 Vercel식 절제된 포인트 + 스크롤 시 backdrop-blur 글래스 스티키 헤더.

## Constraints
- **구현 수단**: CSS 우선(Tailwind transition/keyframes + View Transitions API). 라이브러리는 복잡한 모핑 1-2곳에만 선별 도입.
- **성능 예산**: 번들 증가 +15kb 이내. 모션은 transform/opacity만 사용(리플로우 유발 속성 금지).
- **접근성**: `prefers-reduced-motion` 시 모든 장식 모션 비활성.
- **브랜드 경계**: xAI 다크 토큰(canvas #0a0a0a·card #191919·헤어라인·필 버튼·Pretendard/Geist Mono) 유지. 표면 효과는 확정된 2종(그라디언트 포인트, 글래스 헤더)만 — 그림자·화려한 효과 추가 금지.
- **적용 경계**: 모션·버튼·표면은 공개 학생 페이지(/p/[token])·로그인 포함 전체 적용. 사이드바/탭바 셸은 인증 앱 전용. 인쇄는 현행 라이트 강제 유지.
- **배포 전략**: 3단계 순차 배포 — ① 토큰·버튼·표면(저위험) → ② 모션 시스템 → ③ 셸+벤토 허브(고위험). 단계마다 회귀 검증·배포·사용 확인 후 다음 단계.
- **모바일 흐름 보존**: 기존 모바일→/today 리다이렉트(QC v6 세션 쿠키 가드)와 충돌하지 않게 설계.

## Non-Goals
- 라이트 모드 도입 (xAI 브랜드는 다크 전용)
- 기능 추가·데이터 모델 변경 (요약 통계 위젯의 신규 집계 쿼리는 예외적 허용)
- 인쇄 페이지 리디자인
- framer-motion 전면 도입 (선별 1-2곳 외)
- Storybook/디자인시스템 문서화

## Acceptance Criteria
- [ ] 기능 무손상: 기존 통합 테스트 460건 green + 전 화면 기능 동작 변화 없음 (단계별 검증)
- [ ] 성능 예산: 프로덕션 빌드 통과 + First Load JS 증가 +15kb 이내 + 모션은 transform/opacity만
- [ ] reduced-motion: OS "동작 줄이기" 설정 시 장식 모션 전부 비활성 (스태거·카운트업·전환 포함)
- [ ] 모션 4지점 각각 실제 렌더 확인 (전환/스태거/모핑/카운트업)
- [ ] 버튼 4종 상태가 대표 화면(저장·삭제 버튼)에서 동작
- [ ] 데스크톱 사이드바(8공간+아코디언)·모바일 하단 탭바(허브·오늘·교실·담임·더보기) 내비게이션 정상
- [ ] 메인 허브 벤토: /today 위젯 재사용 + 신규 통계 위젯 + 크기 차등 실 카드 렌더
- [ ] 글래스 스티키 헤더가 스크롤 시 blur 동작, 공개 학생 페이지에도 버튼·표면·모션 적용
- [ ] 3단계 각각 별도 커밋·배포·확인 완료

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "최신 기술" = 화려한 효과? | R1 레퍼런스 확인 | Linear/Vercel 절제 노선 확정 |
| 표면 효과가 필요한가 (R4 Contrarian) | 플랫 유지 옵션 제시 | 그라디언트 포인트+글래스 헤더 2종만 도입 |
| 버튼 고도화 전부 필요? (R6 Simplifier) | 최소 세트 질문 | 4종 모두 실가치 있음으로 확정 |
| 레이아웃 = 다듬기 수준? | R2 범위 질문 | 셸 도입+벤토 전환의 대규모로 확정 |
| 모바일도 사이드바? | R5 | 하단 탭바로 분리 |
| 시각 검수 필요? | R7 | 미선택 — 회귀0·예산·reduced-motion 3기준으로 판정 |

## Technical Context
- Next 15.1 App Router / React 19 / Tailwind(라이브러리 0). xAI 다크 토큰은 tailwind.config.ts 스케일 재정의 방식(473ad22).
- 모션 현황: bare `transition` 3곳, keyframes/duration/ease 0 — 사실상 무(無)모션 베이스.
- 버튼 관용구 통일됨: `rounded-full border border-white/25 bg-transparent … hover:bg-white/10` (일괄 변환 완료 상태라 상태 시스템 주입이 용이).
- 셸 대상: app/layout.tsx + 각 실 layout.tsx (교실/담임/동아리/세팅 4개 탭 레이아웃 존재). 미들웨어 모바일 /today 리다이렉트(middleware.ts, QC v6) 유지 필요.
- /today 위젯: 오늘 시간표·급식·공지·너지 구현 존재 → 벤토 재사용 소스.
- 공개 페이지 app/p/[token]/public-page-view.tsx — 모바일 학생 사용, 셸 제외.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| 모션 시스템 | core domain | 4지점(전환·스태거·모핑·카운트업), CSS우선, 예산 | 버튼·레이아웃·표면에 적용됨 |
| 버튼 상태 시스템 | core domain | loading/press/focus/destructive | 전 화면 버튼에 적용 |
| 사이드바 셸 | core domain | 8공간, 아코디언, 데스크톱 전용 | 하단 탭바와 상보, 벤토 허브 포함 |
| 하단 탭바 | core domain | 허브·오늘·교실·담임·더보기 | 사이드바의 모바일 대응물 |
| 벤토 허브 | core domain | /today 위젯 재사용, 통계 위젯 신규, 크기 차등 카드 | 메인(/) 대체 |
| 글래스 헤더 | supporting | backdrop-blur, 스티키 | 셸에 소속 |
| 그라디언트 포인트 | supporting | 카드 호버 보더, 헤로 라디얼 | 표면 토큰 |
| xAI 브랜드 토큰 | supporting | canvas/card/hairline/필/폰트 | 전 컴포넌트의 제약 |
| 성능 예산 | supporting | +15kb, transform/opacity | 수용 기준 |
| reduced-motion | supporting | prefers-reduced-motion | 수용 기준 |
| 레퍼런스(Linear/Vercel) | external system | 절제·고속·밀도 | 전체 북극성 |
| 3단계 배포 | supporting | 토큰→모션→셸 | 실행 제약 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 6 | 6 | - | - | N/A |
| 2 | 7 | 2 | 0 | 5 | 100% (병합 1) |
| 3–4 | 10 | 3 | 0 | 7 | 100% |
| 5–8 | 15 | 5 | 0 | 10 | 100% |
| 9–12 | 18 | 3 | 0 | 15 | 100% (4라운드 연속 무변동) |

## Interview Transcript
<details>
<summary>Full Q&A (12 rounds)</summary>

**R0 토폴로지:** 4컴포넌트(모션/버튼/레이아웃/표면) → "4개 모두 맞음"
**R1 레퍼런스(Goal):** 북극성? → "Linear/Vercel 대시보드" | 모호도 63%
**R2 레이아웃 범위(Goal):** → "전역 사이드바 셸 + 메인 허브 벤토" | 57%
**R3 모션 수단(Constraints):** → "CSS 우선 + 필요한 곳만 라이브러리" | 55%
**R4 표면 범위(Goal, Contrarian):** 정말 필요한가? → "그라디언트·보더 글로우 + 글래스 스티키 헤더" | 53%
**R5 모바일 셸(Constraints):** → "하단 탭바" | 48%
**R6 버튼 최소세트(Goal, Simplifier):** → "로딩·press·focus-visible·destructive 전부" | 44%
**R7 성공 기준(Criteria):** → "회귀 0 + 성능 예산 + reduced-motion" (시각 체크리스트 미선택) | 28%
**R8 모션 지점(Goal):** → "전환·스태거·모핑·카운트업 전부" | 21%
**R9 벤토 구성(Goal):** → "/today 재사용 + 통계 신규 + 크기 차등" | 18%
**R10 적용 경계(Constraints):** → "전부 동일 적용(셸 제외, 인쇄 라이트 유지)" | 14%
**R11 배포 전략(Constraints):** → "3단계 순차 배포" | 11%
**R12 내비 항목(Goal):** → "사용빈도 기준(탭바: 허브·오늘·교실·담임+더보기, 사이드바: 8공간+아코디언)" | **5.0% ✅**
</details>
