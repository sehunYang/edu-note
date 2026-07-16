# 오늘의 학교 — "오늘 수업" + "오늘 시간표" 통합 카드

**Status:** pending approval
**Date:** 2026-07-16
**사용자 결정(확정):** ①다교시 분반은 교시별 행 유지+체크 동기 ②데스크톱 전체 폭 ③완료 행 흐림+취소선 ④모바일 두 줄 레이아웃

---

## 요구사항 요약

`/today`의 두 카드(오늘 수업 체크 카드, 오늘 시간표)를 **시간표 골격 기반 단일 카드**로 통합한다. 시간표의 교시순·시간·과목색은 유지하면서 각 행에 체크박스 + 차시번호 + 차시 내용 요약을 이식한다. 데스크톱/모바일 레이아웃을 각각 설계한다.

### 핵심 코드 사실
- 두 위젯은 **같은 소스**를 씀: `timetableSlots ⋈ courseSections ⋈ subjects`.
  - `getTeacherTimetable`(`lib/db/queries/timetable.ts:169`) → `TimetableViewSlot{weekday,period,subjectName,label}` — 주간 전체를 가져와 `todaySlotsFor`로 오늘만 필터.
  - `listTodayLessons`(`lib/db/queries/sessions.ts:278`) → `TodayLesson{sectionId,subjectName,label,periods[],ordinal,content,done}` — 오늘 요일 슬롯을 분반별로 묶고 차시/체크 상태 합성.
- **`TodayLesson`만으로 통합 카드 렌더 가능**: periods를 교시별 행으로 펼치면(explode) 시간표 정보가 전부 복원됨 → `/today`에서 `getTeacherTimetable` 쿼리 자체를 제거 가능(Promise.all 1건 감소).
- 체크 상태는 `class_sessions (sectionId, date)` unique — **분반+날짜 단위**가 유일 진실원(`toggleTodaySessionAction`, `app/(shell)/today/actions.ts:290`). 교시별 개별 체크는 모델상 불가(사용자 인지·수용).
- 기존 UI 자산: `SLOT_COLORS`(과목별 안정 색)·`PERIOD_TIMES`(교시별 표준 시간)는 `timetable-widget.tsx:9-29`, 낙관 토글+재수화 로직은 `today-lessons-card.tsx:21-37`.
- 현재 그리드(`page.tsx`): 수업카드(2칸)→출결카드(2칸)→시간표(1)|급식(1)→캘린더(1)|공지(1)→요약(2).

---

## 수용 기준

- **AC-1** `/today`에 통합 카드 `오늘 시간표` 1개만 렌더(기존 "오늘 수업"·"오늘 시간표" 카드 제거). 위치는 기존 수업 카드 자리(그리드 최상단, `md:col-span-2` 전체 폭).
- **AC-2** 행 = **교시 단위**, 교시 오름차순. 각 행: 체크박스 · 교시+표준시간(`PERIOD_TIMES`) · 과목명+분반(과목별 안정 색 유지) · N차시 · 차시 내용(null이면 "내용 미입력").
- **AC-3** 다교시 분반(예: 수학A 1·3교시)은 행이 2개 생기고, **어느 행을 체크해도 같은 분반의 모든 행이 즉시 함께 토글**(낙관 상태가 sectionId 키라 자동 동기) + 서버는 기존 `toggleTodaySessionAction(sectionId, date, done)` 그대로(시수관리 연동 불변).
- **AC-4** 완료 행: **흐림(opacity)+취소선** — 과목 색 배경 위에 적용.
- **AC-5** 반응형: 데스크톱(md+) = 한 줄(내용 truncate), 모바일 = **두 줄**(윗줄: 체크·교시·시간·과목·분반 / 아랫줄: N차시·내용, 줄바꿈 허용·잘리지 않음). 마크업은 단일 DOM + Tailwind 반응형 클래스(중복 DOM 금지).
- **AC-6** `/today`의 `Promise.all`에서 `getTeacherTimetable` 제거, `/today`에서 `todaySlotsFor`·`TimetableWidget`·`TodayLessonsCard` 참조 소거. **단 `timetable-widget.tsx`·`todaySlotsFor`는 메인 홈(`app/(shell)/page.tsx:16,19`)이 계속 사용하므로 파일 유지**(구현 중 발견 — 홈은 이번 범위 밖). `today-lessons-card.tsx`만 삭제, 신규 `today-schedule-card.tsx`로 대체.
- **AC-7** 빈 상태 문구 유지: "오늘 수업이 없거나 시간표 미동기화."
- **AC-8** 커버리지 패리티: 기존 시간표 위젯이 보여주던 슬롯 집합 == 통합 카드 행 집합(두 쿼리의 where 조건 비교로 확증 — 둘 다 ownerId+year+semester+weekday 동일 필터인지 구현 시 검증, 차이 발견 시 보고 후 조정).
- **AC-9** `npm run typecheck`/`test`/`build` 그린, 기존 테스트 회귀 0.

## 구현 단계

### 1. 신규 `app/(shell)/today/today-schedule-card.tsx` ("use client")
- props: `lessons: TodayLesson[]`, `date: string`, `className?`.
- 행 생성: `lessons.flatMap(l => l.periods.map(p => ({...l, period: p}))).sort((a,b) => a.period - b.period)`.
- `SLOT_COLORS`·`colorBySubject`·`PERIOD_TIMES`를 `timetable-widget.tsx`에서 이관(과목별 안정 색 로직 그대로).
- 체크 상태: `doneBySection: Record<sectionId, boolean>` + `useEffect` 재수화 + `useTransition` 낙관 토글 — `today-lessons-card.tsx:21-37` 로직 이관. 같은 분반의 두 행이 같은 키를 읽으므로 동기 토글 자동 충족(AC-3).
- 행 마크업(단일 DOM 반응형):
  - 컨테이너: `flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-2 py-1.5 ${색상}` + 완료 시 `opacity-60` 및 텍스트 `line-through`.
  - 윗줄 요소: 체크박스, `N교시 HH:MM`(w-20 shrink-0), `과목 분반`.
  - 내용 요소: `N차시 · 내용` — 모바일 `w-full pl-7`(둘째 줄로 내려감), md+ `md:w-auto md:pl-0 md:flex-1 md:truncate`(같은 줄 복귀).
- 빈 상태: AC-7 문구.

### 2. `app/(shell)/today/page.tsx` 수정
- import/Promise.all에서 `getTeacherTimetable` 제거, `todaySlotsFor`·`todaySlots` 소거(`kstToday`의 weekday는 `listTodayLessons`에 계속 필요).
- `<TodayLessonsCard …>` → `<TodayScheduleCard lessons={todayLessons} date={date} className="md:col-span-2" />`, `<TimetableWidget …>` 렌더 제거.
- 그리드 잔여 배치: 급식(1)|캘린더(1) → 공지(1)|요약(2가 다음 줄) 자연 흐름 — 빌드 후 시각 확인, 어색하면 공지 옆 배치만 미세 조정(요약을 1칸으로 줄이는 등은 범위 외).

### 3. 구파일 삭제
- `today-lessons-card.tsx`, `timetable-widget.tsx` 삭제(참조 0 확인 후).

### 4. 검증
- AC-8 쿼리 조건 대조(`sessions.ts:297-` where vs `timetable.ts:175-` where).
- `npm run typecheck` / `test` / `build` 그린.
- 로컬 `next start` 데스크톱·모바일 뷰포트 렌더 확인(두 줄 전환, truncate, 색상, 완료 스타일).
- 배포 후 실기기 확인(사용자): 체크 토글·동기 토글·시수관리 반영.

## 위험 및 완화

| 위험 | 완화 |
|---|---|
| R1: 두 쿼리 필터 차이로 슬롯 누락/추가 | AC-8 구현 시 where 절 대조 필수 단계화. 차이 발견 시 사용자 보고 후 진행 |
| R2: 다교시 동기 토글을 개별 체크로 오해 | 카드 설명 없이도 동작이 즉시 보임(양쪽 동시 체크). 필요시 행 hover 타이틀로 보완 — 기본은 무설명(사용자 본인 1인 앱) |
| R3: 모바일 두 줄에서 완료 취소선이 내용 줄에 안 걸림 | 취소선을 행 컨테이너가 아닌 텍스트 span들에 일괄 적용 |
| R4: 그리드 재배치 후 어색한 빈 칸 | 시각 확인 단계 포함, 미세 조정 |

## 검증 단계
1. typecheck/test/build (자동)
2. 쿼리 패리티 대조 (자동/코드 리뷰)
3. 로컬 데스크톱·모바일 뷰포트 렌더 확인
4. 배포 후 실기기 체크 토글 확인 (사용자 게이트)
