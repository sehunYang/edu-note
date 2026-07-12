# 통계실·인쇄실 재구축 — 컨센서스 플랜 (v3, final)

- Status: **pending approval** (컨센서스 성립: Architect APPROVE conditional → 반영 → Critic APPROVED)
- Spec: `.omc/specs/deep-interview-stats-print-rooms.md` (모호도 4.7% PASSED, 2026-07-12)
- Mode: RALPLAN-DR short
- Scope: (1) 통계실 4섹션 인사이트 대시보드 (2) 인쇄실 학생별 점검·배부 인쇄물 공간 승격

---

## RALPLAN-DR Summary

### Principles (4)
1. **재사용 우선**: `lib/domain/student-report.ts` 4플래그, `getStudentReport`, `getGradeView`, `getOwnerStats`, `computeProgressRates`를 재사용/확장하되 **기존 시그니처·테스트 불변**.
2. **순수 함수 분리**: 신규 집계(경보 3종·분포통계·커버리지·진척)는 `lib/domain/`에 DB 무관 순수 함수로 작성 + 단위 테스트(경계값 포함). 쿼리 계층은 행 수집만.
3. **불변 표면**: DB 스키마/마이그레이션 diff 0, 보안 표면(공개 페이지·미들웨어·RLS) diff 0.
4. **인쇄물 내용 경계 엄수**: 배부용 인쇄물에 지필+추이·수행·출결 요약만. 관찰/행특/상담/`note_field`(교사 메모)는 코드 경로·grep·실측 모두 0건.

### Decision Drivers (top 3)
1. 스펙이 이미 4.7% 모호도로 확정 — 계획의 초점은 "무엇을"이 아니라 "회귀 없이 어떻게": 기존 테스트 불변 + 기존 명단 인쇄 기능 유지.
2. `student-report.ts`(플래그 4종 순수함수+테스트 완비, UI 없음)가 인쇄실 3·4단계의 완성된 토대 — 이를 쓰지 않는 설계는 기각.
3. recharts는 화면 전용(사용자 명시 승인), 인쇄 출력은 흑백 판독성이 보장되는 표 — 인쇄 경로에서 차트 렌더 리스크를 원천 제거.

### Viable Options

**Option A — 순수함수 집계 + 인쇄실 전체 `(shell)` 이관** *(v1 선택 → Architect 안티테제로 수정)*
- 접근: 신규 집계는 `lib/domain/stats-insights.ts`(순수) + `lib/db/queries/stats-insights.ts`(행 수집). 인쇄실 전 라우트를 `app/(shell)/print/*`로 이관.
- Pros: 단위 테스트 용이(스펙 R10 요구 그대로), 셸 네비/헤더 일관성, 도메인 규칙이 SQL에 묻히지 않음.
- Cons: **`app/(shell)/layout.tsx:7`에 문서화된 인쇄 격리 의도("공개/인쇄 경로는 셸 밖 — 셸 JS 미탑재")를 뒤집음.** 배부 인쇄물 정확성이 셸 크롬 3종(client)의 `print:hidden` 완전성에 의존, 인쇄 라우트에 셸 클라이언트 번들 탑재.

**Option B — SQL 집계 중심 + `/printroom` 신설(레거시 `/print` 온존)**
- 접근: 경보·분포·커버리지를 SQL(window/filter)로 계산, 인쇄실은 새 경로 `/printroom`을 만들고 기존 `app/print`는 그대로 둠.
- Pros: 쿼리 왕복·전송량 최소, 기존 명렬표 URL 완전 불변.
- Cons: 임계값 로직이 SQL에 박혀 단위 테스트가 통합 테스트로 격상(R10 위배 소지), 히스토그램/표준편차/3분위 규칙의 기존 TS 구현(`sectionRank`)과 이중화, 공간이 `/print`·`/printroom` 둘로 갈라져 UX 혼란.

**Option C — 순수함수 집계 + 인쇄 필요 기준 라우트 분리(Architect 신테시스)** *(최종 선택)*
- 접근: 집계는 Option A와 동일(순수함수+얇은 쿼리). 라우팅은 **"인쇄되는 화면은 셸 밖, 탐색하는 화면은 셸 안"**으로 분리:
  - 셸 안(크롬 있음): `/print` 홈(범위선택+학생목록), `/print/[studentYearId]` 상세 점검(R8.4 "화면 전용").
  - 셸 밖(크롬 없음): `/print/roster` 명렬표(기존 `app/print/page.tsx` 이동), `/print/[studentYearId]/handout` 배부 인쇄물(R8.5).
- Pros: 배부물/명렬표는 구조적으로 크롬 무의존(`print:hidden` 정확성에 안 걸림), 셸 JS가 인쇄 라우트에 미탑재 — 기존 설계 의도 유지. 탐색 화면은 셸 네비 일관성 확보. Next.js에서 동일 세그먼트(`/print/*`)를 두 route group이 나눠 가져도 최종 URL이 겹치지 않으면 충돌 없음.
- Cons: 한 URL 서브트리에 두 렌더링 모드(문서 주석으로 명시 필요), 인쇄 화면에서 복귀는 명시 "← 인쇄실" 링크.

**선택: Option C.** R10(순수 함수+단위 테스트)과 기존 도메인 자산 재사용(A·C 공통)이 결정적이고, 라우팅은 배부 인쇄물(최고 위험 출력물)의 정확성을 구조로 보장하는 C가 A를 지배. 데이터 규모(교사 1인, 학생 수백 명)에서 메모리 집계 비용은 무시 가능. 명렬표 URL 변경(`/print`→`/print/roster`)은 인쇄실 홈 상설 링크로 흡수.

**기각 근거 요약**: B는 R10 위배 소지+도메인 규칙 이중화로 기각. A는 기능적으론 가능하나 문서화된 인쇄 격리 의도(`app/(shell)/layout.tsx:7`)를 뒤집고 배부물 정확성을 CSS 은닉에 의존시키므로 C로 대체.

---

## Requirements Summary

스펙 문서의 Goal/Constraints/Non-Goals을 그대로 승계한다(재기술 생략, 스펙 §Goal~§Non-Goals 참조). 핵심:
- 통계실(`app/(shell)/stats/page.tsx`, 현재 카운트 카드 8개): ①이상징후 경보 ②성적 분석(분반 단위, recharts) ③기록 커버리지 매트릭스 ④업무 진척 — 4섹션 재구축.
- 인쇄실(`app/print/page.tsx`, 현재 셸 밖 명렬표): 네비 등록 → 범위 선택(담임반/분반) → 4플래그 학생 목록 → 학생별 상세 점검 → 배부용 인쇄. 기존 명렬표 인쇄 기능 유지.
- 경보 임계값(코드 상수): ①출결 최근 30일 (지각+조퇴+결석+결과) ≥3건 AND 직전 30일 대비 증가 ②동일 과목 중간→기말 환산 15점 이상 하락 ③최근 21일 관찰·행특 0건(담임반=행특 포함, 수업 학생=관찰만).

## Architecture Decisions

### AD-1. 신규 도메인 모듈 (순수 함수, 단위 테스트 필수)
- `lib/domain/stats-alerts.ts` — 경보 3종:
  - `attendanceSurge(recent30: number, prev30: number): boolean` — `recent30 >= ATTENDANCE_SURGE_MIN(3) && recent30 > prev30`.
  - `gradeDrop(midConverted: number|null, finalConverted: number|null): boolean` — 둘 다 존재 && `mid - final >= GRADE_DROP_POINTS(15)`. **주의: 환산점수 기준**(스펙 R9 원문 그대로). 중간/기말 가중치가 달라 환산 만점이 다른 과목에선 낙폭이 과대/과소평가될 수 있음 — 상수 주석에 명시(후속에서 원점수 기준 전환 여지).
  - `recordGap(obsCount21d: number, behaviorCount21d: number, isHomeroomStudent: boolean): boolean` — 담임반 학생: 둘 다 0, 수업 학생: 관찰 0.
  - 임계값 상수(`ATTENDANCE_SURGE_MIN=3`, `GRADE_DROP_POINTS=15`, `RECORD_GAP_DAYS=21`, `ATTENDANCE_WINDOW_DAYS=30`)는 이 파일에서 export(설정 UI 없음 — Non-Goal).
- `lib/domain/stats-insights.ts` — 분포·커버리지·진척 순수 계산:
  - `histogram(scores: number[], binSize: number): {label, count}[]`, `basicStats(scores): {mean, stddev, median, n}` — stddev는 **모표준편차(population, n으로 나눔)**로 확정(분반=전수 집단, 단위 테스트 결정론 보장).
  - `coverageMatrix(rows: {studentYearId, kind}[]): 학생×유형 카운트 + 부족 학생 정렬(합계 오름차순, 동률 시 이름순)`.
  - `progressSummary`/`draftCompletionRate`/`reportProcessRate` — 카운트 입력 → 비율 산출(0/0 = null 처리 명시).
- 기존 `lib/domain/student-report.ts`(1~88행)는 **수정 0**.

### AD-2. 신규 쿼리 계층 (행 수집 전용)
- `lib/db/queries/stats-insights.ts`:
  - `getAlertInputs(db, ownerId, year)` — 학생별 출결 30일×2윈도(`attendance_records.date`, kind 4종: `lib/db/schema/enums.ts:78`의 late/early_leave/absent_period + absent 계열), 과목별 중간/기말 환산점, 21일 관찰(`subject_observations`)·행특(`homeroom_behavior_notes`) 건수, 담임반 소속(`homeroom_members`→`homeroom_classes`, `lib/db/schema/classes.ts:22`).
    - **환산 산출 경로 확정(Critic 개선 #3)**: 과목별 `getGradeView` 호출이 아니라 **`jipil_scores` 직접 조회 + `subjects.jipilMidWeight/FinalWeight/Enabled` 가중 환산** — `lib/db/queries/student-report.ts:139-165`와 동일 규칙(활성 회차만, raw×weight/100)을 적용한다. 경보는 전 과목×전 학생 스캔이라 과목별 뷰 재계산보다 직접 조회가 적합.
  - `getSectionGradeAnalysis(db, ownerId, sectionId)` — `getGradeView()`(`lib/db/queries/grades.ts`) 재사용으로 분반 수강생 환산점 목록 + 중간/기말 개별값 + 수행 항목별 입력률/평균. 같은 과목 타 분반 비교는 과목 내 분반 목록 순회.
  - `getCoverageRows(db, ownerId, year)` — 관찰·행특·세특초안(`special_note_drafts`)·창체 4유형 학생별 카운트. **창체 매핑 확정(Architect 필수수정 #1)**: `creative_activity_records`(`lib/db/schema/records.ts:79-87`)는 `clubId` 단위(학생 컬럼 없음)이므로 학생별 카운트는 **`creative_activity_student_overrides`(`records.ts:90-104`, `recordId`+`studentYearId`) 행 수**로 계산한다. 근거: 커버리지 매트릭스의 목적은 "개별화된 기록이 부족한 학생" 탐지 — 공통 기록(commonBody)은 부원 전원에 동일 적용되어 학생 간 변별력이 없고, 개인화 기입(override)이 있어야 그 학생의 창체 기록이 준비된 것으로 본다. 빈 상태: override 0건 학생은 창체 0으로 표기(동아리 미가입과 구분 불요 — 매트릭스는 카운트만).
  - `getWorkProgress(db, ownerId, year, sem)` — 분반별 진도율(`computeProgressRates` 계열, `lib/db/queries/progress.ts` 재사용), 세특 완성률(`special_note_status='finalized'` — `lib/db/schema/enums.ts:61`), 신고서 처리율(`attendance_records.reportRequired/reportSubmitted` — `getOwnerStats`와 동일 필터, `lib/db/queries/stats.ts:86`).
- 날짜 윈도는 KST 기준 오늘에서 역산. **KST 유틸 확정(Critic 개선 #2)**: 재사용 가능한 today 유틸은 현재 없음(`lib/db/queries/progress.ts:39-41`의 `today()`는 UTC slice, 로컬 함수) — `Asia/Seoul` 변환 패턴은 `lib/domain/google-event.ts`를 원본으로 삼아 `lib/domain/stats-alerts.ts`(또는 공용 위치)에 **단위 테스트 포함 `todayKST(): string`(YYYY-MM-DD) 헬퍼를 신규 작성**하고 경보 윈도 3종이 모두 이를 사용한다(서버 UTC 구동 시 자정 경계 오류 방지).

### AD-3. 통계실 UI (`app/(shell)/stats/`)
- `page.tsx`(서버): 4섹션 순서 고정 — ①경보 ②성적 분석 ③커버리지 ④진척. 기존 카운트 카드 8개는 ④진척 하단에 "전체 기록 현황"으로 축소 유지(`getOwnerStats` 재사용, 삭제 아님 — 정보 손실 0).
- 섹션별 빈 상태 문구 필수(AC-S1): 경보 "특이사항 없음", 성적 "성적 데이터 없음", 커버리지 "학생 없음", 진척 "분반 없음".
- 차트(recharts)는 클라이언트 컴포넌트로 분리: `app/(shell)/stats/ui/grade-charts.tsx`(히스토그램=BarChart, 중간→기말 추이=학생별 slope 표시 또는 정렬 산점, 분반 비교=grouped BarChart, 수행 입력률=가로 Bar). 다크 remap 팔레트 톤은 CSS 변수/기존 Tailwind 스케일에서 색상 상수 추출.
- 분반 선택은 URL searchParam(`?section=`) — 서버 컴포넌트 재조회, 클라이언트 상태 최소화.

### AD-4. 인쇄실 라우팅·네비 (Option C — 인쇄 필요 기준 분리)
- **셸 안(탐색 화면)**:
  - `app/(shell)/print/page.tsx` — 범위 선택(담임반 목록=`homeroom_classes`, 분반 목록=`course_sections`) + 선택 시 학생 목록(플래그 배지). 명렬표 인쇄(`/print/roster`)로 가는 상설 링크 포함.
  - `app/(shell)/print/[studentYearId]/page.tsx` — 상세 점검(교사용 화면 전용, R8.4): `getStudentReport()`(`lib/db/queries/student-report.ts:79`)를 학생의 수강 분반별로 표시 + 출결 요약 + 기록 현황(관찰/행특/세특 건수). '배부용 인쇄' 버튼 → handout으로 이동.
- **셸 밖(인쇄 화면, 크롬 무탑재)**:
  - `app/print/roster/page.tsx` — 기존 `app/print/page.tsx`를 이동(표 마크업·`PrintButton` 동작 불변). 기존 `app/print/page.tsx`는 삭제(그래야 `/print`가 셸 홈으로 해석 — 동일 URL 이중 정의는 빌드 에러). `app/print/print-button.tsx`는 제자리 유지(roster·handout이 같은 트리에서 import).
  - `app/print/[studentYearId]/handout/page.tsx` — 배부용(R8.5): 지필(중간/기말 환산+추이+분반 평균 대비 위치)·수행(항목별 점수/만점·미입력)·출결 요약(kind×reason 카테고리 집계만, `note_field` 미조회). **표 전용, recharts 미사용**(흑백 판독성 확정 — 스펙 허용 폴백을 기본 채택). `PrintButton` 재사용, 화면 컨트롤은 `print:hidden`, "← 인쇄실" 복귀 링크.
  - Next.js 라우팅 확인: `(shell)` 그룹과 루트가 `/print/*` 서브트리를 나눠 가져도 최종 URL이 겹치지 않으면 충돌 없음. `/print/roster`(정적)가 `/print/[studentYearId]`(동적)보다 우선 매칭.
  - **라우트 분할 검증 게이트+폴백(Critic 개선 #1)**: 이 주장은 `next build`로만 검증됨(tsc·vitest는 라우트 충돌 미검출) — step 7·8 직후 `npm run build`를 실행해 라우트 매니페스트 생성 확인. 두 route group이 `[studentYearId]` 동적 세그먼트를 공유하는 구성이 빌드 에러를 내면 **폴백: handout 세그먼트를 `/print/handout/[studentYearId]`(셸 밖 고유 세그먼트)로 개명**(크롬 무탑재 원칙은 유지, 링크 1곳만 변경).
- 학생 목록 플래그 배치: `getStudentReport`는 학생당 ~6쿼리 + 학생마다 `getGradeView` 재계산(`student-report.ts:221`)이라 목록(≤40명)에선 O(6N) — **배치 함수 `getStudentReportsForSection(db, ownerId, sectionId)` 신규**(도메인 함수 4종 재사용, 코호트는 1회만 계산). **주의(Architect)**: `getGradeView`는 과목 전체 행 반환(`grades.ts:271-292`) — 코호트는 단건 함수와 동일하게 **분반 enrollments로 필터**(`student-report.ts:220-224` 로직 복제)해야 하며, 단건 대조 테스트에서 코호트 필터링을 명시 검증.
- **담임반 스코프 플래그(확정 해석, 스펙 AC-P1의 미명세 분기)**: 4플래그 중 3종(jipilTrend·sectionRank·performanceMissing)은 구조적으로 분반 스코프(`getStudentReport`가 `sectionId` 필수, `student-report.ts:83`) — 담임반 학생은 내 분반 0~N개 수강이라 담임 스코프에선 정의 불가. 따라서 **담임반 목록 = 관찰부족 플래그+출결 요약 축소 배지, 분반 목록 = 4플래그 전체, 상세 화면 = 수강 분반별 4플래그 전체 표시**. Architect 검증 결과 "acceptable interpretation"(침묵 회귀 아님 — 본 단락이 공식 근거 기록).
- 네비: `app/ui/nav-config.ts:16` `SPACES`에 `{ href: "/print", label: "인쇄실", icon: "🖨️" }` 추가(통계 다음). 파일 상단 주석 "8개 공간"→"9개 공간" 갱신. 통계실의 기존 `/print` 링크(`app/(shell)/stats/page.tsx:42-47`)는 새 인쇄실 홈으로 자연 연결(경로 동일). 하단 탭바/더보기 오버플로 동작 실측 확인.
- 문서 정합: `app/(shell)/layout.tsx:7` 주석을 새 구조("인쇄 출력 라우트(/print/roster, /print/*/handout)는 셸 밖, 인쇄실 탐색 화면은 셸 안")로 갱신.

### AD-5. 인쇄 CSS·셸 크롬
- `app/globals.css:123-137` `@media print`(흑백 강제)는 그대로 재사용. 인쇄 출력 라우트는 셸 밖(Option C)이라 크롬 유출이 구조적으로 불가능.
- 방어적 보강(선택→채택): 셸 크롬 3종(Sidebar·GlassHeader·BottomTabBar, `app/ui/app-shell.tsx:14-24`)에 `print:hidden` 추가 — 사용자가 셸 화면(점검 화면 등)에서 Ctrl+P 할 때의 우발 인쇄 품질 확보. 현재 `app/ui`에 `print:hidden` 0건(Architect grep 확인).

### AD-6. recharts 도입
- **`recharts@^3`(React 19 peer 지원 확정 버전)** 를 dependencies에 추가 — `npm install` 이 `--force`/peer-dep 에러 없이 완료되어야 함(게이트 항목). 클라이언트 컴포넌트 전용, `app/(shell)/stats/ui/` 밖 import 금지(공개 번들 격리 관례 유지). SSR 이슈는 클라이언트 컴포넌트 경계로 해소(`ResponsiveContainer`는 브라우저 필요).

## Implementation Steps

| # | 작업 | 파일 | 산출 |
|---|------|------|------|
| 1 | recharts@^3 설치(peer 에러 0) | `package.json` | dependency 추가 |
| 2 | 경보 도메인 | `lib/domain/stats-alerts.ts` + `stats-alerts.test.ts` | 순수 함수 3종+상수, 경계값 테스트(≥3/=3/증가없음, -15/-14.99, 21일 경계, 담임/비담임) |
| 3 | 인사이트 도메인 | `lib/domain/stats-insights.ts` + `stats-insights.test.ts` | histogram/basicStats(모표준편차)/coverageMatrix/비율 3종, 빈 배열·0/0 테스트 |
| 4 | 쿼리 계층 | `lib/db/queries/stats-insights.ts` (+ 필요시 integration test) | AD-2 4함수(창체=overrides), 전부 ownerId 스코프 |
| 5 | 배치 학생 보고서 | `lib/db/queries/student-report.ts`에 `getStudentReportsForSection` 추가(기존 함수 불변) | 분반 일괄 플래그 + 단건 대조 테스트(코호트 필터 검증) |
| 6 | 통계실 UI | `app/(shell)/stats/page.tsx` 재작성, `app/(shell)/stats/ui/*.tsx` 신규 | 4섹션+빈상태+recharts |
| 7 | 명렬표 이동·인쇄실 홈 | `app/print/page.tsx` → `app/print/roster/page.tsx`(삭제 포함), `app/(shell)/print/page.tsx` 신규 | 범위선택+목록, `/print` 충돌 0 |
| 8 | 상세 점검·배부 인쇄 | `app/(shell)/print/[studentYearId]/page.tsx`, `app/print/[studentYearId]/handout/page.tsx` | 셸 점검 화면+셸 밖 표 전용 인쇄물 |
| 9 | 네비/셸/주석 | `app/ui/nav-config.ts`, 셸 크롬 `print:hidden`, `app/(shell)/layout.tsx:7` 주석 갱신 | 공간 9개 |
| 10 | 게이트 검증 | — | 아래 Verification Steps |

의존성: 1→(2,3 병렬)→4→5→(6,7 병렬)→8→9→10. DB 마이그레이션 없음.

## Risks & Mitigations

| 리스크 | 완화 |
|--------|------|
| `/print` URL 의미 변경(명렬표→인쇄실 홈)으로 기존 북마크 혼란 | 인쇄실 홈 최상단에 "학생 명렬표 인쇄" 링크 상설. 명렬표 자체 기능·마크업 불변(AC-P4) |
| 인쇄 출력물에 셸 크롬 유출 | Option C로 구조 차단(인쇄 라우트 셸 밖) + 방어적 `print:hidden` + 인쇄 미리보기 실측 게이트 |
| recharts 다크 테마 가독성(기본 팔레트가 라이트 전제) | 색상은 remap 팔레트 상수로 명시 주입, 축/그리드 색 지정. 390px 모바일 렌더 확인 |
| recharts×React19 peer 불일치 | `recharts@^3` 명시, `--force` 없이 설치 완료를 게이트 항목화 |
| `getStudentReportsForSection` 배치가 기존 단건 함수와 결과 불일치(특히 코호트가 과목 전체로 오염) | 동일 도메인 함수 4종 사용 + 분반 enrollments 필터 복제 + 단건 결과 대조 테스트(코호트 필터 명시 검증) |
| 환산점 기준 -15점 임계값의 과목별 체감 편차 | 스펙 R9 확정값 그대로 구현, 상수 주석으로 한계 명시(후속 조정 여지) |
| 경보의 담임반 판정(`homeroom_members` 유무)과 "수업 학생" 구분 오류 | 판정 로직을 쿼리 1곳으로 집중, 단위 테스트에 담임/비담임 케이스 포함 |
| 창체 커버리지 의미 오해(공통 기록 vs 개인화 기입) | AD-2에서 overrides 기준으로 확정·근거 기록(Architect 필수수정 #1 반영) |

## Verification Steps (AC-A 게이트)

0. `npm install`(recharts@^3) — peer-dep 에러/`--force` 없이 완료.
1. `npm run typecheck` — tsc 0건.
2. `npm test` — vitest 전체 green(신규 stats-alerts/stats-insights 단위 테스트 + 배치/단건 대조 테스트 + todayKST 테스트 포함).
2-1. `npm run build` — 라우트 매니페스트 정상 생성(`/print` 셸 홈, `/print/roster`, `/print/[studentYearId]`, `/print/[studentYearId]/handout` 4경로 공존, 충돌 0). 실패 시 AD-4 폴백(handout 세그먼트 개명) 적용 후 재검증.
3. 배부 인쇄물 경계 grep: handout 렌더 경로에서 `subject_observations|homeroom_behavior_notes|counseling|note_field` 참조 0건 + 실측 화면에서도 0건(AC-P3).
4. 데이터 있는 계정 실측: 통계실 4섹션(AC-S1~S5), 인쇄실 5단계 흐름(AC-P1~P3), 명렬표(AC-P4).
5. 빈 데이터 상태: 신규 계정 관점으로 각 섹션 빈 상태 문구 확인.
6. 인쇄 미리보기: handout·roster 흑백 판독 + 셸 크롬 미출력(AC-C1).
7. 390px 뷰포트 가로 스크롤 0, 모바일/데스크톱 스크린샷 → 사용자 승인.
8. `git diff` 검사: `lib/db/migrations/` diff 0, `middleware.ts`·공개 페이지·RLS diff 0(AC-C2), `lib/domain/student-report.ts` diff 0.
9. 경보 층위 분리 확인(스펙 Constraint): 통계실 경보 3종의 데이터 윈도(30일×2·21일 추세)가 홈 '오늘의 할 일 알림'(당일 처리 항목)과 판정 기준·표시 항목에서 중복되지 않음을 실측 화면 대조로 확인(reasoned note로 기록).

## Acceptance Criteria

스펙의 AC-S1~S5, AC-P1~P4, AC-C1~C2, AC-A를 그대로 채택(스펙 §Acceptance Criteria 참조 — 본 계획의 Verification Steps가 AC-A 게이트의 실행 절차).

단, AC-P4 해석 명시: "기존 명단 인쇄가 기존과 동일하게 동작" = 명렬표 표 마크업·인쇄 출력·PrintButton 동작 불변. 진입 URL은 `/print/roster`로 이동하고 `/print`(인쇄실 홈)에서 1클릭 링크 제공.

---

## ADR — 통계실·인쇄실 재구축 아키텍처

- **Decision**: 신규 집계는 순수 함수(`lib/domain/stats-alerts.ts`, `stats-insights.ts`) + 얇은 쿼리 계층(`lib/db/queries/stats-insights.ts`)으로 분리하고, 인쇄실 라우팅은 "인쇄 출력물은 셸 밖(`/print/roster`, `/print/[id]/handout`), 탐색 화면은 셸 안(`/print`, `/print/[id]`)"으로 분할한다(Option C). 배부 인쇄물은 recharts 없이 표 전용. 창체 커버리지는 `creative_activity_student_overrides` 기준.
- **Drivers**: ①스펙 R10(순수 함수+단위 테스트, 기존 테스트 불변) ②완성된 도메인 자산(`student-report.ts` 4플래그) 재사용 극대화 ③배부 인쇄물의 내용 경계·흑백 판독성은 구조로 보장(CSS 은닉 의존 최소화).
- **Alternatives considered**: A) 인쇄실 전체 셸 이관+`print:hidden` — 문서화된 인쇄 격리 의도(`app/(shell)/layout.tsx:7`) 역행, 배부물 정확성이 크롬 3종 CSS에 의존. B) SQL 집계+`/printroom` 신설 — 임계값 로직의 단위 테스트 불가 소지(R10 위배), `sectionRank` 등 기존 TS 규칙과 이중화, 공간 이원화.
- **Why chosen**: C는 A의 네비 일관성(탐색 화면)과 기존 인쇄 격리 설계(출력 화면)를 모두 보존하며, 최고 위험 산출물(학부모 배부 인쇄물)의 정확성을 라우트 구조로 보장한다. Architect 신테시스 제안을 채택, Critic이 원칙-옵션 정합성 Pass 판정.
- **Consequences**: `/print` URL 의미가 명렬표→인쇄실 홈으로 변경(명렬표는 `/print/roster`, 홈 상설 링크로 흡수). 한 URL 서브트리에 두 렌더링 모드 공존(주석으로 문서화). 셸 크롬에 방어적 `print:hidden` 추가. `next build` 게이트로 route-group 분할 검증(실패 시 handout 세그먼트 개명 폴백).
- **Follow-ups**: ①경보 임계값의 원점수 기준 전환 검토(환산점 기준의 과목별 편차 — 상수 주석에 기록) ②경보 임계값 설정 UI(Non-Goal, 필요시 후속) ③`todayKST()` 헬퍼의 전역 공용화(기존 UTC `today()` 사용처 점진 정리).

---

## Changelog

### v2 (Architect 리뷰 반영, APPROVE conditional → 필수수정 3건 전부 수용)
1. **창체 커버리지 매핑 확정**(필수 #1): `creative_activity_records`는 clubId 단위 — 학생별 카운트는 `creative_activity_student_overrides` 기준으로 AD-2에 확정·근거 기록. 리스크 표도 "구현 시 확인" → "확정 완료"로 갱신.
2. **인쇄실 라우팅 Option C 채택**(필수 #2, Architect 신테시스): 인쇄 출력 라우트(roster·handout)는 셸 밖 유지, 탐색 화면(홈·상세)만 셸 안 — `app/(shell)/layout.tsx:7` 인쇄 격리 의도 존중, 주석 갱신 작업 추가(step 9). `PrintButton` 이동 경로 명시.
3. **recharts@^3 버전 명시**(필수 #3): React 19 peer 지원 확정 버전 + peer 에러 0 게이트 항목(Verification step 0) 추가.
4. (선택 개선 수용) `getStudentReportsForSection` 코호트 분반 필터 복제 명시(`grades.ts:271-292`는 과목 전체 반환), 대조 테스트에 코호트 필터 검증 포함. `basicStats` 모표준편차 확정. 담임반 축소 배지 해석의 공식 근거 단락화.

### v3 (Critic 리뷰 반영, APPROVED — 비차단 개선 4건 전부 수용, 최종본)
1. **`next build` 게이트 추가**(Critic #1): tsc·vitest가 못 잡는 route-group 분할 충돌을 build로 검증(Verification 2-1), 실패 시 handout 세그먼트 개명 폴백을 AD-4에 명시.
2. **KST 날짜 헬퍼 확정**(Critic #2): 존재하지 않는 "기존 today() 관례" 참조 제거 — `google-event.ts`를 패턴 원본으로 `todayKST()` 신규 작성(테스트 포함)으로 교체.
3. **경보 환산 산출 경로 확정**(Critic #3): `getGradeView` 재계산이 아닌 `jipil_scores` 직접 조회+가중 환산(`student-report.ts:139-165` 규칙)으로 명시.
4. **경보 층위 분리 검증 추가**(Critic #4): 홈 '오늘의 할 일'과의 비중복 실측 대조를 Verification 9로 추가.
5. ADR 섹션 추가, Status → pending approval.
