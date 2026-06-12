# Deep Interview Spec: 교실(Classroom) 허브 — QC v2 2-2

## Metadata
- Interview ID: classroom-hub-2-2
- Rounds: 17
- Final Ambiguity Score: 3.7%
- Type: brownfield
- Generated: 2026-06-12
- Threshold: 0.05 (5%)
- Threshold Source: user-override (in-session) — 기본값 0.2(default)에서 사용자가 "5% 미만까지" 요청
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.97 | 0.35 | 0.340 |
| Constraint Clarity | 0.97 | 0.25 | 0.242 |
| Success Criteria | 0.96 | 0.25 | 0.240 |
| Context Clarity | 0.94 | 0.15 | 0.141 |
| **Total Clarity** | | | **0.963** |
| **Ambiguity** | | | **0.037** |

## Topology
교실(`/classroom`)은 세팅실처럼 여러 컴포넌트를 묶는 **자유 탭 허브**(게이팅 없음). 핵심: 수업 관련 데이터가 모두 이곳으로 모인다. 6개 컴포넌트 전부 이번 2-2 단계에서 구현(deferral 없음).

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 수업 계획실 | active | 과목단위 차시 계획(수업내용+핵심개념 해시태그) | R2·R3·R14·R16 — 차시 정의·작성단위·일년과목·매핑 확정 |
| 수업 진척도 관리 | active | 시수관리 UI 전면 재작성, 예정 팝업, 완료 시 실제기록 | R7·R13·R16 — 스키마·팝업범위·계획매핑 확정 |
| 성적 기록 | active | 수행(점수+서술)·지필(원점수) CSV 일괄 업로드 | R4·R9·R12 — 저장모델·수행CSV·지필CSV 확정 |
| 교과 관찰기록 | active | /observations에서 격상, 분반 필수귀속, 자동매칭 | R15 + 인접 fix(날짜·수정·삭제) |
| 학생 분석 보고서 | active | 인적·관찰·성적 종합 + 규칙기반 진단 플래그 | R5·R11 — 진단 형태·구체 플래그 확정 |
| 세특 작성 | active | /setech 이동, 과목·분반별 CSV 왕복 | R6·R10·R17 — 복합키·원천자료·검증 확정 |

## Goal
기획안 §2 "🏫 교실"의 미구현 상태를 해소한다. `/classroom`을 **자유 탭 허브**(세팅실과 달리 순차 게이팅 없음)로 만들고, 그 아래 6개 컴포넌트를 `/classroom/{plan, progress, grades, observations, report, setech}` 경로로 배치한다. 각 컴포넌트는 **현재 날짜 기준 활성 학기**(8/15 경계)를 자동 대상으로 하되 상단 드롭다운으로 1↔2학기 수동 전환이 가능하며, 선행 데이터가 없으면 잠그지 않고 안내 메시지를 띄운다.

## Constraints
- 허브: 게이팅 없는 자유 탭/그리드. 라우팅 `/classroom/*`. 빈 상태는 잠금 대신 안내 메시지.
- 학기 스코핑: 현재 날짜 기준 활성 학기 자동 + 수동 전환. 일년 과목은 양 학기 모두 등장하되 학기별 행이 독립.
- **수업 계획실**
  - 차시 = 시간표 슬롯(timetableSlots) 기반 **실제 날짜 차시**(기존 시수관리와 동일 엔진, 방학·휴업일 제외).
  - 계획 작성 단위 = **과목단위**(차시 1..N). 각 분반의 실제 날짜 차시가 순서대로 매핑.
  - 차시별 입력: '수업 내용'(텍스트) + '핵심 개념'(해시태그 형태, 복수 키워드, text[] 배열).
  - 1학기/2학기 체크, 일년 과목은 둘다 체크. **일년 과목도 학기별 완전 독립 계획**.
- **수업 진척도 관리**
  - UI·로직 전면 재작성(기존 /sessions 재사용 안 함). **DB는 classSessions 재사용** + 실제기록은 **신규 테이블(session_records)**.
  - 모든 차시 초기 상태 '예정'. 상태: 완료/미진행/예정.
  - 첫 화면 팝업 = **이번주(월~일) ∪ 과거 예정(연체)** 차시. '미진행' 전환 시 명단에서 제거.
  - '완료' 전환 시 '실제 수업내용'·'핵심개념'·'평가 아이디어' 입력창. 실제수업내용·핵심개념은 계획에서 **토글로 불러오기(순서 기본 매핑 + 수동 재지정 가능)**, 불러온 뒤 수정 가능.
  - 평가 아이디어 = 자유 서술(추후 출제실 1차 데이터). 현재는 기록만.
- **성적 기록**
  - 저장 source of truth = **원점수만**. 환산점수는 읽기시점 계산(반영비율은 세팅실 jipil*Weight 소유).
  - 수행평가 CSV = **항목(performanceItem)별 별도 파일**(열: 학번, 이름, 점수, 서술). 점수는 세팅실 수행 반영비율 초과 불가.
  - 지필 CSV = **과목×회차(중간/기말)별 파일**, jipilMidEnabled/FinalEnabled 활성 회차만 업로드 칸 노출. 원점수 100점 만점.
  - 예시 CSV 다운로드 제공(수행·지필 각각).
- **교과 관찰기록**
  - /observations에서 교실 컴포넌트로 격상. 학생 선택 시 수강 분반 자동 매칭(복수면 토글 유지). 분반 선택 시 학생 명단을 해당 분반으로 필터.
  - **관찰은 항상 분반 귀속(sectionId NOT NULL로 강화)**. 미수강 학생은 관찰 불가.
  - 날짜 입력(기본 당일 + 캘린더 선택), 수정·삭제 버튼.
- **학생 분석 보고서**
  - 각 수업/분반에서 학생 선택 → 인적사항·관찰·성적 종합 한 화면.
  - 진단 = **규칙기반 지표 플래그/마크**(AI api 미사용). 자연어 진단 문장 없음.
  - 플래그 4종: ① 지필 성적 추이 화살표(1회→2회 환산점수 비교 상승/하락/유지) ② 관찰기록 부족 경고(임계 이하) ③ 수행평가 미입력/미제출 플래그 ④ 분반 평균 대비 위치(상/중/하).
- **세특 작성**
  - /setech를 교실로 이동. 학생별 프롬프트 → **과목·분반별 CSV 왕복**으로 전환.
  - 내보내기 CSV: 여러 분반 한 파일, 매칭 키 = **학번 + 과목 복합키**.
  - 원천자료 = 교과 관찰기록(본문+키워드) + 수행평가 **서술(점수 제외)** + 학생 추가 입력 내역.
  - 학생 추가 입력 내역 = 세특 페이지에서 **학생×과목 단위** 자유서술 입력·저장(studentExtraNotes), 누적 가능.
  - 재업로드 CSV: 코워크 생성 세특 초안을 복합키로 매칭 → specialNoteDrafts 저장. **행별 verify(바이트·기재금지·문체) 실행, 위반 행은 경고 표시하되 저장 허용**.

## Non-Goals
- 세특/관찰 등 생기부 원천자료에 **점수·지필성적 일절 미포함**(생기부 기재요령 위반). 수행평가는 서술만, 지필은 미포함.
- 서버에서 AI api 호출 없음(학생 분석 보고서 진단은 규칙기반, 세특은 코워크 외부 생성). API가 필요한 진단은 폐기.
- 행동특성 기록은 **교실 허브 컴포넌트가 아님**(담임 '행동발달 및 특기사항'용). 본 작업에서는 인접 보정만(아래 참조).
- 출제실/통계실/인쇄 연동은 본 스코프 밖(평가 아이디어는 추후 출제실 1차 데이터로만 적재).
- 기존 /sessions(시수관리)는 제거하지 않음(교실 진척도와 별개; classSessions 공유).

## Acceptance Criteria
- [ ] `/classroom` 허브가 게이팅 없이 6개 컴포넌트 링크(탭/그리드) 제공, 각 하위 경로 `/classroom/*` 동작.
- [ ] 모든 컴포넌트가 활성 학기 자동 + 상단 드롭다운 수동 전환을 공유.
- [ ] 수업 계획실: 과목 선택 → 학기·방학 기준 차시 수 계산 → 차시별 수업내용·핵심개념(해시태그) 저장. 일년 과목은 학기별 독립 계획.
- [ ] 수업 진척도: 첫 화면에 이번주∪연체 예정 차시 팝업. 완료 전환 시 계획 토글 불러오기(순서 기본+수동 재지정), 실제기록 session_records 저장.
- [ ] 성적 기록: 수행 항목별 CSV·지필 회차별 CSV 예시 다운로드 + 업로드. 원점수 저장, 표시 시 환산. 비활성 회차/미시행 처리.
- [ ] 교과 관찰: 분반 필수 귀속, 학생↔분반 자동매칭(복수 토글), 분반→학생 필터, 날짜(기본 당일+캘린더), 수정·삭제.
- [ ] 학생 분석 보고서: 인적·관찰·성적 종합 + 4종 규칙 플래그 표시(AI 미사용).
- [ ] 세특 작성: 과목·분반별 원천자료 CSV(점수 제외) 내보내기, 학생×과목 추가입력, 재업로드 시 학번+과목 매칭·행별 verify 경고·저장.
- [ ] 인접 보정: 행특 기록 담임반 학생 제한 + 날짜·수정·삭제 추가.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 교실도 세팅실처럼 순차 게이팅 | R1 허브 구조 | 자유 탭 허브, 게이팅 없음 |
| 차시는 추상 주차×시수 | R2 차시 정의 | 시간표 슬롯 기반 실제 날짜 차시 |
| 계획은 분반단위 | R3 작성 단위 | 과목단위 + 분반 순서 매핑 |
| 성적은 환산점수 저장 | R4 Contrarian | 원점수만 저장, 읽기시점 환산 |
| 간단 진단은 자연어 | R5 진단 형태 | 규칙기반 지표 플래그만 |
| 세특 CSV는 단순 왕복 | R6 Simplifier | 학번+과목 복합키, 여러 분반 한 CSV |
| 진척도는 새 차시 테이블 | R7 스키마 | classSessions 재사용 + 신규 기록테이블 |
| 학기 선택 방식 불명 | R8 학기 스코핑 | 현재 날짜 자동 + 수동 전환 |
| 세특에 점수 포함 | R10 원천자료 | 점수·지필성적 미포함(기재요령) |
| 지필 단일 CSV | R12 지필 구조 | 과목×회차별 활성 회차만 |
| 일년 과목 통합 계획 | R14 학기 경계 | 학기별 완전 독립 계획 |
| 관찰 분반 선택적 | R15 분반 귀속 | 항상 분반 귀속(필수) |
| 계획↔진척도 매핑 불명 | R16 차시 매핑 | 순서 기본 + 수동 재지정 |
| 일괄 저장 검증 생략 | R17 세특 검증 | 행별 verify 경고 + 저장 허용 |

## Technical Context (brownfield)
- 허브 패턴: `app/setting/layout.tsx`(게이팅 nav) 참고. 교실은 게이팅 제거 버전.
- 재사용 스키마: `subjects`(semester·jipil*Enabled/Weight·yearCourseKey·examBoundaryDate), `subjectExams`, `performanceItems`/`sectionPerformanceDates`, `courseSections`/`enrollments`/`timetableSlots`, `classSessions`(planned/done/not_held), `subjectObservations`(sectionId·observedOn·keywords[]), `homeroomBehaviorNotes`(notedOn), `performanceAssessments`(score·prose), `studentExtraNotes`(studentYearId·subjectId·body), `specialNoteDrafts`.
- 신규 테이블 필요(예상): 수업 계획(과목 ordinal·content·keywords[]), session_records(classSession FK·actualContent·keywords[]·evalIdea). 지필 원점수 저장(과목×회차×학생). performanceAssessments에 분반·학기 연결 보강 검토.
- 차시 계산 엔진: `lib/domain/remaining-sessions.ts` 참고(방학·휴업일 제외 로직 재사용).
- 세특 검증: `lib/setech/verify.ts`(바이트·기재금지·문체) 행별 적용. 라벨/타입 `lib/setech/*`.
- 이동 대상 페이지: `/setech` → `/classroom/setech`, `/observations` 교과관찰 → `/classroom/observations`(행특은 담임 영역 잔류). 리다이렉트 처리.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| 과목(Subject) | core | name, semester, yearCourseKey, jipil weights/enabled | has many 분반, has 수업계획 |
| 분반(CourseSection) | core | label, room | has many 차시·수강·관찰 |
| 차시(ClassSession) | core | date, status | belongs to 분반, has session_record |
| 수업계획(LessonPlan) | core | ordinal, content, keywords[] | belongs to 과목 |
| 실제기록(SessionRecord) | core | actualContent, keywords[], evalIdea | belongs to 차시 |
| 핵심개념(Keyword) | supporting | hashtag text | embedded in 계획·기록 |
| 수행평가(PerformanceAssessment) | core | score(원점수), prose | belongs to 학생·항목·분반 |
| 지필성적(JipilScore) | core | rawScore, semester, ordinal | belongs to 학생·과목 |
| 관찰기록(SubjectObservation) | core | body, keywords[], observedOn | belongs to 학생·분반(필수) |
| 행특기록(BehaviorNote) | supporting(담임) | body, keywords[], notedOn | belongs to 담임반 학생 |
| 학생추가입력(StudentExtraNote) | supporting | body | 학생×과목 |
| 세특초안(SpecialNoteDraft) | core | content, byteCount, status | 학생×과목 |
| 학생분석보고서(StudentReport) | view | 진단 플래그 4종 | aggregates 학생 데이터 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | ~12 | 12 | - | - | N/A |
| 2 | ~12 | 0 | 1(차시) | 11 | ~100% |
| 4 | ~14 | 2(지필·수행분리) | 0 | 12 | ~90% |
| 7 | ~16 | 1(실제기록) | 0 | 15 | ~96% |
| 10 | ~16 | 0 | 0 | 16 | 100% |
| 17 | ~13(정리) | 0 | 0 | — | 수렴 |

## Interview Transcript
<details>
<summary>Full Q&A (17 rounds)</summary>

- **R0 토폴로지:** 6개 컴포넌트 확정(deferral 없음).
- **R1 허브 구조:** 자유 탭 허브, 게이팅 없음, /classroom/*.
- **R2 차시 정의:** 시간표 슬롯 기반 실제 날짜 차시.
- **R3 계획 단위:** 과목단위(차시 분반별 매핑).
- **R4 성적 저장(Contrarian):** 원점수만 저장, 읽기시점 환산.
- **R5 진단 형태:** 규칙기반 지표 플래그/마크.
- **R6 세특 CSV(Simplifier):** 학번+과목 복합키, 여러 분반 한 CSV.
- **R7 진척도 스키마:** classSessions 재사용 + 신규 기록 테이블.
- **R8 학기 스코핑:** 현재 날짜 기준 활성 학기 자동 + 수동 전환.
- **R9 수행 CSV:** 수행항목별 별도 CSV.
- **R10 세특 원천자료:** 관찰+수행서술(점수 제외)+학생추가입력(학생×과목). 점수·지필성적 미포함(기재요령).
- **R11 진단 플래그:** 지필추이 화살표·관찰부족 경고·수행미입력·분반평균 대비(4종 전부).
- **R12 지필 CSV:** 과목×회차별, 활성 회차만.
- **R13 진척도 팝업:** 이번주(월~일) ∪ 과거 예정(연체).
- **R14 일년 과목:** 학기별 완전 독립 계획.
- **R15 관찰 분반귀속:** 항상 분반 귀속(필수).
- **R16 차시 매핑:** 순서 기본 + 수동 재지정.
- **R17 세특 검증:** 행별 verify + 경고, 저장 허용.
- **인접 보정(사용자 추가):** 관찰·행특 날짜 입력(기본 당일+캘린더), 수정·삭제. 행특은 담임반 학생만 기록.

</details>
