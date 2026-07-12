# Implementation Plan — 학생 공개 페이지 모바일 리디자인 (4탭 · 가독성 · 위젯 · 모션)

> **Status: pending approval** — Planner→Architect(1회 REVISE→APPROVED)→Critic(APPROVED) 합의 완료. 실행은 사용자 명시 승인 후.

- Plan ID: public-page-mobile-v2
- Authoritative spec: `.omc/specs/deep-interview-public-page-mobile-v2.md` (ambiguity 4.7%, PASSED)
- Scope: UI 레이어 전용. 데이터/보안/서버액션/DTO/마이그레이션 변경 0.
- Target file: `app/p/[token]/public-page-view.tsx` (현재 1,119줄 단일 클라이언트 컴포넌트)

---

## 1. RALPLAN-DR Summary

### Principles
1. **UI-only, zero-regression**: 기존 4종 인터랙션(선택과목·메모 CRUD·상담·공지읽음)의 *로직*은 그대로 두고, 마크업 위치와 스타일만 재배치한다. 서버액션 시그니처(`app/p/[token]/actions.ts:21-82`)와 DTO 필드는 절대 안 건드린다.
2. **Reuse over invent**: 탭바·모션·칩 색상은 전부 기존 자산 재사용(BottomTabBar 글래스 패턴, `animate-scale-in`/`fade-in-up`/`.stagger`/`.accordion`, `EVENT_KIND_CHIP`, `ATTENDANCE_KIND_CHIP`). 신규 keyframe·hue·라이브러리 0.
3. **Numeric floors are non-negotiable**: 본문 ≥14px(text-sm), 보조 ≥12px(text-xs), 터치 ≥44×44px, 390px 가로 스크롤 0. text-[9/10/11px] 전면 제거.
4. **Single layout, no responsive fork**: 데스크톱도 동일 4탭 구조(max-w-2xl 중앙정렬). `sm:`/`md:` 구조 분기 없음 — 탭바는 모든 폭에서 노출(교사 BottomTabBar의 `md:hidden`은 복사하지 않는다).
5. **Decompose for reviewability**: 1,119줄 단일 파일을 탭별 파일로 분해해 각 탭이 독립 리뷰·검증 가능하게 한다.

### Decision Drivers (top 3)
1. **force-dynamic 재페치 회피** — `page.tsx:17`이 `export const dynamic = "force-dynamic"`. 탭 전환마다 RSC가 `getPublicPage(token)`를 다시 도는 것을 막아야 즉시성·무깜빡임을 얻는다. → 탭 상태 메커니즘 선택을 지배.
2. **미인증 공개 페이지 제약** — `/p/*`는 세션 없음. URL 동기화는 인증·미들웨어를 건드리지 않는 순수 클라이언트 수단이어야 한다.
3. **가독성/터치 하한 = 자동 리젝션 게이트** — text-[9/10/11px], px-2 py-0.5(~20px) 잔존 = 스펙 위반. 스윕 완전성이 통과 여부를 지배.

### Viable Options per Decision Axis (HOW)

#### Axis A — 파일 분해 전략
| Option | Pros | Cons |
|--------|------|------|
| **A1 (채택): 셸 + `_components/*` 탭별 파일 + `_shared.tsx`** | 탭별 독립 리뷰/검증; 셸이 얇아짐; Next 관례(`_`=비라우팅 private 폴더) | 파일 수 증가; import 배선 필요 |
| A2: 단일 파일 유지, 내부만 리팩터 | diff 국소화 | 1,119→더 커짐; 리뷰 난이도; 탭별 검증 불가 |
| A3: `view/` 하위 라우트식 폴더 | 구조 명확 | `_` 없으면 라우팅 오염 위험; 과한 구조 |

→ **A1**. `PublicPageView` export 이름은 유지(`page.tsx:5,35`가 import). 하위는 `app/p/[token]/_components/`에 콜로케이트.

#### Axis B — 탭 상태 + `?tab=` 동기화
| Option | Pros | Cons |
|--------|------|------|
| **B1 (채택): `useState`(source of truth) + 초기값 `useSearchParams()` + 변경 시 `window.history.replaceState`** | force-dynamic RSC 재페치 0; 즉시 전환; 새로고침·공유 시 복원 | history API 직접 사용(주석 필요) |
| B2: `router.replace(?tab=)` (next/navigation) | 표준 API | force-dynamic route라 매 전환마다 `getPublicPage` 재실행 → 깜빡임·지연 |
| B3: 서브라우트 `/p/[token]/[tab]` | RSC 자연 분리 | **스펙 Non-Goal 위반**(서브라우트 금지) — 즉시 리젝션 |

→ **B1**. App Router에는 Pages식 shallow routing이 없어 `router.replace`가 RSC를 재구동한다. `history.replaceState`로 URL만 갱신하면 페이로드 재페치 없이 탭 유지가 된다. `useSearchParams`는 force-dynamic 컨텍스트라 정적 bailout 없음(Suspense 불필요).

#### Axis C — 모션 접근
| Option | Pros | Cons |
|--------|------|------|
| **C1 (채택): 기존 유틸만 — 탭 콘텐츠 `key={tab}`+`animate-fade-in-up`, 카드 리스트 `.stagger`, 인라인 상세/영양 접기 `.accordion`, 탭바 글래스** | 신규 모션 0(스펙 준수); reduced-motion 가드(globals.css:112) 자동 적용 | 표현 폭은 기존 유틸 범위로 제한 |
| C2: 신규 keyframe/transition 추가 | 표현 자유 | **스펙 위반**(신규 모션 시스템 금지) |

→ **C1**. `.accordion`(globals.css:97-109, grid-rows 0fr→1fr)이 인라인 상세 expand·영양 접기에 정확히 부합.

#### Axis D — 인라인 상세 구현(모달 대체)
| Option | Pros | Cons |
|--------|------|------|
| **D1 (채택): 기존 모달 본문 마크업을 fixed 오버레이에서 인라인 `<div>`로 이설, CRUD 핸들러/state는 그대로** | 로직 회귀 0(핸들러 이동 없음); 모달 제거로 UX 단순화 | grid/matrix 아래 조건부 렌더 배선 |
| D2: 모달 유지, 스타일만 손질 | 변경 최소 | **스펙 위반**(DayDetailModal·AttendanceDetailModal 제거 명시) |

→ **D1**.

---

## 2. Requirements Summary (from spec)

- **구조**: 하단 4탭 — 홈(공지+오늘요약) / 일정(캘린더+메모) / 시간표(일간표+급식) / 나의기록(출결+상담). 클라이언트 상태 + `?tab=` 동기화. 데스크톱 동일 레이아웃(max-w-2xl 중앙).
- **홈 순서**: 교사 한마디 → 개별 공지 → 개별 메시지(조건부) → 오늘 요약 → 다가오는 일정 미리보기.
- **9섹션 전부 유지**(기능 소실 0): Header, Notices, IndividualNotices, Calendar, Timetable, Meals, Attendance, Counsel, PersonalMessage.
- **가독성**: text-[9/10/11px] 0건; 본문 text-sm↑, 보조 text-xs↑; 터치 44×44px↑; 390px 가로 스크롤 0.
- **위젯**: 시간표=오늘 일간 리스트+요일 칩(선택과목 입력 유지); 캘린더=월간 grid+점마커+인라인 상세(모달 제거, 방학 밴드/event_kind 색상 유지); 출결=매트릭스 확대+인라인 날짜 내역(모달 제거); 급식=메뉴 리스트+칼로리 배지+영양정보 접기(3열 테이블 제거, 영양 전량 보존).
- **비주얼**: 다크 유지, bg-card·hairline·rounded 관례, remap 팔레트만. 모션 본페이지 수준(기존 유틸).
- **불변**: `lib/public/dto.ts`, `lib/public/get-public-page.ts`, `app/p/[token]/actions.ts` 로직, middleware, DB/마이그레이션.
- **성적(grades) 처리**: DTO엔 `grades: PublicGradeStatus`(dto.ts:144, Phase 1 항상 `preparing` 목업)가 있으나 `public-page-view.tsx`에서 **현재 렌더되지 않음**(grep 무매치). 스펙: "현재 렌더되는 경우 이 탭에 포함" → 현재 미렌더이므로 **추가하지 않음**(신규 기능 추가는 Non-Goal). 나의기록 탭에는 출결+상담만.

---

## 3. Implementation Steps (ordered)

> 인용 규칙: 기존 코드에 대한 주장은 file:line. 신규는 (신규)로 표기.

> **[Architect 필수#1 — 이설·변환 2단계 분리]** Step 1·5·6·7의 모든 섹션 이설은 **(a) 순수 이동**(스타일·로직 변경 0, import 배선만) 후 **그린 체크포인트**(tsc + vitest + 4종 인터랙션 실측) 통과 → **(b) 변환**(가독성 스윕·모달→인라인·모션) 순으로 진행한다. 이동 리스크와 리디자인 리스크를 분리해 회귀 발생 시 원인이 한 클래스로 bisect되게 한다. 커밋도 (a)/(b) 단위로 분리 권장.

> **[Architect 필수#2 — `.stagger` 계약]** `.stagger > *`는 **직계 DOM 자식**만 지연시킨다(globals.css:65-95). 셸에서 `<HomeTab/>` 하나를 감싸면 스태거가 무음 실패한다. → `.stagger`는 셸이 아니라 **각 탭 컴포넌트 내부의 실제 카드 나열 요소**에 부여한다. 셸 래퍼는 `animate-fade-in-up`만(이중 페이드 방지 — Architect 비차단#2 동시 해소).

> **[Architect 필수#3 — `.accordion` 계약]** `.accordion`(globals.css:97-109)은 **overflow-hidden 단일 자식 래퍼**가 필요하다 — 모달 본문처럼 최상위 자식이 여럿이면 단일 `<div>`로 감싼다. 또한 expand 모핑(0fr→1fr)이 재생되려면 **항상 마운트한 채 `.accordion-open`만 토글**해야 한다(조건부 마운트 시 이미 펼쳐진 채 등장 — 모핑 없음). Step 5·6·7의 인라인 상세·영양 접기 전부 적용. **null 선택 상태 처리(Critic #4)**: 캘린더 `selectedDate`/출결 `sel`이 null일 때도 `.accordion` 래퍼는 마운트 유지하고 **내부 콘텐츠만 조건부 렌더**(null이면 비움) — 첫 선택 시 모핑이 정상 재생된다.

### Step 0 — 브랜치 & 기준선
- 작업 브랜치 생성(main 직접 금지). `npx tsc --noEmit`·`npx vitest run` 기준선 green 확인(회귀 판별용).

### Step 1 — 공유 모듈 추출 `app/p/[token]/_shared.tsx` (신규, "use client")
현재 파일 상단의 순수 헬퍼/원자 컴포넌트를 이동(로직 불변, 스타일만 후속 스텝에서 손질):
- 날짜 헬퍼 `kstToday`(:47), `kstWeekday`(:52), `kstWeekDates`(:58), `ymd`(:296), `periodsLabel`(:955).
- 타입 `DayEvent`(:28), `eventChipClass`(:37).
- 공지 메타 `noticeDateLabel`(:140), `NoticeMeta`(:152), `useMarkNoticeReadOnView`(:178).
- 상수 `TT_WEEKDAYS/LABEL/PERIODS`(:637-645), `KIND_ROWS`(:842), `REASON_COLS`(:848), `KIND_TO_RECORD_KIND`(:859), `REASON_LABEL`(:868).
- `Card`(:126) → **개편**: `rounded-2xl border border-hairline bg-card p-4`로 통일(현재 `rounded-lg border-neutral-200`), 제목 `text-sm`은 유지(보조 하한 충족).
- `NoticeMeta`의 `text-[10px]`(:164)·`text-[11px]`(:168) → `text-xs`로 상향.

### Step 2 — 탭 셸 재작성 `app/p/[token]/public-page-view.tsx`
- 현 `PublicPageView`(:76-124)의 세로 적층 `<main>`을 **탭 셸**로 교체. export 이름·prop 시그니처(`{ token, payload }`) 유지(`page.tsx:35` 계약).
- 탭 상태(Axis B1):
  ```
  const search = useSearchParams();
  const initial = normalizeTab(search.get("tab")); // 'home'|'schedule'|'timetable'|'records', 기본 'home'
  const [tab, setTab] = useState<TabId>(initial);
  const selectTab = (t: TabId) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);  // RSC 재페치 회피(force-dynamic)
  };
  ```
- 레이아웃: `<main className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-6">` — 하단 탭바 높이+safe-area만큼 패딩 확보(AppShell `pb-20` 관례 참고, app-shell.tsx:20). px-6→px-4(390px 여백 확보).
- Header(:85-92) 유지하되 `text-2xl` 제목 OK, 부제 `text-xs`(:89)는 보조 하한 충족.
- 콘텐츠: `<div key={tab} className="animate-fade-in-up space-y-4">{활성 탭}</div>` — `key`로 전환 시 재마운트→페이드. **`.stagger`는 여기 두지 않는다**(필수#2): 각 탭 컴포넌트 내부의 카드 나열 요소에 부여.
- 탭 전환 시 비활성 탭은 언마운트되어 로컬 상태(입력 중 선택과목, 열린 메모 편집, 캘린더 선택 월/일, 캐러셀 인덱스)가 초기화된다 — **의도된 단순화**(스펙 요구는 새로고침·공유 시 탭 복원뿐). (Architect 비차단#3 명시)
- 탭 스위치: `tab==='home' && <HomeTab .../>` 등. `HomeTab`에 `onNavigate={() => selectTab("timetable")}` 전달(오늘요약 탭 이동용).

### Step 3 — 탭바 `app/p/[token]/_components/tab-bar.tsx` (신규)
- BottomTabBar 글래스 패턴(bottom-tab-bar.tsx:80-83) 이식하되 **`md:hidden` 제거**(데스크톱도 동일):
  `fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md`.
  데스크톱 중앙정렬 위해 내부 `mx-auto max-w-2xl w-full flex`.
- 4개 `<button>`(Link 아님 — 클라이언트 상태): 홈/일정/시간표/나의기록. 각 버튼 `flex-1 flex-col items-center justify-center min-h-[56px] py-2 text-xs`(≥44px 충족), 아이콘 `text-lg`, 라벨 `text-xs`. active=`text-white`, inactive=`text-neutral-500`. `aria-current`/`aria-label` 부여.

### Step 4 — 홈 탭 `app/p/[token]/_components/home-tab.tsx` (신규)
순서(AC-1.2): `Notices` → `IndividualNotices` → `PersonalMessage`(조건부) → `TodaySummary`(신규) → `UpcomingEvents`(신규).
- `Notices`(:193-246)·`IndividualNotices`(:249-293) 이설. 네비 화살표 버튼 `px-2 py-0.5`(:225,236,272,282) → `min-h-[44px] min-w-[44px] inline-flex items-center justify-center`. 캐러셀 인덱스 텍스트 `text-xs` 유지.
- **[액센트 틴트 정책(Architect 비차단#1 확정)]**: 개별 공지의 amber(:262)·개별 메시지의 blue(:115) 시맨틱 틴트는 **유지**(전체공지 vs 개별 항목 구분 신호 — remap 팔레트 내 합법). 일반 카드만 `bg-card` 통일. AC-4.1의 "카드 통일"은 "무틴트 카드의 스타일 통일"로 해석한다.
- `PersonalMessage`(:114-121 인라인) → 독립 섹션 컴포넌트로. `text-sm` 유지.
- `TodaySummary`(신규): `payload.timetable`에서 오늘 요일(`kstWeekday`) 슬롯을 교시순 한 줄씩(과목명 `text-sm`) + `payload.meals`를 **`kstToday()`로 날짜 필터**한 급식 메뉴 요약(PublicMeal에 조식/중식 구분 필드 없음 — dto.ts:35-40, 라벨은 "오늘 급식"). 카드 탭 시 `onNavigate()`→시간표 탭. 카드/행 터치 ≥44px. **빈 상태**: 오늘 수업 없음(주말 포함) 시 "오늘 수업이 없습니다" 문구. (Critic #1·#2)
- `UpcomingEvents`(신규): `payload.weekTodos`에서 오늘 이후 가까운 2~3건(날짜·제목·event_kind 점) 미리보기, 탭 시 일정 탭 이동(`onNavigate` 확장 또는 별도 prop). `text-sm`. **빈 상태**: 해당 건 없으면 "다가오는 일정이 없습니다". (Critic #2)
- `Notices` 이설 시 `payload.commonNotice`(레거시 폴백, :203-208 소비) **prop 전달 유지** — HomeTab이 notices와 함께 반드시 배선. (Critic #3)

### Step 5 — 일정 탭 `app/p/[token]/_components/schedule-tab.tsx` (신규)
- `CalendarSection`(:303-453) 이설. 월간 grid·네비·방학 밴드(`VACATION_BAND_BG`)·event_kind 색상 유지.
- 월 네비 버튼 `px-2 py-0.5`(:383,:393) → `min-h-[44px] min-w-[44px]`.
- 날짜 셀(:417-438): 날짜 숫자 `text-[11px]`(:424)→`text-xs`; **이벤트 칩(:429-437, `text-[10px]`) 제거 → 점 마커**: 해당일 이벤트 존재 시 event_kind별 색 점(예: `h-1.5 w-1.5 rounded-full` + 칩 배경색에서 색 추출) 1~N개 또는 단일 대표 점. 메모 점(:426)은 유지. 셀 `min-h-[3.25rem]`(:421)은 44px↑ 충족.
- **DayDetailModal 제거**(:460-634): 본문 마크업(학사일정 목록 + 메모 CRUD)을 **grid 바로 아래 인라인 `<div>`**로 이설(Axis D1). CRUD 핸들러 `add`/`saveEdit`/`remove`(:479-507)와 state·`saveStudentMemoAction`/`deleteStudentMemoAction` 호출은 그대로. 컨테이너를 `.accordion`(open 시 `.accordion-open`)로 감싸 expand 모핑. 저장/추가 버튼 `w-full py-1.5`→`min-h-[44px]`; 수정/삭제 링크(:592,600, `text-xs`)는 `min-h-[44px] inline-flex items-center` 히트박스로.

### Step 6 — 시간표 탭 `app/p/[token]/_components/timetable-tab.tsx` (신규)
- `Timetable`(:647-729)을 **일간 뷰**로 개편:
  - 상단 요일 칩(월~금, `TT_WEEKDAY_LABEL`): `<button>` 각 `min-h-[44px] px-3`, 선택 요일 하이라이트(`bg-blue-100 text-blue-700` 관례, :678). 기본 선택=오늘 요일(`kstWeekday`, 토·일이면 월). `text-[9px]` "오늘" 배지(:685) 제거 또는 `text-xs`로.
  - 선택 요일의 1~7교시를 **세로 리스트**(3열 table 제거): 각 행 `flex` — 교시 번호(좌, `text-sm text-neutral-400`) + 과목(`text-sm`). 행 `min-h-[44px]`.
- `TimetableCell`의 선택과목 입력(:731-797) 유지: 일간 행 내부에서 토글. input `text-[11px]`(:782)→`text-sm`; 저장 버튼 `text-[11px]`(:788)→`min-h-[44px] text-sm`; 에러 `text-[10px]`(:792)→`text-xs`. 공통과목=`text-neutral-700`(:744), 선택과목=파랑 계열(:767-771) 규칙 유지.
- 하단 `Meals`(:800-838) 이설 + 개편(3열 테이블 제거):
  - 각 급식 카드: 메뉴 세로 리스트(`whitespace-pre-line text-sm`) + 상단 칼로리 배지(`m.calInfo`, `text-xs` 칩) + **영양정보 접기**: `.accordion` 안에 `m.ntrInfo` 전량(`text-xs`) 보존. "영양정보 보기" 토글 버튼 `min-h-[44px]`.

### Step 7 — 나의기록 탭 `app/p/[token]/_components/records-tab.tsx` (신규)
- `Attendance2DTable`(:875-952) 이설 + 확대: 셀 `px-2 py-1`→`px-3 py-3`(셀 44px↑), 숫자 `text-sm` 유지/확대. 안내문 `text-[11px]`(:891)→`text-xs`. 0 아닌 칸 버튼(:919-925) 히트박스 44px.
  - kind/reason 칩 색상은 `ATTENDANCE_KIND_CHIP`/`ATTENDANCE_REASON_CHIP`(attendance-display.ts) 재사용 가능(스펙 R9).
- **AttendanceDetailModal 제거**(:964-1026): 날짜 내역 목록을 **매트릭스 아래 인라인**으로(Axis D1). `records.filter(...)`(:943-946) 로직 그대로, `.accordion` expand. 안내문 `text-[11px]`(:1020)→`text-xs`. 노출 필드는 날짜·교시·사유뿐(note_field 미포함) — 서버 계약 불변.
- `CounselSlots`(:1029-1119) 이설: 예약/취소 버튼(`px-2 py-0.5 text-xs`, :1098,:1111) → `min-h-[44px] px-4`. 상태 배지·에러(`text-[11px]`, :1085,1106)→`text-xs`. 슬롯 행 `min-h-[44px]`.

### Step 8 — 가독성/터치 최종 스윕
- 전 파일 grep: `text-\[9px\]`·`text-\[10px\]`·`text-\[11px\]` = 0건 확인.
- 모든 `px-2 py-0.5`(버튼·네비) → 44px 히트박스로 치환 완료 확인.
- `sm:`/`md:` 구조 분기 미도입 확인(탭바 `md:hidden` 없음).

### Step 9 — 검증(§6) 후 커밋
- tsc·vitest·390px 실측·데스크톱 확인·스크린샷 승인 게이트 통과 후 커밋.

---

## 4. Acceptance Criteria

### From spec (copied)
- [ ] AC-1.1 하단 고정 4탭 렌더 + 클라이언트 상태 즉시 전환 + `?tab=` 동기화(새로고침·공유 복원).
- [ ] AC-1.2 홈 순서: 한마디→개별공지→개별메시지(조건부)→오늘요약→다가오는 일정. 오늘요약 탭→시간표 탭 이동.
- [ ] AC-1.3 9개 섹션 전부 4탭 중 하나에 존재(기능 소실 0). **판독 기준(Critic #5)**: Header(학생명+경고)는 탭 밖 상시 셸에 존재 — 모든 탭에서 보이므로 소실 아님. 매핑: 홈=Notices·IndividualNotices·PersonalMessage(+신규 TodaySummary·UpcomingEvents) / 일정=Calendar / 시간표=Timetable·Meals / 나의기록=Attendance·Counsel.
- [ ] AC-2.1 `text-[9px]`·`text-[10px]`·`text-[11px]` 0건(grep). 본문 text-sm↑, 보조 text-xs↑.
- [ ] AC-2.2 모든 탭 가능 요소 터치 ≥44×44px.
- [ ] AC-2.3 390px에서 4탭 전부 가로 스크롤 0(`scrollWidth ≤ innerWidth`).
- [ ] AC-3.1 시간표 오늘 일간 기본 + 요일 칩 전환 + 선택과목 입력 유지.
- [ ] AC-3.2 캘린더 grid+점마커, 인라인 상세(이벤트+메모 CRUD), DayDetailModal 제거, 방학밴드·event_kind 색상 유지.
- [ ] AC-3.3 출결 매트릭스 확대 + 인라인 날짜 내역, AttendanceDetailModal 제거.
- [ ] AC-3.4 급식 메뉴 리스트+칼로리 배지+영양 접기(3열 테이블 제거), 영양 데이터 전량 보존.
- [ ] AC-4.1 비주얼 체크리스트: 카드 통일(bg-card·hairline·rounded)·제목 위계·칩 remap 팔레트만·여백 스케일 일관.
- [ ] AC-4.2 모션: 탭 전환·인라인 expand·카드 진입에 기존 유틸 애니메이션.
- [ ] AC-5.1 인터랙션 4종(선택과목·메모 CRUD·상담 예약/취소·공지 New 배지) 실측 동작.
- [ ] AC-5.2 데이터·보안 diff 0 — dto.ts·get-public-page.ts·actions.ts 로직 불변, 마이그 0.
- [ ] AC-A 게이트: tsc 0 + vitest green + 390px 실측 + 데스크톱(≥1024px) 확인 + 모바일 스크린샷 사용자 승인.

### Implementation-level ACs (added, testable)
- [ ] AC-I1 `page.tsx`는 `PublicPageView`를 동일 시그니처로 계속 import(변경 0줄). (grep/diff)
- [ ] AC-I2 탭 전환 시 `getPublicPage`/네트워크 RSC 재요청 0건(Network 패널) — `history.replaceState` 사용, `router.replace` 미사용. (grep `router.replace` 무매치)
- [ ] AC-I3 `git diff`가 `lib/public/dto.ts`, `lib/public/get-public-page.ts`, `app/p/[token]/actions.ts`, `middleware.ts`, `drizzle/**` 무변경. (diff)
- [ ] AC-I4 `grades`/`PublicGradeStatus` UI 신규 추가 없음(스펙: 현재 미렌더 → 유지). (grep)
- [ ] AC-I5 서브라우트 폴더 신규 생성 0(`app/p/[token]/` 하위 라우트 세그먼트 없음; `_`-prefixed private만). (파일 트리)
- [ ] AC-I6 신규 keyframe/`animation:` 정의 0(globals.css·tailwind.config.ts 무변경 또는 색/모션 추가 없음). (diff)

---

## 5. Risks & Mitigations

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | `router.replace(?tab=)` 오사용 시 force-dynamic 재페치로 탭 전환 깜빡임·지연 | Axis B1 강제 — `history.replaceState`만 사용. AC-I2 grep 게이트로 `router.replace` 부재 검증. |
| R2 | `useSearchParams` 정적 렌더 bailout(CSR-bailout 경고) | route가 `force-dynamic`(page.tsx:17)이라 정적 프리렌더 대상 아님 — bailout 없음. 필요 시 셸을 `<Suspense>`로 감싸 안전판(무해). |
| R3 | 모달→인라인 이설 중 CRUD state/핸들러 유실(메모·출결 회귀) | 핸들러/state 블록(:473-507)을 통째로 이동(재작성 금지), 서버액션 호출부 문자열 불변. AC-5.1 실측. |
| R4 | 점 마커 색상을 위해 `EVENT_KIND_CHIP`(`bg-*-100 text-*-700`)에서 점 색 추출 시 새 hue 유입 | 점은 동일 칩 클래스의 배경색 계열만 사용(예: `bg-red-400` 대신 칩과 매칭되는 remap hue). 신규 hue 도입 금지, AC-4.1 팔레트 체크. |
| R5 | `.stagger` 지연은 자식 1~7번째 개별, 8번째부터 공통 280ms(globals.css:93 `nth-child(n+8)`) — 카드 많은 탭에서 8번째+ 동시 등장 | 탭당 카드 ≤7 유지(홈 5·일정 2·시간표 2·기록 3). 초과 시 내부 그룹핑으로 회피. `.stagger`는 탭 내부 카드 목록 요소에만(필수#2). |
| R6 | 하단 탭바가 콘텐츠 가림(마지막 섹션 잘림) | `<main>` 하단 패딩 `pb-[calc(env(safe-area-inset-bottom)+5rem)]`(app-shell.tsx:20 `pb-20` 관례 확장). 390px 실측에 스크롤 하단 확인 포함. |
| R7 | 390px에서 시간표/출결 표 가로 넘침 | 시간표는 3열 table→세로 리스트로 근본 제거; 출결 매트릭스는 4열이나 `table-fixed`+셀 축약 라벨로 폭 억제. AC-2.3 실측 게이트. |
| R8 | 데스크톱에서 하단 고정 탭바가 어색(넓은 화면) | 탭바 내부 `mx-auto max-w-2xl`로 콘텐츠 폭에 정렬. 데스크톱(≥1024px) 확인 게이트(AC-A)로 스크린샷 검토. |
| R9 | 선택과목 입력이 일간 행에서 토글 시 레이아웃 점프 | 토글 패널을 행 하위 `.accordion` 또는 아래 블록으로, `min-h` 확보. AC-3.1 실측. |
| R10 | 파일 분해로 import 순환/누락 | `_shared.tsx` 단방향 의존(탭→shared), 셸→탭 단방향. tsc가 배선 오류 포착(AC-A). |

---

## 6. Verification Steps

1. **타입**: `npx tsc --noEmit` → 0 에러(기준선 대비 무증가).
2. **단위**: `npx vitest run` → 전체 green(공개 페이지 관련 DTO/파서 테스트 회귀 없음).
3. **불변 diff**: `git diff --stat`으로 `lib/public/dto.ts`·`get-public-page.ts`·`actions.ts`·`middleware.ts`·`drizzle/**` 0줄 변경 확인(AC-5.2/I3).
4. **가독성 grep**: `rg "text-\[(9|10|11)px\]" app/p/[token]` → 0건(AC-2.1). `rg "router.replace" app/p/[token]` → 0건(AC-I2).
5. **390px 실측(Playwright MCP)**: dev 서버 기동 후 유효 토큰 `/p/[token]`로 navigate → `browser_resize(390, 844)` → 4탭 각각 `browser_evaluate("document.documentElement.scrollWidth <= window.innerWidth")` = true(AC-2.3) → 각 탭 스크린샷 캡처. 터치 타깃은 대표 요소 `getBoundingClientRect().height>=44` 샘플 검증(AC-2.2).
   - *의존성*: 시드된 유효 공개 토큰 필요(데이터 있는 학생). 없으면 사용자에게 토큰 요청 또는 시드 스크립트 확인.
6. **데스크톱 확인**: `browser_resize(1280, 900)` → 동일 4탭 레이아웃·중앙정렬·탭바 정렬 스크린샷(AC-A).
7. **인터랙션 실측(AC-5.1)**: 선택과목 입력 저장, 메모 추가/수정/삭제, 상담 예약/취소, 공지 스와이프 시 New 배지 소거 — 각 1회 실행해 서버액션 성공/UI 반영 확인.
8. **스크린샷 승인 게이트**: 모바일 4탭 스크린샷을 사용자에게 제시 → 최종 승인 후 커밋(AC-A). *승인 전 main 병합 금지.*

---

## 7. ADR

**Decision**: 학생 공개 페이지를 (a) `PublicPageView` 셸 + `_components/*` 탭별 파일 + `_shared.tsx`로 분해하고, (b) 탭 상태를 `useState`(초기값 `useSearchParams`) + `window.history.replaceState`로 관리하며, (c) 모션은 기존 `animate-fade-in-up`/`.stagger`/`.accordion` 유틸만 재사용하고, (d) 모달 2종을 인라인 패널로 이설한다. grades UI는 추가하지 않는다.

**Drivers**: force-dynamic 재페치 회피(page.tsx:17), 미인증 페이지 제약, 가독성/터치 하한 게이트, 스펙 Non-Goal(서브라우트·신규 모션 금지).

**Alternatives considered**: `router.replace` 기반 URL 동기화(B2, 재페치로 탈락); 서브라우트 분리(B3, Non-Goal 위반); 단일 파일 유지(A2, 리뷰/검증성 저하); 신규 keyframe 도입(C2, 스펙 위반).

**Why**: `history.replaceState`는 App Router에 없는 shallow-routing을 대체해 페이로드 재페치 없이 URL 동기화를 달성한다. 파일 분해는 4탭을 독립 리뷰·검증 단위로 만든다. 기존 모션 유틸은 reduced-motion 가드(globals.css:112)와 fill-backwards 관례(모달 중앙정렬 회귀 방지, 커밋 7ed7191)를 이미 내장한다.

**Consequences**: (+) 데이터/보안 표면 0 변경, 회귀 위험 국소화, 즉시 탭 전환. (−) `history` 직접 사용에 설명 주석 필요, 파일 수 증가. 브라우저 뒤로가기는 `replaceState`라 탭 히스토리를 쌓지 않음(스펙은 "새로고침·공유 시 유지"만 요구 — 뒤로가기 탭 이동은 범위 밖, 의도된 단순화).

**Follow-ups**: (1) grades가 Phase 2에서 실렌더되면 나의기록 탭에 편입(현 범위 밖). (2) 탭바 아이콘 셋 확정은 디자이너 확인 권장(교사 앱 이모지 관례 재사용). (3) 시드 토큰 확보 경로를 검증 단계 전 확정.

---

## 8. Changelog (합의 반영 이력)

- **Architect REVISE 1회 → 필수 3건 반영**: ①이설·변환 2단계 분리(순수 이동 → 그린 체크포인트 → 변환, §3 서두 규칙) ②`.stagger`를 셸이 아닌 탭 내부 카드 목록에 부여(이중 페이드 동시 해소) ③`.accordion` 단일 자식 래퍼 + 상시 마운트·`.accordion-open` 토글 계약 명시.
- **Architect 비차단 4건 반영**: ①액센트 틴트 정책 확정(개별공지 amber·개별메시지 blue 유지, Step 4) ②이중 페이드 제거(필수#2에 병합) ③탭 전환 시 로컬 상태 초기화를 의도된 단순화로 명시(Step 2) ④R5 `.stagger` 타이밍 서술 정정(8번째부터 공통 지연, 카드 ≤7).
- **인용 정밀화**: 월 네비 :383/:393, 상담 버튼 :1098/:1111.
- Architect 검증 확인 사항: B1(replaceState 무재페치) 공식 지원 확인, C1 유틸 4종 존재 확인(tailwind.config.ts:223-236, globals.css:65-109), grades 미렌더 확인 → 미추가 결정 타당.
- **Critic APPROVED + 비차단 5건 반영**: ①TodaySummary 급식 `kstToday()` 날짜 필터(중식 구분 필드 없음 명시) ②TodaySummary·UpcomingEvents 빈 상태 문구 ③`commonNotice` 레거시 폴백 prop 배선 명시 ④`.accordion` null 선택 시 내부만 조건부 렌더 ⑤AC-1.3 판독 기준(Header=상시 셸) + 9섹션 탭 매핑 명시.
- Critic 미해결 오픈 질문(실행 중 확인): weekTodos 유효 날짜 범위(빈 상태 빈도), meals 다중 날짜 반환 여부(필터의 실효성).
