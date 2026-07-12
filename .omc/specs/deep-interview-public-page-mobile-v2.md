# Deep Interview Spec: 학생 공개 페이지 모바일 리디자인 — 4탭 구조 · 가독성 · 위젯 최적화 · 모던 모션

## Metadata
- Interview ID: di-2026-07-12-public-page-mobile
- Rounds: 15 (토폴로지 확인 1 + 질문 14)
- Final Ambiguity Score: 4.7%
- Type: brownfield
- Generated: 2026-07-12 (KST)
- Threshold: 0.05
- Threshold Source: user request ("모호도 5% 미만까지 반복" — settings 미설정, 기본 0.2를 사용자 지시가 재정의)
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.96 | 0.35 | 0.336 |
| Constraint Clarity | 0.96 | 0.25 | 0.240 |
| Success Criteria | 0.95 | 0.25 | 0.238 |
| Context Clarity | 0.93 | 0.15 | 0.140 |
| **Total Clarity** | | | **0.953** |
| **Ambiguity** | | | **0.047 (4.7%)** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| readability-touch | active | 글씨·터치 타깃 확대 — text-[9~11px] 전면 제거, 44px 터치 기준 | R8(수치 하한 확정: 본문≥14px·보조≥12px·터치≥44px) |
| layout-restructure | active | 하단 4탭 구조(홈/일정/시간표/나의기록)로 정보 구성 재편 | R1(탭 구조), R2(4탭 구성), R7(최소 구현), R10(홈 순서 — 공지 우선) |
| widget-mobile-optimize | active | 시간표·캘린더·출결·급식 위젯의 모바일 레이아웃 재설계 | R4(시간표 일간), R6(캘린더 점마커+인라인), R9(출결 인라인), R11(급식 리스트) |
| visual-polish | active | 다크 유지 + 위계·여백·칩 정돈 + 본페이지 수준 모던 모션 | R3(다크 유지), R12(판정 방법), R14(모션 포함 — 사용자 미드턴 제기로 확정) |

## Goal
학생 공개 페이지(`/p/[token]`)를 모바일 우선으로 재구성한다: (1) 현재 9개 섹션 세로 적층을 **하단 4탭**(홈=공지+오늘요약 / 일정=캘린더+메모 / 시간표=일간표+급식 / 나의기록=출결+상담)으로 재편하고, (2) 글씨(본문≥14px·보조≥12px)와 터치 영역(≥44px)을 확대하며, (3) 각 위젯을 모바일 친화 레이아웃(시간표 일간 리스트, 캘린더 점마커+인라인 상세, 출결 매트릭스 확대+인라인 상세, 급식 메뉴 리스트)으로 바꾸고, (4) 교사 앱의 다크 팔레트·모던 디자인 관례(글래스·scale-in·모핑)를 재사용해 본페이지 수준으로 현대화한다. 기능·데이터·보안 계층은 일절 건드리지 않는다(UI 레이어만 재구성).

## Constraints
- **구조**: 탭은 별도 라우트 분리 없이 클라이언트 상태 + `?tab=` URL 쿼리 동기화(새로고침·공유 시 탭 유지). 데스크톱도 동일한 탭 레이아웃(max-w-2xl 중앙정렬 유지). 라우팅·미들웨어·데이터 계층 변경 0. (R7)
- **범위**: 기능 축소 0 — 9개 섹션 전부 유지, 홈 탭에서 우선순위만 차등화. (R5 콘트래리언 확정)
- **인터랙션 회귀 0**: 선택과목 입력, 개인메모 CRUD, 상담 예약/취소, 공지 읽음(New 배지) 처리 전부 기존 동작 유지. (R13)
- **데이터·보안 불변**: DTO allowlist(`lib/public/dto.ts`)·`get_public_page`·서버액션(`app/p/[token]/actions.ts`)·`/p/*` 레이트리밋 그대로. 민감정보 노출 표면 불변. (R13)
- **비주얼**: 다크 테마 유지, 교사 앱 관례(bg-card·hairline·rounded, remap 팔레트) 재사용. 새 팔레트·비-remap hue 도입 금지. (R3, R12)
- **모션**: 본페이지 수준 — 기존 keyframes/유틸 재사용(신규 모션 시스템 설계 금지). 탭 전환 페이드/슬라이드, 인라인 상세 expand 모핑, 카드 진입 스태거, 글래스 탭바. (R14)
- **가독성 하한**: text-[9px]·text-[10px]·text-[11px] 전면 금지. 본문 최소 text-sm(14px), 보조 최소 text-xs(12px). 탭 가능 요소 최소 44×44px 터치 영역. (R8)

## Non-Goals
- 섹션/기능 삭제·축소 (급식 영양정보 포함 — 접기로 이동할 뿐 제거 아님)
- 학생용 라이트 테마 분리, prefers-color-scheme 대응
- 탭별 서브라우트(`/p/[token]/schedule` 등) 분리
- 데이터 계층·DTO·서버액션·보안 모델 변경
- 새 모션 시스템/라이브러리 도입 (기존 유틸 재사용만)
- 교사 앱 쪽 화면 변경

## Tab Composition (확정 설계)
### 홈 (기본 탭)
1. 교사 한마디 (캐러셀·게시일·New 배지 유지)
2. 개별 공지 (캐러셀·New 배지 유지)
3. 개별 메시지 (있을 때만)
4. 오늘 요약 카드 — 오늘 시간표 축약(교시·과목 한 줄씩) + 오늘 급식 메뉴(점심). 탭하면 각각 시간표 탭으로 이동
5. 다가오는 일정 2~3건 미리보기 (→일정 탭 유도)

### 일정
- 월간 grid **유지**(7열 일~토, 방학 밴드·event_kind 색상 유지), 이벤트 칩(text-[10px]) → **점 마커(색상만)** 로 단순화
- 날짜 선택 시 **모달 대신 grid 바로 아래 인라인 상세**: 해당일 이벤트 + 개인메모 CRUD (기존 DayDetailModal 제거)

### 시간표
- **오늘 일간 뷰 기본**: 교시별 세로 리스트(큰 글씨), 상단 요일 칩(월~금)으로 전환
- 선택과목 입력 기능은 일간 뷰의 해당 교시 행에서 유지
- 하단 급식 카드: 3열 테이블 제거 → 메뉴 세로 리스트 + 상단 칼로리 배지 + "영양정보 보기" 접기

### 나의기록
- 출결 2D 매트릭스(성격 4×사유 4) **유지+확대**(셀·글씨 확대, 색상 칩 — 기존 attendance-display 팔레트 재사용 가능)
- 셀 선택 시 **모달 대신 표 아래 인라인 날짜 내역** (기존 AttendanceDetailModal 제거)
- 상담 신청: 날짜 리스트 + 예약/취소 버튼 44px
- 성적(PublicGradeStatus) 섹션이 현재 렌더되는 경우 이 탭에 포함 (현행 기능 그대로)

## Acceptance Criteria
- [ ] AC-1.1 하단 고정 4탭(홈/일정/시간표/나의기록)이 렌더되고, 탭 전환이 클라이언트 상태로 즉시 동작하며 `?tab=` URL이 동기화된다(새로고침·링크 공유 시 해당 탭 복원).
- [ ] AC-1.2 홈 탭 순서: 한마디 → 개별공지 → 개별메시지(조건부) → 오늘요약 → 다가오는 일정. 오늘요약의 시간표/급식 탭하면 시간표 탭으로 이동.
- [ ] AC-1.3 9개 기존 섹션 전부가 4탭 중 하나에 존재한다(기능 소실 0).
- [ ] AC-2.1 최종 코드에 `text-[9px]`·`text-[10px]`·`text-[11px]` 0건(grep). 본문 text-sm 이상, 보조 text-xs 이상.
- [ ] AC-2.2 모든 탭 가능 요소(탭바·캐러셀 화살표·월 네비·날짜 셀·요일 칩·매트릭스 셀·예약/저장/삭제 버튼·체크박스) 터치 영역 ≥44×44px.
- [ ] AC-2.3 390px 폭에서 4탭 전부 가로 스크롤 0건(`scrollWidth ≤ innerWidth`).
- [ ] AC-3.1 시간표: 기본 오늘 요일 일간 리스트, 요일 칩으로 월~금 전환, 선택과목 입력 동작 유지.
- [ ] AC-3.2 캘린더: 월간 grid + 점 마커, 날짜 선택 시 인라인 상세(이벤트+메모 CRUD), DayDetailModal 제거. 방학 밴드·event_kind 색상 유지.
- [ ] AC-3.3 출결: 매트릭스 확대 표시, 셀 선택 시 인라인 날짜 내역, AttendanceDetailModal 제거.
- [ ] AC-3.4 급식: 메뉴 리스트+칼로리 배지+영양정보 접기(3열 테이블 제거). 영양 데이터는 접기 안에 전부 보존.
- [ ] AC-4.1 비주얼 체크리스트: ①카드 스타일 통일(bg-card·hairline·rounded 관례) ②섹션 제목 위계 통일 ③칩 색상 기존 remap 팔레트만 ④여백 스케일 일관.
- [ ] AC-4.2 모션: 탭 전환·인라인 expand·카드 진입에 기존 유틸 기반 애니메이션 적용(본페이지 수준).
- [ ] AC-5.1 기존 인터랙션 4종(선택과목 입력·메모 CRUD·상담 예약/취소·공지 읽음 New 배지) 실측 동작 확인.
- [ ] AC-5.2 데이터·보안 계층 diff 0 — dto.ts·get-public-page.ts·actions.ts 로직 불변(스타일 무관 리팩터 제외), 마이그레이션 0.
- [ ] AC-A 검증 게이트: `npx tsc --noEmit` 0건 + `npx vitest run` 전체 green + 390px 실측 + 데스크톱(≥1024px) 확인 + **모바일 스크린샷 사용자 최종 승인**.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 한 페이지 스크롤 유지가 안전할 수 있다 | R1: 구조 방향 질문 | 하단 4탭 분리로 확정 |
| 9개 섹션 전부 동등 유지 필요한가 | R5(콘트래리언): 축소 여지 질문 | 전부 유지, 홈에서 우선순위만 차등 |
| 탭이면 라우트 분리가 정석일 수 있다 | R7(심플리파이어): 최소 구현 검증 | 클라이언트 상태+?tab=로 충분, 데스크톱도 동일 레이아웃 |
| "작다"는 주관적 | R8: 수치 하한 제안 | 14px/12px/44px/가로스크롤0 확정 |
| 오늘요약이 홈 최상단일 것 | R10: 순서 확인 | 공지가 최상단(전달사항 우선) |
| 영양정보는 삭제해도 될 수 있다 | R11: 3옵션 제시(R5 충돌 경고 포함) | 접기로 보존(축소 아님) |
| "보기 좋게"는 검증 불가 | R12: 판정 방법 질문 | 체크리스트 4항목+스크린샷 승인 |
| 모션은 범위 밖일 수 있다 | R14(사용자 미드턴 제기) | 본페이지 수준 모션 포함, 기존 유틸 재사용 |

## Technical Context (탐색 결과)
- **엔트리**: `app/p/[token]/page.tsx`(RSC, 36줄) → `getPublicPage(token)` → `PublicPageView`(payload prop).
- **본체**: `app/p/[token]/public-page-view.tsx` — **1,119줄 단일 클라이언트 컴포넌트**. 9섹션: Header(:85) → Notices(:193) → IndividualNotices(:249) → CalendarSection(:303, DayDetailModal :517) → Timetable(:647, 셀별 선택과목 popover) → Meals(:800, 3열 w-40/w-20) → Attendance2DTable(:875, AttendanceDetailModal :983) → CounselSlots(:1029) → PersonalMessage(:114). 리디자인 시 탭별 파일 분리 권장(구현 판단).
- **현재 결함 증거**: 반응형 분기(sm:/md:) 0건, text-[9px](:685)·text-[10px](:424,433)·text-[11px](:168,782,788,891 등), 네비 버튼 px-2 py-0.5(~20px), 모달 max-w-md, 컨테이너 max-w-2xl px-6 py-10.
- **쓰기 경로**: `app/p/[token]/actions.ts` — saveElective·reserveCounsel·saveStudentMemo·markNoticeRead + `revalidatePath('/p/'+token)`. 변경 금지(호출부 UI만 이동).
- **DTO**: `lib/public/dto.ts`(559줄) allowlist 파서. `PublicPagePayload`: studentName, weekTodos, notices, individualNotices, timetable, meals, attendance2D/Detail, counselSlots, studentMemos, grades, personalMessage, vacationSpans. 변경 금지.
- **재사용 자산**: 교사 앱 BottomTabBar(`app/ui/bottom-tab-bar.tsx` — 글래스+safe-area 패턴), 모던 디자인 Stage1~3 keyframes(animate-scale-in 등, 모달 fix 커밋 7ed7191), event-kind 칩 팔레트(`lib/domain/event-kind-display.ts`), 출결 칩(`lib/domain/attendance-display.ts`), `VACATION_BAND_BG`.
- **보안 표면**: `/p/*`는 미인증 — middleware.ts 레이트리밋만 통과. 이번 작업은 이 파일을 건드리지 않는다.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| PublicPage | core (view root) | token, 4 tabs | hosts all sections |
| Tab | supporting (new) | id(home/schedule/timetable/records), ?tab= sync | contains sections |
| Notice(한마디/개별) | core domain | body, postedAt, isNew | read-tracking via markNoticeRead |
| PersonalMessage | supporting | body(조건부) | home tab |
| TodaySummary | supporting (new) | 오늘 시간표 축약, 오늘 급식 | links to timetable tab |
| CalendarEvent | core domain | date, title, eventKind | rendered as dot marker + inline detail |
| StudentMemo | core domain | date, body | CRUD inline (was modal) |
| TimetableSlot | core domain | weekday, period, subject, elective | day-view rows |
| Meal | core domain | menu[], nutrition, calories | list + collapse |
| AttendanceRecord | core domain | kind(4), reason(4), date, periods | matrix + inline detail |
| CounselSlot | core domain | date, remaining, reserved | reserve/cancel 44px |
| GradeStatus | supporting | preparing/ready | records tab(현행 렌더 시) |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 10 | 10 | - | - | N/A |
| 2 | 12 | 2 (Tab, TodaySummary) | 0 | 10 | 83% |
| 3~15 | 12 | 0 | 0 | 12 | 100% (13연속 무변동 — 완전 수렴) |

## Interview Transcript
<details>
<summary>Full Q&A (15 rounds)</summary>

### Round 0 (토폴로지)
**Q:** 4개 컴포넌트(가독성·터치/구성 재편/위젯 최적화/비주얼) 분해가 맞나?
**A:** 4개 그대로 진행

### Round 1
**Q:** "난잡함" 해소 구조 방향? (탭 분리/스크롤+위계/오늘 대시보드)
**A:** 하단 탭바 분리 (교사 앱 패턴)
**Ambiguity:** 54%

### Round 2
**Q:** 탭 구성? **A:** 4탭 — 홈/일정/시간표/나의기록
**Ambiguity:** 50%

### Round 3
**Q:** 비주얼 테마 방향? **A:** 다크 유지+위계 개선
**Ambiguity:** 44%

### Round 4
**Q:** 모바일 시간표 표현? **A:** 오늘 일간 기본+요일 칩 전환
**Ambiguity:** 41%

### Round 5 (콘트래리언)
**Q:** 9섹션 전부 1뎁스 유지 전제가 맞나? **A:** 전부 유지, 우선순위만 반영
**Ambiguity:** 38%

### Round 6
**Q:** 캘린더 모바일 표현? **A:** 월간 grid 유지+점마커+하단 인라인 상세(모달 제거)
**Ambiguity:** 35%

### Round 7 (심플리파이어)
**Q:** 최소 구현(클라이언트 탭+?tab=, 데스크톱 동일)로 충분? **A:** 충분
**Ambiguity:** 31%

### Round 8
**Q:** 수치 기준(14px/12px/44px/가로스크롤0)? **A:** 그대로 확정
**Ambiguity:** 23%

### Round 9
**Q:** 나의기록 탭 표현? **A:** 매트릭스 유지+확대, 상세 인라인(모달 제거)
**Ambiguity:** 20%

### Round 10
**Q:** 홈 탭 구성·순서? **A:** 공지를 맨 위로(한마디→개별공지→개별메시지→오늘요약→일정 미리보기)
**Ambiguity:** 18%

### Round 11
**Q:** 급식 표현? **A:** 메뉴 리스트+칼로리 배지+영양정보 접기
**Ambiguity:** 17%

### Round 12
**Q:** "보기 좋게" 판정 방법? **A:** 체크리스트 4항목+스크린샷 사용자 승인
**Ambiguity:** 13%

### Round 13
**Q:** 회귀·보안 경계(인터랙션 유지/데이터·보안 불변/5종 게이트)? **A:** 그대로 확정
**Ambiguity:** 10% (모션 이슈 재개방 반영)

### Round 14 (사용자 미드턴 제기)
**Q:** 본페이지 수준 모던 모션(모핑 등) 포함? **A:** 포함 — 기존 유틸 재사용
**Ambiguity:** 7%

### Round 15 (최종 확인)
**Q:** 전체 결정 요약 — 남은 모호함? **A:** 없음, 이대로 확정
**Ambiguity:** 4.7% ✅ 최종
</details>
