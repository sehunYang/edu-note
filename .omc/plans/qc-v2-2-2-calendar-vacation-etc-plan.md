# RALPLAN(consensus·deliberate): QC v2 후속 — 학사일정 방학 종료 로직 + 기타(etc) 분류 추가

- 상태: **PENDING APPROVAL · 구현 준비 완료** (consensus: Architect SOUND-WITH-CHANGES → 반영, Critic ITERATE → 4개 필수 편집 전부 반영 = APPROVE 동등). deliberate(DB enum 마이그레이션 포함).
- 범위: 학사일정 분류기 2건만. (`classifySchedule` 방학 종료 + `etc` EventKind 추가). 그 외 불변.
- 생성: 2026-06-12
- 사용자 확정: ① 방학 종료 규칙(아래), ② 기타는 **수동 전용**(자동 fallback은 self_activity 유지·AC-B8 불변).

---

## Requirements Summary
1. **방학 종료 트리거 개선** (`lib/domain/calendar-keywords.ts` `classifySchedule`): 방학 시작(방학 키워드)은 현행 유지. 종료는 — **개학 키워드가 있으면 그날부터 비-방학**(현행), **개학식이 없으면 '방학' 키워드가 있는 마지막 날까지 방학**(그 사이 키워드 없는 날 포함), **마지막 방학일 이후는 개학 간주(비-방학)**. 현재 버그: 개학이 없으면 방학식 이후 학년도 끝까지 전부 vacation.
2. **기타(etc) 분류 추가**: `etc` EventKind 신설. **수동 전용**(교사 드롭다운 재분류). 자동 분류 fallback은 self_activity+needsReview 그대로(AC-B8 불변), 분류기는 etc를 자동 부여하지 않음.

---

## RALPLAN-DR

### Principles
1. **신뢰 불가 입력 가정**: NEIS 자유텍스트가 분류기 존재 이유 — 실패는 **조용한 오분류(needsReview=false)** 가 아니라 **needsReview로 표면화**되어야 한다(교사 보정 유도).
2. **동작 보존·테스트 우선**: 기존 통과 케이스(개학 종료·방학 우선·역순입력) 유지, 신규 분기는 단위테스트로 잠근 뒤 교체.
3. **brownfield/additive 마이그레이션**: 수기 SQL + `apply-sql.mjs`(단일 simple-query tx), ADD VALUE만, drizzle-kit generate 금지. 단일 공유 dev==prod DB.
4. **단일 진실원**: EventKind union이 원천. `KIND_LABEL`(exhaustive Record, typecheck 강제)·`EVENT_KINDS`(런타임 화이트리스트, **typecheck 미포착 — 수동 동기화 필수**) 동기화.
5. **범위 봉쇄**: 분류기 2건 외 불변. 컬럼 default·다른 EventKind 소비자 불변.

### Decision Drivers (top 3)
1. **조용한 catastrophic 오분류 제거** — 전 학기를 vacation(needsReview=false, ⚠ 없음)으로 삼키는 실패가 최악 → 종료 로직이 cluster-local 이어야.
2. **마이그레이션 안전성** — enum ADD VALUE는 비가역 → 별도 파일·ADD VALUE만·롤백=잔존(무해, 기존 dormant 값 선례).
3. **수동/자동 경계 명확** — etc는 자동 부여 안 함 → AC-B8 회귀 잠금 + 런타임 화이트리스트 동기화.

### Viable Options (방학 종료 알고리즘)
**Option A — 단일패스 boolean 유지 + 미세 패치** ❌
- Cons: 개학 없는 종료를 단일 forward boolean으로 표현 불가(미래 의존). 패치해도 lastVac 전역 참조 시 cross-term merge.

**Option B — 2-phase, 전역 lastVacIndex** ❌ (Architect 기각)
- Cons: 닫힌 여름방학 뒤 '방학 중 보충수업 안내' 한 행이나 두 번째 클러스터가 전역 마지막 방학일을 끌어와 **가을학기 전체를 조용히 vacation 으로 병합**(needsReview=false, ⚠ 없음). 입력 데이터 가정에 의존하는 silent 실패.

**Option C — 2-phase, cluster-local 종료** ✅ 채택
- Pros: 개학 종료 유지(+방학 우선 trailing 중립일). 개학 없으면 **이 클러스터의** 마지막 방학일까지; positively-classified 행(exam/club/career/mock_exam/자율활동)이 클러스터를 끊어 cross-term merge 방지. 떠도는 '방학' 공지는 최대 짧은 bounded 스팬(≤다음 positive 행)만, 학기 전체 삼킴 없음.
- Cons(인지): 방학 중 키워드 보유 행(예: 여름 '동아리' 활동)이 클러스터를 조기 종료시킬 수 있음 → 교사가 드롭다운으로 보정(수동 override 존재 이유). 알려진 한계로 테스트에 문서화.

### Pre-mortem (3 시나리오)
1. **enum "unsafe use of new value"** — ADD VALUE와 그 값 UPDATE가 같은 파일(단일 tx)이면 실패 → **0016은 ADD VALUE만**, remap/0017 불필요(etc는 자동 default도 기존행 매핑도 아님). 0013/0014 선례 확인.
2. **cross-term vacation merge / 떠도는 방학공지 삼킴** — Option C의 positive-행 클러스터 종료로 완화. **회귀테스트 필수**.
3. **etc 재분류 런타임 거부** — `EVENT_KINDS`에 etc 누락 시 컴파일 오류 없이 런타임 "알 수 없는 분류" 거부 → **화이트리스트 동기화 + 통합 라운드트립 테스트 필수**.

**롤백 자세(명시)**: enum 값은 Postgres에서 비가역(타입 재생성 없이 DROP VALUE 불가). 롤백 = **잔존(무해)** — 기존 dormant 값(vacation_start/end/none, `enums.ts:113`) 선례와 동일. 코드 미참조면 위험 0.

---

## 실행 계획 (단계별)

### 단계 1 — `classifySchedule` 2-phase 재작성 (cluster-local 종료)
파일: `lib/domain/calendar-keywords.ts` (lines 106-157 교체).

**Phase 1 — `vacation: boolean[]` 산출** (date asc 정렬 후):
사전계산: `isVac[k]=/방학/.test(normalize(title))`, `isReopen[k]=/개학/.test(...)`, `base[k]=classifyOne(title)`.
```
i = 0
while i < n:
  if !isVac[i]: i++; continue
  // 방학 opener
  lastVac = i; breakKind = "end"; breakIdx = n
  for j = i+1 .. n-1:
    if isReopen[j]:  breakKind = "reopen";  breakIdx = j; break   // ① 개학 우선
    if isVac[j]:     lastVac = j; continue                        // ② 방학 키워드 → 클러스터 확장
    if base[j] != null: breakKind = "positive"; breakIdx = j; break // ③ 학교 가동 신호 → 클러스터 종료
    // else: 중립(base null) → tentative, 계속 스캔
  endIdx = (breakKind == "reopen") ? breakIdx - 1 : lastVac
  for k = i .. endIdx: vacation[k] = true
  i = endIdx + 1
```
**⚠ 내부 루프 분기 우선순위는 load-bearing**: `isReopen` → `isVac` → `base(positive)` 순서 고정. (순서 바뀌면 `classifyOne`이 방학 행에 vacation 반환하므로 ②가 ③보다 먼저여야 클러스터가 확장됨. executor 주의.)

**Phase 2 — 분류 매핑** (각 entry, 우선순위 동일):
`vacation[i]` → "vacation" / else `base[i]` → 그 kind(exam이면 examSemester=base.examSemester ?? semesterFromDate(8/15 학년도-aware), examOrdinal=base.examOrdinal ?? null) / else `!isSchoolDay` → "holiday" / else "self_activity" + needsReview=true. needsReview는 self_activity fallback만 true.

하위호환 `classifyEvent`(단건) 그대로 유지.

### 단계 2 — `etc`(기타) EventKind 추가 (수동 전용)
- **마이그레이션** `lib/db/migrations/0016_event_kind_add_etc.sql` (신규): 헤더주석 + `alter type event_kind add value if not exists 'etc';` — **ADD VALUE만**, 단독 파일, UPDATE/DEFAULT 없음(단일 tx 제약). remap 불필요.
- **`lib/db/schema/enums.ts`**: `eventKind` pgEnum 배열에 `"etc"` 추가(8종) + 주석("기타 — 수동 전용, 자동 미부여").
- **`lib/domain/calendar-keywords.ts`**: `EventKind` union에 `"etc"` 추가 **only**. `classifyOne`/`classifySchedule` 미변경 — etc 자동 반환 안 함.
- **`app/setting/actions.ts`**: `EVENT_KINDS` 런타임 화이트리스트에 `"etc"` 추가(**수동 동기화 — typecheck 미포착**).
- **`app/setting/calendar/calendar-attrs.tsx`**: `KIND_LABEL`에 `etc: "기타"` 추가(exhaustive `Record<EventKind,string>` → typecheck 강제).
- **컬럼 default 불변**(self_activity, `misc.ts:102`). DB read는 Drizzle가 enum 검증 안 함 → 값 추가 read-safe.
- **배포 순서**: 0016을 공유 DB 적용 → 코드 push(additive·backward-compatible, 구 코드는 etc 미참조).
- **설계 노트(명시)**: 자동 fallback은 의도적으로 self_activity 유지, 기타는 교사 전용. 개학식/졸업식/입학식류는 self_activity+⚠로 표면화되어 교사가 드롭다운으로 기타 재분류.

### 단계 3 — 회귀·검증
typecheck 0err / build exit0 / 비-itest unit / RUN_DB_ITEST 통합 전부 그린.

---

## Acceptance Criteria (테스트 가능)

### A. 방학 종료 (단위 `calendar-keywords.test.ts`)
- [ ] AC-1: **개학 없음, 마지막 방학일 종료** — 방학식→키워드없는날(사이→vacation)→방학중행사(방학,lastVac)→키워드없는날(이후→**비-vacation**). 각각 단언.
- [ ] AC-2: **개학 종료 유지(회귀)** — 방학식→…→개학식: 개학식 당일·이후 비-vacation, 그 전 trailing 중립일 vacation(방학 우선).
- [ ] AC-3: **cross-term merge 방지** — 방학식→개학식(종료)→[가을]중간고사(exam): 중간고사 **비-vacation**. + 떠도는 "2학기 방학 안내"(방학) 행이 가을 exam 앞에 있어도 가을 exam은 삼켜지지 않음(해당 공지 ≤ 자기 짧은 스팬).
- [ ] AC-4: **경계 — 빈 스캔 분기** (Critic Major #1): (a) 단일 entry `["여름방학식"]` → 그날 vacation; (b) 배열 **마지막** entry가 방학 행(이후 행 없음) → vacation; (c) 끝에 인접 방학 행 2개 → 둘 다 vacation. (NEIS 연도범위가 방학식에서 끝나는 흔한 케이스.)
- [ ] AC-5: **방학 우선 + 역순입력(회귀)** — 방학 구간 내 비수업일 → vacation; 역순 입력도 정확(정렬).
- [ ] AC-6: **중립일 보간** (Critic minor #1) — 마지막 방학일과 이후 positive 행 사이의 중립(school day) 일 → **self_activity(비-vacation)**; 그 자리 비수업일이면 holiday.
- [ ] AC-7: **분기 우선순위 확인** (Critic minor #2) — 스캔 중 방학 키워드 행은 `isVac` 분기로 소비(=클러스터 확장), `classifyOne→vacation` positive 분기로 끊기지 않음.
- [ ] AC-8: **알려진 한계 문서화** (Critic skeptic) — 방학 중 '동아리' 등 키워드 보유 행이 클러스터를 조기 종료시킴을 단언하는 테스트(의도된 동작, 교사 보정 전제).

### B. 기타(etc) 추가
- [ ] AC-9: **etc 자동 미부여(AC-B8 회귀 잠금)** — 미분류 fallback은 여전히 self_activity+needsReview; `classifyOne(임의)`는 etc를 반환하지 않음(단언).
- [ ] AC-10: **수동 재분류 라운드트립**(통합 `calendar.integration.test.ts`, RUN_DB_ITEST) — 이벤트를 `updateEventAttributes`로 `etc` 재분류 후 재조회 시 eventKind='etc' 지속(EVENT_KINDS 런타임 가드 신규값 검출). (기존 line~227 holiday 라운드트립 패턴 적응.)
- [ ] AC-11: **enum 적용 검증**(실행 가능) — `node --env-file=.env.local -e "..."`로 `select unnest(enum_range(null::event_kind))` 조회해 `'etc'` 포함 단언(또는 AC-10 통합테스트가 쓰기 가능성으로 대체 증명). (`\d+` psql 메타커맨드 사용 금지 — 본 프로젝트 워크플로 아님.)
- [ ] AC-12: **드롭다운/UI** — `KIND_LABEL` 기타 라벨 표시, 일괄저장 재분류 지속(빌드+수동 확인).

### 공통
- [ ] AC-X: typecheck 0err, build exit0, 비-itest unit green, RUN_DB_ITEST 통합 green.

---

## Verification Steps (실행 가능)
1. 0016 적용: `node --env-file=.env.local scripts/apply-sql.mjs lib/db/migrations/0016_event_kind_add_etc.sql`. 이어 `node --env-file=.env.local -e "...enum_range..."`로 'etc' 존재 단언(AC-11).
2. 단위테스트 green — AC-1~9 신규/회귀(특히 경계 AC-4, merge-guard AC-3).
3. 통합테스트 green — etc 라운드트립 AC-10.
4. typecheck/build/전체 unit/통합 all green.
5. 수동/e2e: 캘린더 드롭다운에 '기타' 노출 → 재분류+일괄저장 지속. **개학 없는 합성 일정의 기대 태그 명시**: 마지막 방학 행 → vacation, 그 다음 키워드 없는 school day → self_activity+needsReview(⚠).

## Risks & Mitigations
| 리스크 | 완화 |
|--------|------|
| enum ADD VALUE+사용 동일 tx 실패 | 0016 ADD VALUE만·단독 파일·remap 없음(0013/0014 선례) |
| enum 비가역(롤백) | 잔존=무해(dormant 값 선례). 코드 미참조면 위험 0 |
| cross-term vacation merge(silent) | Option C cluster-local 종료(positive 행이 클러스터 끊음) + AC-3 회귀테스트 |
| etc 런타임 거부(typecheck 미포착) | `EVENT_KINDS` 수동 동기화 + AC-10 라운드트립 |
| 경계(연도범위 방학식 종료) 오태그 | AC-4 빈-스캔 분기 테스트 |
| 방학 중 키워드행 조기종료 | 알려진 한계(AC-8), 교사 수동 보정 |
| 동일날짜 방학/개학 정렬 | 정렬 tie=0(입력순). 동일날 방학·개학 공존 시 reopen 우선 tie-break 1줄 명시 또는 인지 |

## Expanded Test Plan (deliberate)
- **Unit**: AC-1~9 (방학 종료 신규/경계/merge-guard/중립보간/분기우선/한계, etc 자동미부여).
- **Integration (RUN_DB_ITEST)**: AC-10 etc 라운드트립. (선택) 개학 없는 합성 schedule sync→getEventsWithAttrs 마지막-방학일 경계 DB 확인.
- **회귀**: typecheck/build/비-itest unit/통합.
- **Observability**: 순수함수+additive enum이라 별도 계측 불필요(인지).

---

## ADR
- **Decision**: `classifySchedule`를 cluster-local 2-phase로 재작성(개학 종료 유지 + 개학 없으면 클러스터 마지막 방학일 종료, positive 행이 클러스터 분리) + `etc`(기타) EventKind를 **수동 전용**으로 추가(자동 fallback=self_activity 불변).
- **Drivers**: ① silent catastrophic 오분류(전 학기 vacation, ⚠없음) 제거 ② enum ADD VALUE 안전성 ③ 수동/자동 경계 + AC-B8 회귀 잠금.
- **Alternatives**: A(단일패스 패치) 기각(미래의존 표현 불가). B(전역 lastVacIndex) 기각(Architect — cross-term silent merge). C(cluster-local) 채택.
- **Why chosen**: 신뢰불가 NEIS 입력에서 실패가 benign(needsReview 표면화)해야 하며, cluster-local이 흔한 케이스(여름 개학식 종료·겨울 trailing) 정확성을 유지하면서 silent merge 제거.
- **Consequences**: ① 방학 중 키워드 보유 행이 클러스터 조기종료(교사 보정 전제, AC-8). ② enum 비가역 — etc 잔존 롤백. ③ `EVENT_KINDS`는 union의 typecheck-미검증 중복 — 수동 동기화 부채(기존, 본건서 1값 추가).
- **Follow-ups**: `EVENT_KINDS`를 union 파생으로 컴파일 강제화(별도 하드닝). 동일날짜 방학/개학 tie-break 명시(저위험).

## Changelog (consensus 반영)
**Architect (SOUND-WITH-CHANGES):** 전역 lastVacIndex → **cluster-local 종료**(positive 행이 클러스터 분리, cross-term merge 제거); merge-guard 회귀테스트; etc-fallback 설계 명시; EVENT_KINDS 수동동기화 위험 표기.
**Critic (ITERATE → 4 필수편집 반영=APPROVE 동등):** ① 경계 단위테스트 3종(AC-4: 단일/마지막행/인접2행) ② 실행가능 검증(AC-11 enum_range 조회·`\d+` 제거, 검증5 기대태그 명시) ③ 롤백 자세 명시 + AC-B8 회귀잠금(AC-9) ④ 내부루프 분기 우선순위 고정 명시. + 중립보간(AC-6)·분기확인(AC-7)·동일날짜 정렬·알려진한계(AC-8) 반영.
