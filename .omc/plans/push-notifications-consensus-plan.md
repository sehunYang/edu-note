# PWA 푸시 알림 구현 계획 (교사·학생 영역)

**Status:** pending approval (consensus / RALPLAN-DR short mode + 컴팩트 pre-mortem)
**Date:** 2026-07-17
**Input Spec:** `.omc/specs/deep-interview-push-notifications.md` (모호도 4.8%, PASSED)

---

## 요구사항 요약 (스펙 확정 사항)

- **교사 즉시(2)**: T1 상담 신청 접수, T2 상담 취소 요청 — 학생 액션 즉시 트리거
- **교사 브리핑(1)**: 수업일만 KST 7:30, [수업 요약+넛지+신고서 현황+일정·상담] 합성 1건
- **학생(3)**: S1 새 공지·한마디(all=구독 전원/individual=해당자), S2 상담 취소·취소승인 통지, S3 제출 서류 리마인드(중립 문구, 아침 크론 동승)
- **설정**: 종류별 토글 + 테스트 버튼 — 교사=설정실 프로필 카드, 학생=공개 페이지 홈 탭 카드(+iOS 안내)
- **제약**: Vercel Hobby 크론 1일 1회 / 발송 실패 무해성 / 본문 민감정보 금지 / SW·코브·오프라인 회귀 금지

### 핵심 코드 사실
- 트리거 실존(⚠ **위치 정정** — Architect): 학생 상담 액션은 `app/p/[token]/actions.ts:32,41`이 아니라 **`lib/public/student-write.ts`의 `reserveCounsel`(:131)·`requestCounselCancel`**에 삽입해야 함 — action 래퍼는 `token`+`{ok}`만 갖고, `ownerId`/`studentYearId`/`publicDb()`는 student-write 내부(`resolved.ownerId` 등, :69/:103)에 있음. 학생 이름은 여기서 조회. S2(`homeroom/counsel/actions.ts:125,141`)는 `ownerId`+`reservationId`만 있어 **reservationId→studentYearId→publicPageId/token** 조회 1회 추가 필요. 한마디 3액션(`homeroom/notice/actions.ts:64,83,111`)은 `ownerId`+`studentYearIds` 보유 → 그대로 삽입.
- 학생 토큰 모델: `publicPages`(`lib/db/schema/misc.ts:378`) — id·ownerId·studentYearId·token(unique)·revokedAt·expiresAt → 학생 구독은 `publicPageId` FK(cascade)로 귀속, 발송 시 활성(revoked/expired 아님) join 필터
- **best-effort 선례**: `pushMemoToGoogle`(`app/(shell)/today/actions.ts:91-118`) — 절대 throw 안 하는 외부 발송 래퍼. 푸시 발송 유틸도 동형으로
- 최신 마이그 0055 → 신규 **0056_push_subscriptions.sql**
- api 라우트: backup·health뿐. **미들웨어 matcher는 `api/health`만 제외** — 크론 라우트 신설 시 matcher 제외 필수(안 하면 /login 307으로 크론 무력화)
- **`vercel.json` 이미 존재** = `{"regions":["icn1"]}`(서울 리전) → 크론은 **신설 아닌 병합**(icn1 유지, 안 그러면 전 사용자 지연 회귀)
- **크론은 세션 없음** → `getOwnerId()`(쿠키 세션 의존) 사용 불가. 오너는 **데이터에서 도출**. ⚠ **T3와 S3의 오너 집합을 분리**(Critic Major 2): T3=briefing 토글 교사 구독의 owner / S3=**docs 토글 켠 활성 학생 구독의 owner**(교사 briefing 여부와 무관) — 둘의 합집합 순회하되 각자 자기 수신자 쿼리로 발송. S3를 briefing-owner 루프에 중첩하면 briefing 끈 교사의 학생이 서류 리마인드를 못 받음.
- SW push 표시는 `registration.showNotification`(Notification 생성자 아님)
- 브리핑 데이터 소스 전부 기존 쿼리 재사용: `listTodayLessons`·`collectNudges`·`listPendingReportTiers`·`getEventsInRange`·미제출 목록(`listUnsubmittedAttendance`). ⚠ `schoolDayCalendar`는 **테이블**(misc.ts:334)이지 함수 아님 → 수업일 게이트는 `select is_school_day from school_day_calendar where owner_id=? and date=?` 명시 쿼리로. **행 없으면(NEIS 미동기 날) 기본=수업일 아님(조용)** 으로 처리(오발송 회피).
- 부수 조회: T1/T2/S2 제목의 `studentYearId→이름·학년·반`은 service-role `publicDb()`에서 `studentYears`(+담임 join) 조회. `resolveToken`은 `{studentYearId, ownerId}`만 반환하므로 **`publicPages.id`를 추가 반환하도록 확장**(구독·테스트 스코프에 필요, Critic Minor 1).
- VAPID_SUBJECT는 `mailto:` 형식 필수(web-push 런타임 요건).
- SW `public/sw.js`는 push/notificationclick 핸들러만 추가(코브·오프라인·자동업데이트 불변). 아이콘 `/icons/icon-192.png` 재사용

---

## RALPLAN-DR 요약

### Principles
1. **발송은 절대 본 작업을 깨지 않는다**: 모든 푸시 발송은 `pushMemoToGoogle` 동형의 no-throw 래퍼 경유. 실패는 무시(단일 사용자 앱, 관측 로그면 충분).
2. **민감정보 제로**: 알림 본문에 사유·성적·질병·타 학생 정보 금지 — 공개 DTO allowlist 원칙을 알림 본문에 동일 적용.
3. **구독 수명 = 링크 수명**: 학생 구독은 publicPages cascade + 발송 시 활성 필터 이중 방어. 410/404 응답 구독은 즉시 삭제.
4. **크론은 하나**: 모든 시간 기반 발송(T3+S3)은 단일 크론 실행(UTC 22:30=KST 7:30), CRON_SECRET 검증, 수업일 게이트.
5. **환경 미설정 무해성**: VAPID env 미설정 시 카드가 "서버 설정 필요"를 표시할 뿐 어떤 경로도 throw하지 않는다.

### Decision Drivers (top 3)
1. 기존 시스템 무회귀(SW·액션·보안 정책 보존)
2. 운영 단순성(단일 크론·단일 구독 테이블·표준 web-push)
3. 학생 개인정보 보호(토큰 스코프·중립 문구)

### Viable Options
#### Option A — 단일 `push_subscriptions` 테이블 + `lib/push` 유틸 + 서버액션 인라인 트리거 + 크론 라우트 (**선정**)
- **Pros:** 스키마 1개(jsonb prefs로 교사/학생 토글 통합), 트리거가 액션 코드에 명시적으로 보여 추적 용이, 크론 1개로 Hobby 제약 충족, 기존 best-effort 패턴 재사용.
- **Cons:** 액션 5곳에 발송 호출 삽입(결합) — 래퍼 1줄 호출로 최소화.
#### Option B — DB 아웃박스 테이블 + 크론이 일괄 발송
- **Pros:** 액션과 발송 완전 분리, 재시도 가능.
- **Cons:** **즉시성 상실**(크론 하루 1회 — T1/T2·S1·S2가 다음날 아침 도착, 스펙의 "즉시" 위반). Hobby 제약에서 아웃박스는 성립 불가. **기각.**
#### Option C — 외부 푸시 서비스(FCM/OneSignal)
- **Cons:** 외부 의존·계정·SDK 추가, 학생 개인정보 제3자 전송 — 무과금·자체호스팅 원칙 위반. **기각.**

### Pre-mortem (컴팩트 3)
1. **크론이 미들웨어에 먹힘**: matcher 미제외 → 307 → 브리핑 영구 무발송. → matcher 제외를 AC로 격상 + curl 검증.
2. **VAPID 미설정 배포**: 구독 버튼이 죽거나 서버 throw. → 원칙 5(무해성 가드) + env 체크 액션.
3. **iOS 학생 대량 미수신**: 홈화면 미추가 상태 구독 시도 → 조용한 실패로 인지. → 카드에 iOS 조건 명시 + 게이트 2 실기기 확인 항목.

---

## 수용 기준 (스펙 AC-1~10 상속·구현 매핑)

- **AC-1 (스키마·유틸)** `0056_push_subscriptions.sql` + Drizzle(`lib/db/schema/push.ts`): `push_subscriptions` — id·ownerId·audience('teacher'|'student')·publicPageId(nullable FK→public_pages cascade)·endpoint·p256dh·auth·prefs(jsonb)·timestamps. **unique(endpoint, audience) 복합키**(같은 브라우저가 교사·학생 둘 다 구독해도 서로의 행을 덮지 않음 — Architect: unique(endpoint) 단독은 동일 브라우저 양쪽 테스트 시 한 역할 구독을 조용히 소실, AC-10 게이트 시나리오) + upsert on 복합키. RLS = **0050:21-27 패턴 정확 복제**(`enable row level security` + anon 전면 차단 + `for all to authenticated using (owner_id = auth.uid())`). endpoint/p256dh/auth는 **푸시 능력 크리덴셜**이라 PostgREST anon 표면 차단 필수. `get_public_page`(SECURITY DEFINER)가 이 컬럼 절대 select 안 함. `lib/push/send.ts`: web-push 발송(no-throw, 410/404 구독 삭제), `sendToTeacher(db,ownerId,kind,payload)`(prefs.instant/briefing 필터), `sendToStudents(db,rows,kind,payload)`(prefs+활성 링크 필터). **발송 시도마다 `writeAudit`로 결과 기록**(Follow-up→현재 격상, no-throw 발송의 유일한 관측 수단 — 원칙 1의 "관측 로그면 충분"을 실제화). 의존성: `web-push`+`@types/web-push`(dev)만.
- **AC-2 (SW)** `public/sw.js`에 `push`(payload {title,body,url} 표시, icon/badge=`/icons/icon-192.png`)·`notificationclick`(기존 창 focus+navigate 우선, 없으면 openWindow(url)) 추가. 기존 install/activate/fetch 로직 무변경.
- **AC-3 (교사 카드)** `app/(shell)/setting/profile/notify-card.tsx`("use client", google-calendar-card 관례) + `push-actions.ts`: 권한 요청→`pushManager.subscribe`(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`)→구독 등록 액션, 즉시/브리핑 토글(prefs 갱신), 테스트 발송 버튼, VAPID 미설정 시 안내만. 프로필 페이지에 마운트.
- **AC-4 (학생 카드)** `app/p/[token]/_components/notify-card.tsx` + `actions.ts`에 토큰 스코프 액션(등록·prefs·테스트): 홈 탭에 마운트, S1/S2/S3 3토글, iOS "홈 화면에 추가 후 가능" 안내, 유효 토큰(resolveToken 계열)만 등록 허용.
- **AC-5 (테스트 발송)** 교사·학생 테스트 버튼 → 본인 구독 전체에 즉시 1건("테스트 알림입니다"). **학생 테스트는 resolveToken으로 확정된 그 publicPageId 행에만 발송**(audience='student' 전체 발송 금지 — 교차 학생 발송 차단).
- **AC-6 (교사 즉시)** T1/T2: 해당 액션 성공 직후 no-throw 발송(제목 예: "상담 신청 — ○학년○반 ○○○", url `/homeroom/counsel`). 원 액션 결과는 발송 실패와 무관(단위 테스트로 래퍼 no-throw 보장).
- **AC-7 (크론)** `app/api/cron/daily-brief/route.ts`(GET, nodejs runtime): `Authorization: Bearer CRON_SECRET` 검증 — `crypto.timingSafeEqual`은 **길이 불일치 시 RangeError(→500)** 이므로 길이 선비교 또는 양쪽 sha256 해시 후 비교(또는 try/catch→401)로 **모든 미인증이 401** 되게 함(Critic Minor 3), **오너는 subscription 데이터에서 도출**(getOwnerId 사용 금지 — 세션 없음), KST 오늘(`kstDate` 재사용, 22:30 UTC=익일 07:30 KST 정확)이 `schoolDayCalendar` 수업일 아닐 시 조기 종료, T3 합성(4요소, 전부 비면 미발송) → briefing 토글 교사 구독 발송, S3(미제출 신고서 보유 학생 × docs 토글 × 활성 링크) → "제출할 서류가 있어요" 발송. `vercel.json` **병합**(기존 `{"regions":["icn1"]}` 유지): `{"regions":["icn1"],"crons":[{"path":"/api/cron/daily-brief","schedule":"30 22 * * *"}]}`. **middleware matcher에 `api/cron(?:/|$)` 제외 추가**(기존 api/health 관례). ⚠ Hobby 크론은 **정시가 아니라 해당 시(hour) 내 발화**(07:00~07:59 KST) — 정상 동작.
- **AC-8 (S1)** 한마디 등록 3액션에 발송 삽입: all→전 구독 학생, individual→대상 학생만. url=학생 본인 `/p/{token}`. **대량 발송은 `Promise.allSettled` + 동시성 상한(≈10)으로 `await`**(void 금지 — Hobby엔 waitUntil 없어 응답 후 함수 동결 시 in-flight 발송 사망. 순차 발송은 학급 30명 3~9s로 Hobby ~10s 한계 근접+교사 응답 블록 → 병렬 상한이 ~1s).
- **AC-9 (S2, ⚠ 순서 필수)** `cancelReservationAction`·`approveCancelAction`에 해당 학생 발송("상담 일정이 변경되었어요" 중립 문구). **`cancelReservation`/`approveCancelReservation`(counseling.ts:318,366)는 예약 행을 DELETE하므로, studentYearId+활성 토큰을 삭제 *이전*에 조회하거나 해당 쿼리를 `RETURNING student_year_id`로 변경해 전달**해야 함(삭제 후 조회는 0행 → 무발송 — Critic Major 1). S1~S3 전부 토글 존중 + 본문 민감정보 없음.
- **AC-10 (검증)** typecheck/test/build 그린 + 신규 단위 테스트(브리핑 합성 빈내용→null, prefs 필터, no-throw 래퍼, **S3 오너 도출이 briefing과 독립인지**, **timingSafeEqual 길이불일치→401**) + 구독 쿼리 실DB 통합 테스트(RUN_DB_ITEST) + 로컬 curl: 크론 라우트 미인증(짧은/틀린 토큰)→401·미들웨어 무리다이렉트 + **배포 후 실기기 게이트(사용자, 6종 전부)**: 교사·학생 테스트 버튼 수신 / T1 상담 신청 종단 / **S2 상담 취소→학생 수신**(삭제 순서 버그 검출) / **S3+T3 다음 수업일 아침 브리핑·서류 리마인드 수신**(오너 커플링·크론 검출).

## 구현 단계

1. **스키마**: `lib/db/schema/push.ts` + `0056_push_subscriptions.sql`(RLS 포함, 손작성 관례 — unique 키는 Drizzle과 정확 일치) + 배럴 export. prod 적용은 기존 관례대로 **사용자 승인 게이트**.
2. **발송 유틸**: `lib/push/send.ts` — VAPID lazy init(env 미설정 시 전 함수 no-op false 반환), `webpush.sendNotification` try/catch, 410/404 시 구독 행 삭제, 페이로드 JSON {title,body,url}. 대상 선택 헬퍼(prefs·활성 링크 필터)는 순수 함수 분리(`lib/push/targeting.ts`)로 단위 테스트.
3. **SW 확장**: `public/sw.js` push/notificationclick(AC-2 명세).
4. **클라 구독 헬퍼**: `app/ui/push-subscribe.ts` — 권한 요청→subscribe→직렬화 반환(공용, 교사/학생 카드 공유). `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 사용(base64url→Uint8Array 변환 포함).
5. **교사 카드+액션**: AC-3. 테스트 발송 액션은 `sendToTeacher(...,"test")`(prefs 무시하고 전 구독).
6. **학생 카드+액션**: AC-4 (토큰 검증 후 publicPageId 귀속, 홈 탭 마운트).
7. **트리거 삽입**: T1/T2 → **`lib/public/student-write.ts`의 reserveCounsel·requestCounselCancel 내부**(resolved.ownerId/studentYearId+publicDb 스코프, 학생명 조회), S1 → notice 3액션(studentYearIds 보유), S2 → counsel 2액션(reservationId→student→token 조회 후 발송) — 각 no-throw 호출 + writeAudit.
8. **크론**: 라우트(timingSafeEqual·데이터기반 오너도출)+vercel.json **병합**+middleware matcher 제외(AC-7).
9. **env 문서화**: `.env.local`·Vercel에 `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`CRON_SECRET` — 키 생성 `npx web-push generate-vapid-keys`, **사용자 게이트**(Vercel env 등록은 사용자).
10. **테스트·검증**: AC-10. 배포 후 게이트 2.

## 위험 및 완화

| 위험 | 완화 |
|---|---|
| R1 크론 무단 호출/미들웨어 차단 | CRON_SECRET 401 + matcher 제외 AC 격상 + curl 검증 |
| R2 발송 실패가 상담 신청 등 본 작업 파괴 | no-throw 래퍼(pushMemoToGoogle 동형) + 단위 테스트 |
| R3 만료·해지 구독 누적 | 410/404 즉시 삭제 + 학생은 링크 cascade |
| R4 VAPID 미설정 배포 | 전 경로 무해성 가드(원칙 5), 카드는 안내만 |
| R5 iOS 미수신 인지 실패 | 카드 문구 + 게이트 2 항목화 |
| R6 민감정보 유출 | 본문 문구를 AC에 고정(중립), 코드리뷰 체크 |
| R7 KST/UTC 착오 | 크론 22:30 UTC 명시 + 수업일 판정은 KST 오늘(kstToday 재사용) |
| R8 한마디 일괄 등록 시 폭풍 발송 | bulk 액션은 학생별 1건 통합(같은 내용 1회) + allSettled 상한 |
| R9 S2가 삭제된 예약 행 조회 → 무발송 | studentYearId·토큰을 DELETE 이전 조회(AC-9) + 실기기 게이트 S2 검출 |
| R10 S3가 교사 briefing 토글에 커플링 | 크론 오너집합을 T3/S3 분리 도출(코드사실) + 단위 테스트 + 실기기 게이트 |

## 검증 단계
1. typecheck/test/build + 신규 단위·통합 테스트 (자동)
2. 로컬: 크론 라우트 401/수업일 게이트, matcher 무리다이렉트 curl (자동)
3. 마이그 0056 prod 적용 (사용자 게이트)
4. VAPID·CRON_SECRET env 등록 (사용자 게이트)
5. 배포 후 실기기: 테스트 버튼(교사·학생) + 상담 신청 종단 + 다음 수업일 아침 브리핑 수신 (게이트, 사용자)

---

## ADR
- **Decision:** 단일 push_subscriptions 테이블(jsonb prefs, 학생은 publicPages cascade) + `lib/push` no-throw 발송 유틸 + 서버액션 인라인 트리거 + 단일 보호 크론(UTC 22:30)으로 스펙의 6종 알림을 구현한다.
- **Drivers:** 무회귀 > 운영 단순성 > 학생 개인정보 보호.
- **Alternatives:** (B) 아웃박스+크론 일괄 — Hobby 크론 1회 제약으로 즉시성 상실, 기각. (C) FCM/OneSignal — 외부 의존·개인정보 제3자 전송, 기각.
- **Why chosen:** Hobby 제약(크론 1회) 하에서 즉시성 알림은 액션 인라인이 유일하게 스펙을 만족하며, 기존 best-effort 선례(pushMemoToGoogle)로 리스크 패턴이 이미 검증됨.
- **Consequences:** 액션 5곳에 발송 코드 결합(1~3줄). 알림 종류 추가 시 prefs 키+트리거 삽입으로 확장. 브리핑 시각 변경은 vercel.json 수정 필요.
- **Follow-ups:** (1) 알림 히스토리 UI(비목표) (2) 브리핑 시각 사용자 설정화 (3) 발송 로그 테이블(현재는 무기록).

## 변경 이력
- Planner 초안.
- **Consensus 반영 (Architect SOUND-WITH-CONCERNS 7건 전부 폴딩):**
  1. `vercel.json` 신설→**병합**(기존 icn1 서울 리전 유지, 클로버 회귀 방지) — AC-7·코드사실.
  2. 크론 **오너 도출**을 subscription 데이터 기반으로 명시(getOwnerId 세션 의존 불가) — AC-7·코드사실.
  3. T1/T2 트리거를 action 래퍼→**`student-write.ts` 내부**로 위치 정정(ownerId/name/db 스코프), S2는 reservation→token 조회 추가 — 코드사실·단계 7.
  4. `unique(endpoint)`→**`unique(endpoint, audience)`** 복합키(동일 브라우저 양역할 구독 소실 방지) — AC-1.
  5. S1 대량 발송 **`Promise.allSettled`+동시성 상한+await**(void 금지, Hobby 타임아웃) — AC-8.
  6. 발송 로그를 Follow-up→**현재(writeAudit)** 격상(원칙 1 관측성 실제화) — AC-1.
  7. 테스트 발송 **학생=publicPageId 스코프 한정**+CRON_SECRET `timingSafeEqual`+SW `showNotification`+Hobby 크론 시간대 근사 — AC-5·AC-7·AC-2.
- **Consensus 2차 (Critic REVISE 2 Major + 4 Minor 전부 충족):**
  - Major1: S2가 삭제된 예약 조회 → **삭제 이전 조회/RETURNING** 명시(AC-9, R9).
  - Major2: S3가 교사 briefing에 커플링 → **T3/S3 오너집합 분리 도출**(코드사실, R10).
  - Minor1: `resolveToken`이 publicPages.id 미반환 → **id 추가 반환** 명시(코드사실).
  - Minor2: `schoolDayCalendar`는 테이블 → **명시 쿼리+미동기 날 기본 비수업일**(코드사실).
  - Minor3: `timingSafeEqual` 길이불일치 RangeError → **전 미인증 401 보장**(AC-7).
  - Minor4/누락: 동시성 상한 헬퍼 자작 명시 / **AC-10 실기기 게이트에 S2·S3·T3 추가**(무발송 검출) / studentYearId→이름 조회·VAPID_SUBJECT mailto 명시.
