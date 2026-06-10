# RALPLAN: 세팅실 버튼 지연(latency) 4대 해결안

- 상태: **draft → consensus 진행 중**
- 모드: short (고위험 트리거 없음 — auth/마이그레이션/파괴적변경 아님)
- 배경: 배포본(Vercel)에서 세팅실 버튼(서버 액션) 후 수 초 지연. 진단 결과 4대 원인 확정.
- 생성: 2026-06-10

---

## 진단 근거 (evidence)

| # | 원인 | 근거 |
|---|------|------|
| 1 | **교차 리전**: Vercel 함수(미국 기본) ↔ Supabase DB(서울) | `DATABASE_URL=...aws-1-ap-northeast-2.pooler.supabase.com` (서울), `vercel.json` 부재 → 함수 리전 미지정(Hobby 기본 iad1, 미국). DB 왕복 ~200ms |
| 2 | **세션 풀러(5432)** on serverless | `DATABASE_URL` 포트 `:5432`(session mode). 서버리스엔 transaction mode `:6543` 권장 |
| 3 | **N+1 쿼리** | `app/setting/courses/page.tsx:35-53` 과목별 `listSubjectExams` + 분반별 `listEnrollments` + **수강생별 `listSectionRoles`**(3중 중첩, N×M×K); `app/setting/students/page.tsx:39-47` **학생별 `listClassRoles`** 루프. (참고: `listPendingLinks` 는 페이지에서 1회 호출이나 **함수 내부**(`roster.ts:244-264`)에서 후보별 루프) |
| 4 | **과대 revalidate** | `revalidatePath("/setting","layout")` **18곳**(actions.ts 16 + timetable-actions.ts 1 + import-actions.ts 1) → 작은 버튼에도 레이아웃 전체 재조회 |
| 5 | **인증 왕복(Architect 추가, 최빈 호출)** | `getOwnerId()`(`lib/auth/owner.ts:17-25`)·미들웨어(`lib/supabase/middleware.ts:36-38`) 가 매 요청마다 `supabase.auth.getUser()`(Supabase Auth REST **네트워크 왕복**) 호출. 한 액션당 미들웨어 + 액션 + (revalidate 후) 레이아웃·페이지 = **getUser 3~4회/액션**. DB 쿼리 이전에 발생하는 최빈 왕복 |

**곱연산 효과**: (원인1) 왕복 200ms × [(원인5) getUser 3~4회 + (원인3) DB 수십 회] × (원인4) 매 액션 전량 재조회 = 체감 수 초. **인증 왕복(원인5)이 DB 왕복보다 더 잦은 최빈 항**임에 유의.

---

## RALPLAN-DR

### Principles
1. **근접성 우선**: 연산을 데이터에 붙인다(함수 리전=DB 리전). 가장 큰 상수 제거. **단, Edge Middleware 는 `vercel.json` 리전을 따르지 않으므로(사용자 인근 edge 실행) 인증 왕복은 별도 고려**.
2. **왕복 횟수 최소화**: 행 단위 루프 쿼리 금지 → 집합 단위(JOIN/IN) 1회 조회 후 메모리 그룹핑. **DB 왕복뿐 아니라 `getUser()` 인증 왕복(3~4회/액션)도 계수 대상**.
3. **무효화는 최소 범위**: 액션이 바꾼 화면만 revalidate. 게이팅 네비를 바꾸는 액션만 layout 무효화.
4. **동작 보존·검증 우선**: 쿼리 리팩터링은 통합테스트로 결과 동치를 잠근 뒤 교체.
5. **저위험부터**: config(무위험)→env→코드 순으로 효과/리스크 균형.

### Decision Drivers (top 3)
1. **체감 지연의 지배 항** = 교차 리전 왕복 × 쿼리 횟수 → P1(리전)·P3(N+1)이 1순위.
2. **리스크 격리** — P1/P2는 config/env(코드 무변경, 즉시 롤백), P3는 쿼리 로직 변경(테스트 필수), P4는 저위험.
3. **사용자 작업 분리** — P2(DATABASE_URL)는 Vercel 대시보드 env(코드로 불가) → 안내 항목으로 분리.

### Viable Options

**Option A — 4개 전부, 리스크 순 단계 적용 (P1→P2→P4→P3)** ✅ 채택
- Pros: 무위험 config부터 즉시 효과(P1), 코드 변경(P3)은 마지막에 테스트로 보호. 각 단계 독립 롤백.
- Cons: P3 리팩터링이 가장 큼.

**Option B — P1만(리전) 적용하고 관망**
- Pros: 1분, 무위험, 단독으로도 큰 개선(왕복 40배↓).
- Cons: N+1(수십 회 왕복) 잔존 → 서울 내 왕복도 누적되면 수백 ms. 근본 해결 아님.
- 무효화 근거: P1은 상수만 줄임. 횟수(P3)를 안 줄이면 데이터 증가 시 재악화 → A의 부분집합으로 흡수.

**Option C — 쿼리 캐싱/RSC 캐시 도입(unstable_cache 등)**
- Pros: 반복 조회 캐시.
- Cons: 쓰기 후 무효화 복잡도↑, 단일 교사·소규모 데이터엔 과설계. N+1 자체는 안 사라짐.
- 무효화 근거: 데이터 규모(학급 수십 명)에 비해 복잡도 과다 → P3(배치)가 더 단순·확실.

→ **채택: Option A**. (B는 근본 해결 아님 → A에 흡수, C는 과설계)

---

## 실행 계획 (단계별 · 리스크 순)

### P1 — Vercel 함수 리전 서울(icn1) 고정 [config·무위험·최대효과]
- **변경**: 루트에 `vercel.json` 신규:
  ```json
  { "regions": ["icn1"] }
  ```
- **⚠ Hobby 권한 확인(Critic)**: `vercel.json` 의 `regions` 배열 지정은 일부 플랜에서 Pro+ 제한이 있을 수 있음. **만약 Hobby 에서 거부되면** → Vercel 대시보드 **Settings → Functions → Region** 에서 기본 리전을 `icn1`(Seoul)로 설정(동등 효과). 실행 전 현재 Vercel 문서/엔타이틀먼트 확인.
- **효과**: **서버리스 함수**의 모든 DB/Supabase-auth 왕복 미국→서울(~200ms) → 동일 리전(~5–10ms). 단일 변경 최대 효과.
- **⚠ Edge Middleware 정정(Architect)**: `vercel.json regions` 는 **서버리스 함수에만** 적용된다. Next.js 미들웨어(`middleware.ts`)는 기본 **Edge 런타임 → 사용자 인근 edge 에서 실행**되어 icn1 을 따르지 않는다. 따라서 미들웨어의 `getUser()` 왕복은 P1 으로 줄지 않는다. 처리: (a) 미들웨어를 Node 런타임으로 전환해 icn1 함수 리전에 합류시키거나, (b) edge 유지가 허용 가능함을 문서화(인증은 보안상 edge 검증도 무방). **결정은 P1.5 측정 후** — 미들웨어 왕복이 지배적이면 (a), 아니면 (b).
- **검증**: **P1 적용 전 baseline 부터 측정**(아래 측정법으로 현재 p50 기록) → 배포 후 Vercel → Deployment → Functions 리전이 `icn1`인지 확인 → 동일 측정법으로 재측정해 baseline 대비 단축 확인.
- **롤백**: `vercel.json` 삭제(즉시).
- **AC-P1**: 배포 함수 리전 = icn1, 대표 액션 warm p50 가 baseline 대비 명확 단축(목표 측정법은 검증 계획 참조).

### P1.5 — 인증 왕복 측정 게이트 [관측·무위험·코드변경 결정 분기]
- **목적(Architect)**: 최빈 네트워크 호출인 `getUser()` 가 한 액션당 실제 몇 회인지, P1 후에도 지배적인지 **측정으로 확정**한 뒤 P5(인증 왕복 축소) 착수 여부를 결정(원칙4 "측정 우선"·원칙5 "저위험 우선" 동시 충족, 인증 코드 변경을 측정 뒤로 지연).
- **방법**: `getOwnerId()`·미들웨어에 임시 계측 로그(요청 ID별 `getUser()` 호출 수·소요 ms)를 추가하거나 Vercel 함수 로그/트레이스로 액션당 호출 수 확인. 코드 변경은 로깅에 국한(인증 로직 불변).
- **분기(정량, Critic)**: P1 적용 후 대표 액션 warm p50 가 목표 미달이면서, `getUser()` 합산 소요가 **액션 p50 의 ≥30% 또는 ≥150ms** → **P5 진행**(고위험 게이트 재개, 별도 deliberate 계획). 그 외 → P5 보류(2차 성능 QC).
- **AC-P1.5**: 액션당 `getUser()` 호출 수와 비중을 수치로 보고, P5 진행/보류를 데이터로 결정.

### P2 — DATABASE_URL 트랜잭션 풀러(6543) [env·사용자 수행·저위험]
- **변경(사용자)**: Vercel → Settings → Environment Variables → `DATABASE_URL` 의 포트 `:5432` → **`:6543`** (host 동일 `...pooler.supabase.com`, transaction mode). Production/Preview 모두.
- **호환성(Architect 보강)**: transaction-mode pooler 는 **`prepare:false` 필수** — 이미 설정됨(`lib/db/index.ts:23`). 모듈 캐시 클라이언트 `max:3` 는 트랜잭션 모드에서 안전(연결은 statement 단위로 체크아웃/반납, 캐시 수명 동안 점유 안 함). `db.transaction()` 은 트랜잭션 구간 동안만 단일 연결 고정 — **전체 4개 호출처(grep `db.transaction`) 감사 완료**: `lifecycle.ts:58`·`roster.ts:105`·`roster.ts:278`·`timetable.ts:270`, 모두 표준 SELECT/DELETE/INSERT/UPDATE 만 사용(세션 스코프 기능 없음) → 트랜잭션 모드 안전. 단, 트랜잭션 모드는 세션 수준 기능(prepared statement/세션 advisory lock/LISTEN) 미지원 — 본 코드 미사용.
- **선택**: `.env.local` 도 `:6543`으로 통일(로컬 itest는 둘 다 동작). 단, 로컬 `db.transaction` 다건 시 5432가 더 관대 → 로컬은 5432 유지 가능.
- **검증 한계(Critic)**: 로컬 itest 가 `:5432`(세션)로 돌면 P3 통합테스트는 **프로덕션 트랜잭션 모드(6543)와 다른 풀러 모드**를 검증하게 됨 — 본 쿼리는 모드 무관 SELECT 라 위험 낮으나, 트랜잭션 모드 동작 자체는 itest 미커버. P2 적용 후 프로덕션 스모크(한 화면+한 액션, 오류 로그 확인)로 보완.
- **검증**: 배포 후 한 화면 로드 + 한 액션 실행해 `prepared statement`/연결 오류 없는지 로그 확인.
- **롤백**: env 포트 5432로 복귀(재배포).
- **AC-P2**: 6543으로 전환 후 오류 없이 동작, 연결 오버헤드 감소.
- **메모**: 코드로 변경 불가 영역 → 사용자 대시보드 작업. 단계 안내 제공.

### P4 — revalidatePath 범위 축소 [code·저위험]
- **변경**: 액션별로 해당 페이지만 무효화:
  - profile 액션(`saveProfileAction`) → `revalidatePath("/setting/profile")`
  - calendar 액션(`calendarSyncAction`,`updateEventAttrsAction`) → `"/setting/calendar"`
  - 학생/roster 액션(`linkStudentsAction`,`resolveInheritanceAction`,`addClassRoleAction`,`deleteClassRoleAction`,`issuePublicLinkAction`, `importRosterAction`) → `"/setting/students"`
  - courses 액션(`saveEvalAction`,`bulkEnrollAction`,`materializeExamsAction`,`addSectionRoleAction`,`deleteSectionRoleAction`, `syncTimetableAction`) → `"/setting/courses"`
  - **예외(layout 유지)**: `completeStageAction`/`reopenStageAction` 는 게이팅 네비(잠금 해제)를 바꾸므로 `revalidatePath("/setting","layout")` 유지.
- **효과**: 작은 버튼이 해당 페이지 데이터만 재조회(다른 단계 쿼리 재실행 제거).
- **검증**: 각 액션 후 화면 데이터가 즉시 갱신되는지(역할 추가/삭제, 보정 등) 수동 확인 + build.
- **롤백**: layout 복귀.
- **AC-P4**: 각 액션 후 해당 페이지 갱신 유지, 단계 완료 시 네비 잠금 해제 유지.

### P3 — N+1 → 배치 쿼리 [code·중위험·테스트 필수]
- **신규 쿼리 계층 함수**(집합 단위, ownerId 스코프):
  - `lib/db/queries/timetable.ts`:
    - `listSubjectExamsForYear(db,ownerId,year)` → 연도 전 과목 시험일 1회(IN/join), `subjectId` 그룹핑.
    - `listEnrollmentsForYear(db,ownerId,year)` → 연도 전 분반 수강생 1회(join), `sectionId` 그룹핑.
    - `listSectionRolesForEnrollments(db,ownerId,enrollmentIds[])` → IN 1회, `enrollmentId` 그룹핑.
  - `lib/db/queries/roster.ts`:
    - `listClassRolesForStudents(db,ownerId,studentYearIds[])` → IN 1회, `studentYearId` 그룹핑.
    - (선택) `listPendingLinks` 내부 후보 루프를 단일 join 집계로 축소.
- **페이지 수정**:
  - `app/setting/courses/page.tsx`: 중첩 `await Promise.all` 루프 제거 → 위 배치 함수 3개 호출 후 메모리 조립(과목→분반→수강생→역할). 쿼리 수: 과목수×(1+분반수×(1+수강생수)) → **약 5회 고정**.
  - `app/setting/students/page.tsx`: 학생별 `listClassRoles` 루프 제거 → `listClassRolesForStudents` 1회 + 메모리 그룹핑.
  - **감사 완료(Architect)**: `app/setting/calendar/page.tsx:46-51` 은 고정 개수 `Promise.all`(행 단위 루프 아님) → **N+1 아님, 수정 대상 제외**. profile/year 페이지도 루프 없음.
- **테스트(검증 게이트, RUN_DB_ITEST=1)**:
  - `timetable.integration.test.ts` 확장: 배치 함수가 기존 단건 함수와 **동일 결과**(여러 분반/수강생/역할 픽스처로 그룹핑 동치) 단언.
  - `roster.integration.test.ts` 확장: `listClassRolesForStudents` 가 학생별 `listClassRoles` 합집합과 동치.
- **회귀 가드**: typecheck 클린 · 단위/통합 그린 · build exit0.
- **롤백**: 페이지를 단건 루프 버전으로 되돌림(배치 함수는 잔존 무해).
- **AC-P3**: 두 페이지 렌더 시 DB 쿼리 수가 데이터 건수와 무관하게 상수(≤~5회), 배치=단건 결과 동치 통합테스트 그린.

### P5 — 인증 왕복 축소 [code·고위험·P1.5 측정 게이트 통과 시에만]
- **조건부**: P1.5 측정에서 `getUser()` 가 P1 후에도 지배적일 때만 착수. 인증 경로 변경 → **별도 deliberate 계획으로 재기획(고위험 게이트 재개)**.
- **방향(후보, 미확정)**: 동일 요청 내 미들웨어가 이미 검증한 세션을 하위 `getOwnerId()` 가 재검증(`getUser()` 반복)하는 것을 1회로 합치거나, 읽기 경로에서 세션 신뢰 범위 재검토. 보안 동치 검증 필수.
- **AC-P5**: 액션당 `getUser()` 호출 수 감소 + 인증/인가 동작 동치(허용 계정만 접근, 차단 유지) 검증.

---

## Expanded 검증 계획

| 레벨 | 대상 | 도구 |
|------|------|------|
| Unit | (해당 없음 — 순수 로직 변경 없음) | — |
| Integration | 배치 쿼리 동치(P3) | `RUN_DB_ITEST=1` vitest |
| Build/Type | 전체 | `tsc --noEmit`, `next build` |
| Manual/관측 | 액션 왕복 시간(전/후), `getUser()` 호출수(P1.5), Vercel 함수 리전, prod 로그 오류 | Vercel 대시보드·브라우저 네트워크 탭·함수 로그 |

- **측정법(warm/cold 분리, Critic)**: 대표 액션 = **분반 역할 추가**(`addSectionRoleAction`). 모든 `/setting/*` 는 `force-dynamic` → 매 호출 함수 인보크라 콜드스타트 변동 큼. 따라서 **① 첫 요청(워밍업)은 버림 → ② 연속 warm 요청 5회 측정**, **p50·max 둘 다 기록**, 콜드스타트 지연은 게이트에서 제외하되 별도 명시. 가능하면 브라우저 end-to-end 대신 **Vercel 함수 로그의 서버측 실행시간**도 병기(네트워크/RSC 페이로드 분리).
- **성공 정의(수치)**: ① **baseline(P1 전) warm p50 기록** → ② P1+P3+P4 적용 후 **warm p50 < 800ms** 이고 baseline 대비 명확 단축. 부가: 함수 리전 = icn1, 두 페이지 쿼리 수 데이터 무관 상수화(P3), P1.5 `getUser()` 호출수·비중 수치 보고, 회귀 0(typecheck/build/통합테스트 그린).

---

## ADR

- **Decision**: 세팅실 지연을 4대 레버로 해소 — P1 리전 고정 + P2 트랜잭션 풀러 + P3 N+1 배치화 + P4 revalidate 범위 축소. 리스크 순(config→env→code) 적용.
- **Drivers**: 지연 지배항(교차 리전×쿼리횟수), 리스크 격리, 사용자 작업(env) 분리.
- **Alternatives**: B(P1만 — 근본 해결 아님), C(쿼리 캐싱 — 소규모에 과설계).
- **Why chosen**: P1이 즉시·무위험 최대효과, P3가 횟수를 상수화해 데이터 증가에도 견고. P2/P4는 저비용 보강.
- **Consequences**: `vercel.json` 신규(리전 고정), 배치 쿼리 함수 추가로 쿼리 계층 약간 증가. P2는 사용자 대시보드 작업 필요. **인증 왕복(원인5)은 P1.5 측정 게이트 뒤로 분리** — P5는 측정 데이터가 정당화할 때만 별도 고위험 계획으로 진행.
- **Follow-ups**: P5(인증 왕복 축소, 측정 게이트 통과 시), Edge Middleware Node 런타임 전환 검토, RSC 부분 캐싱(C)·낙관적 UI 업데이트는 2차 성능 QC로.

### 실행 순서 (확정)
P1(리전·vercel.json) → **P1.5(인증 왕복 측정)** → P2(env 6543, 사용자) → P4(revalidate 축소) → P3(N+1 배치+테스트) → [P5는 P1.5 결과에 따라 조건부].

---

## 리뷰 상태
- [x] Architect 검토 → **SOUND-WITH-CHANGES**. 5개 필수 변경 반영: ①Edge Middleware 리전 정정(P1) ②P1.5 인증 왕복 측정 게이트 신설 ③P2 prepare:false/max:3/transaction 캐비엇 ④calendar N+1 아님 명시(P3) ⑤검증 수치 목표. 인증 왕복(원인5)·P5 조건부 추가.
- [x] Critic 검토 → **APPROVE-WITH-RESERVATIONS**. 반영 완료: (M1) warm/cold 분리 + baseline 선측정, (M2) `lifecycle.ts:58` P2 감사 추가, (m1) revalidate 18곳 정정, (m2) students N+1 표현 정정(listPendingLinks 내부 루프), (m3) P1.5 트리거 정량화(≥30% 또는 ≥150ms), + Hobby 리전 권한 캐비엇·itest 풀러모드 한계 명시. → 잔여 reservation 모두 해소 → **clean APPROVE 동등**.
- [x] **pending approval** (consensus 도달 — 실행 미승인 상태)

---

## 상태: PENDING APPROVAL
이 문서는 합의 계획(Architect+Critic 통과) 산출물이며 **아직 실행 승인 전**입니다. 실행 시 권장 순서/방식:
- **즉시·무위험 묶음**: P1(vercel.json) + P4(revalidate 축소) — 작게 커밋·배포 후 측정.
- **사용자 작업**: P2(Vercel `DATABASE_URL` :6543) — 대시보드.
- **테스트 동반**: P3(N+1 배치) — 통합테스트 동치 확인하며 `team` 또는 `ralph`로.
- **조건부**: P5 는 P1.5 측정이 정당화할 때만 별도 deliberate 계획.
