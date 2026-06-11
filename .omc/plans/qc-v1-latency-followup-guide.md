# QC v1 지연 해소 — 측정(warm p50)·P2 사용자 작업 가이드

대상: 사용자(양세훈). 작성: 2026-06-10. 관련 계획: `qc-v1-latency-fix-plan.md`.

이미 배포 완료(코드/설정):
- **P1** `vercel.json` `{"regions":["icn1"]}` — 서버리스 함수 서울 고정 (commit `2df1fa7`)
- **P4** `revalidatePath` 페이지별 범위 축소 (commit `2df1fa7`)
- **P3** N+1 → 배치 쿼리 (commit `4481824`)

남은 두 가지(사용자 직접 수행): **① warm p50 측정으로 효과 확인**, **② P2 `DATABASE_URL` 트랜잭션 풀러(:6543) 전환**.

---

## ① warm p50 측정 — 효과 확인

> 왜 사용자가 직접? 측정하려면 **로그인된 본인 계정**으로 프로덕션 세팅실에서 실제 버튼을
> 눌러야 합니다(인증 세션 필요). 저는 프로덕션에 로그인할 수 없어 레시피만 제공합니다.

### 측정 대상
- 대표 액션 = **분반 역할 추가**(`addSectionRoleAction`) — 세팅실 → 5.수업 관리 → 분반 상세에서 역할 추가 버튼.
- 모든 `/setting/*` 는 `force-dynamic` → 매 호출 함수 인보크. **콜드스타트 변동이 크므로 워밍업 1회는 버린다.**

### 절차 (브라우저 DevTools)
1. 배포 완료 확인: Vercel 대시보드 → 최신 Deployment 가 **Ready**(커밋 `4481824` 포함)인지 확인.
2. 프로덕션 세팅실에 로그인 → 5.수업 관리 → 아무 분반 상세 진입.
3. 크롬 DevTools → **Network** 탭 열기 → "Preserve log" 켜기.
4. 역할 추가 버튼을 **1회 클릭(워밍업, 측정 제외)**.
5. 이어서 **연속 5회** 역할 추가(또는 같은 종류 액션) 클릭. 각 요청의 서버액션 POST 행에서
   **Timing → "Waiting for server response"(TTFB)** 값을 기록.
6. 5개 값의 **중앙값(p50)** 과 **최댓값(max)** 을 기록.

### 함수 리전(icn1) 확인 — 둘 중 하나
- (a) Vercel → Deployment → **Functions** 탭에서 리전이 **icn1 (Seoul)** 인지 확인, 또는
- (b) 세팅실 페이지 응답 헤더의 `x-vercel-id` 값에 **`icn1`** 이 포함되는지 확인
  (DevTools Network → 문서 요청 → Response Headers → `x-vercel-id: icn1::...`).
- ⚠ **미들웨어 주의**: `vercel.json regions` 는 서버리스 함수에만 적용됩니다. Next.js 미들웨어는
  Edge 런타임(사용자 인근)이라 icn1 을 따르지 않습니다 — 인증 왕복(`getUser()`)은 P1 로 줄지
  않으며, 지배적이면 계획의 **P1.5 측정 게이트 → P5** 로 별도 처리합니다.

### 성공 기준(계획 §성공정의)
- P1 적용 전 baseline 을 못 쟀다면, 우선 **현재(P1+P3+P4 후) warm p50 < 800ms** 인지 확인.
- 800ms 미만이고 체감 지연이 사라졌다면 → **효과 확인 완료**, 추가 조치 불필요(P2 는 선택적 보강).
- 여전히 느리면 → `getUser()` 인증 왕복이 지배항일 가능성 → P1.5 계측(요청당 호출 수·소요 ms)
  후 ≥30% 또는 ≥150ms 이면 P5(인증 왕복 축소) 별도 진행.

> 참고: P3 효과는 측정 없이도 구조적으로 확정됩니다 — 두 페이지의 DB 쿼리 수가 학생/분반 수와
> 무관하게 상수(약 5~7회)로 고정되며, 이는 통합테스트(AC-P3 동치)로 검증되었습니다.

---

## ② P2 — `DATABASE_URL` 트랜잭션 풀러(:6543) 전환 [사용자·Vercel 대시보드]

> 왜 사용자가 직접? `DATABASE_URL` 은 Vercel 환경변수(시크릿)라 코드로 바꿀 수 없습니다.
> 서버리스 환경에선 **세션 풀러(:5432)** 보다 **트랜잭션 풀러(:6543)** 가 연결 오버헤드가 적습니다.

### 적용 단계
1. Vercel 대시보드 → 프로젝트(`edu-note`) → **Settings → Environment Variables**.
2. `DATABASE_URL` 항목 **Edit**.
3. 값에서 **포트만** `:5432` → **`:6543`** 으로 변경. (host 는 그대로
   `...pooler.supabase.com`, transaction mode)
   - 예: `...@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres`
     → `...@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres`
   - **Production + Preview 환경 모두** 적용.
4. Save → **재배포 필요**: Vercel → Deployments → 최신 빌드 **Redeploy**
   (환경변수 변경은 재배포해야 런타임에 반영됨).

### 안전성 근거(감사 완료)
- 트랜잭션 모드는 `prepare:false` 필수 → **이미 설정됨**(`lib/db/index.ts:23`).
- 모듈 캐시 클라이언트 `max:3` 은 트랜잭션 모드에서 안전(연결은 statement 단위 체크아웃/반납).
- `db.transaction()` 4곳(`lifecycle.ts:58`·`roster.ts:105,278`·`timetable.ts:270`) 모두 표준
  SELECT/DELETE/INSERT/UPDATE 만 사용 → 세션 스코프 기능(prepared statement/advisory lock/LISTEN)
  미사용이므로 트랜잭션 모드 안전.

### 적용 후 스모크 테스트
1. 재배포 Ready 후 세팅실 **한 화면 로드**(예: 4.학생 명단) + **한 액션 실행**(예: 학급역할 추가).
2. Vercel → Deployment → **Functions/Logs** 에서 `prepared statement` 오류나 연결 오류가
   없는지 확인. 정상 동작하면 완료.

### 롤백
- 문제 발생 시 환경변수 포트를 **`:5432` 로 복귀** 후 Redeploy(즉시 원복).

### 로컬(`.env.local`)
- 로컬은 **`:5432` 유지 권장**(통합테스트 다건 트랜잭션에 세션 풀러가 더 관대). 본 코드 쿼리는
  풀러 모드 무관 SELECT 위주라 동작 동일.
