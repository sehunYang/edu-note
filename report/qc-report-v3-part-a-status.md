# QC v3 — Part A 완료 보고서

- 작성일: 2026-06-14
- 범위: qc-report-v3.md 중 **Part A**(교실 4개 컴포넌트 재수정). 마이그레이션 0건.
- 계획: `.omc/plans/qc-v3-classroom-homeroom-plan.md` / 스펙: `.omc/specs/deep-interview-qc-v3.md`
- 실행 모드: ralph (Part A 구현 + 통합테스트 그린 + 배포)

---

## 1. 전체 진행 요약 — ✅ 완료·배포

| US | 컴포넌트 | 상태 | 검증 |
|----|----------|------|------|
| US-1 | 도메인 순수함수 | **완료** | 단위 25 green, typecheck 0 |
| US-2 | 수업계획실(차시 분반무관+월주차+시험마커) | **완료** | itest 8 green, build exit0 |
| US-3 | 진척도(여름방학 학기경계) | **완료** | itest 7 green(여름경계+fallback 2종 신규), build exit0 |
| US-4 | 성적(환산 요소분해+미시행숨김+조회 라우트) | **완료** | itest 3 green, build exit0 |
| US-5 | 세특(예시CSV+과목필터+추가입력 CRUD) | **완료** | itest 10 green, build exit0 |
| US-REPORT | 보고서 | **이 문서** | — |

**최종 검증(전부 fresh green):**
- `npm run typecheck` → exit 0
- `npm run build` → exit 0
- 전체 단위테스트 → 220 passed / 125 skipped
- Part A 통합테스트(RUN_DB_ITEST, 실DB) → **28 passed** (lesson-plan 8, setech 10, progress 7, grades 3)
- architect 검증(THOROUGH/Opus) → **VERDICT: APPROVED** (블로커 0, MINOR 2 비차단)
- deslop(ai-slop-cleaner 표준) → grades.ts 수강생 조회 중복 1건 consolidation(`listSubjectStudents` 헬퍼, ~40줄 제거). 회귀 재검증 green.

---

## 2. 변경 파일 목록 (Part A)

### 도메인 (US-1)
- `lib/domain/lesson-plan.ts` — `pickRepresentativeSection`/`representativeDates`/`monthWeekLabel`/`SectionSlots` 추가.
- `lib/domain/school-year.ts` — `resolveSemesterBoundary`/`semesterRangeWithBoundary`/`prevDay`(내부) 추가.
- `lib/domain/lesson-plan.test.ts` / `lib/domain/school-year.test.ts` — 단위테스트(총 25 green).

### 수업계획실 (US-2)
- `lib/db/queries/lesson-plan.ts` — `getPlanLength` 재작성(분반 UNION→대표분반), `getPlanView`(월주차+시험마커), `listSectionSlots`/`listSchoolDays`(내부).
- `app/classroom/plan/page.tsx` — `getPlanView` 사용 + ordinals 전달.
- `app/classroom/plan/plan-editor.tsx` — 차시 행에 `M월 W주차` + `1차/2차 시험` 마커.
- `lib/db/queries/lesson-plan.integration.test.ts` — 다분반 동치(N 분반무관) + 분반추가 불변 단언.

### 진척도 (US-3)
- `lib/db/queries/calendar.ts` — 공용 `resolveSemesterRange`(여름방학 경계, 미설정 8/14 fallback).
- `lib/db/queries/progress.ts` — `generateSemesterSessions`가 `resolveSemesterRange` 사용.
- `lib/db/queries/progress.integration.test.ts` — **신규**: 여름방학 경계(8월 수업일 2학기 분류) + fallback 단언 2종.

### 성적 (US-4)
- `lib/db/queries/grades.ts` — `getGradeView` 요소별 분해(jipilMid/jipilFinal/performanceByItem, 합산 하위호환) + `getStoredGradeTables` + `listSubjectStudents`(공용 헬퍼, deslop).
- `app/classroom/grades/page.tsx` — 분해 매핑 + "저장 테이블 조회" 링크.
- `app/classroom/grades/grades-uploader.tsx` — 미리보기 분해 컬럼(미시행 지필 열 숨김).
- `app/classroom/grades/view/page.tsx` — **신규 라우트**(저장 원자료 조회).
- `lib/db/queries/grades.integration.test.ts` — 분해 + getStoredGradeTables 단언.

### 세특 (US-5)
- `lib/setech/bulk.ts` — `bulkResultCsvExample()` 추가.
- `lib/db/queries/setech.ts` — `listExtraNotes`/`updateExtraNote`/`deleteExtraNote`.
- `lib/db/queries/audit.ts` — `extra_note_save|update|delete` 이벤트.
- `app/classroom/setech/actions.ts` — save audit + `updateExtraNoteAction`/`deleteExtraNoteAction`.
- `app/classroom/setech/page.tsx` — `enrollmentBySubject` 맵 + `listExtraNotes` 전달.
- `app/classroom/setech/setech-bulk-client.tsx` — 예시 CSV 다운로드 + 과목별 수강생 필터 + 추가입력 목록·인라인 수정/삭제.
- `lib/db/queries/setech.integration.test.ts` — 추가입력 CRUD + 과목필터 단언.

---

## 3. 핵심 설계 메모

- **차시 N(대표분반)**: `getPlanLength`/`getPlanView`는 분반 슬롯 요일 UNION을 폐기하고 `pickRepresentativeSection`(주당 슬롯 최대 분반)의 요일만 사용 → 분반 수가 N에 영향 없음(물리 97차시 버그 해소). 진척도의 분반별 차시 생성은 분반 단위 유지(의도적 차이).
- **학기 경계**: `resolveSemesterRange`(calendar.ts)가 단일 출처. 여름(6~8월) `vacation` 이벤트 최소일을 경계 B로, 없으면 8/15 fallback(=기존 8/14 경계 동치, 무중단). sem1=[3/1,B-1], sem2=[B,익년2월말].
- **성적 분해**: 원점수 저장·읽기시점 환산 불변. `getGradeView`에 jipilMid/jipilFinal/performanceByItem 추가, 합산필드 하위호환 유지(student-report.ts가 .total 사용).

---

## 4. 비차단 후속(architect MINOR, 채택 보류)

- **MINOR-1**: `lesson-plan.ts` 시험 마커 — 동일 차시 ordinal에 두 시험이 겹치면 Map 덮어쓰기. examOrdinal 1/2는 보통 다른 날짜라 무해. 방어적 tie-break는 추후 하드닝.
- **MINOR-2**: `grades-uploader.tsx` `hasAny`가 `total !== 0`을 "성적 있음"으로 판정 — 정당한 0점이 빈값처럼 보임(표시 전용, 데이터 무영향).

---

## 5. 남은 작업 (Part B — 이번 범위 밖, 별도 승인 필요)

계획서 US-0b~US-13. 마이그레이션 + 담임 교실 허브 + 학생 안내 페이지. foundational 결정(FD1~FD4) 선반영 필요. 상세는 qc-report-v3.md '담임 교실' 섹션 참조.

---

## 6. 배포

- 커밋·`git push origin main` → Vercel Hobby 자동 프로덕션 배포. 마이그레이션 0건(코드만).
