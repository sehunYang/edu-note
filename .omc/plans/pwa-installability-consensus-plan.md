# PWA 설치성 구현 계획 (교사 앱)

**Status:** pending approval (consensus / RALPLAN-DR short mode)
**Date:** 2026-07-15
**Input Spec:** `.omc/specs/deep-interview-pwa-installability.md` (모호도 4.1%, PASSED)

---

## 요구사항 요약

교사 앱을 데스크톱(Chrome/Edge)·Android(Chrome)·iOS(Safari 홈 화면 추가)에서 독립 앱처럼 설치·실행. 시작 화면 `/today`. **온라인 전용**(오프라인 = 안내 페이지만), **자동 업데이트 보장**(프리캐싱 금지). 푸시는 목업 포함 전부 다음 단계(Non-Goal). 아이콘은 SVG 후보 4종 → 사용자 선정. 설정실 프로필에 설치 안내 섹션. 학생 공개 페이지(`/p/[token]`)는 비대상이나 확장 가능 구조 유지.

### 핵심 코드 사실
- PWA 자산 전무: `public/` 없음, manifest/SW/아이콘/favicon 없음 (Glob/ls 확인)
- `app/layout.tsx:4-7` — 메타 최소(title/description만). viewport/themeColor/manifest 없음
- `middleware.ts:31-38` — matcher가 `_next/static`·`favicon.ico`·이미지 확장자(svg|png|…)만 제외. **`.webmanifest`·root `.js`·`.html`은 제외 안 됨**
- `lib/supabase/middleware.ts:46-53` — 미인증/비허용 이메일 요청은 **`/login`으로 리다이렉트** → 현재 규칙대로면 `/manifest.webmanifest`·`/sw.js` 요청이 리다이렉트되어 설치성·SW 등록 실패(잘못된 MIME)
- `next.config.ts:12-30` — 보안 헤더(X-Frame-Options DENY 등) 전역. 유지 필수
- 설치 카드 배치처: `app/(shell)/setting/profile/page.tsx` + 기존 카드 패턴 `google-calendar-card.tsx`
- Next.js 15 App Router: `app/manifest.ts` → `/manifest.webmanifest` 자동 서빙, `app/apple-icon.png` → apple-touch-icon 메타 자동 생성

---

## RALPLAN-DR 요약 (short mode)

### Principles
1. **온라인 전용 + 자동 업데이트:** SW는 오프라인 폴백 1파일만 캐시(`skipWaiting`+`clients.claim`) — main 배포 즉시 다음 실행에 반영. 프리캐싱 금지.
2. **신규 런타임 의존성 0:** next-pwa/serwist 배제. App Router 네이티브 규약(`app/manifest.ts`, icon 파일 규약) + 수작성 최소 SW.
3. **설치성은 미인증에도 성립:** manifest/SW/오프라인 페이지는 미들웨어 세션 검사 밖(신뢰 경계는 데이터가 아닌 셸 자산이므로 안전).
4. **기존 정책 불변:** 보안 헤더·staleTimes·`/p/*` 레이트리밋·로그인 흐름 무변경.
5. **아이콘 사용자 게이트:** 4후보(xAI 다크 톤+교사 어시스턴트) → 피드백 → 확정 후에만 PNG 세트 생성.

### Decision Drivers (top 3)
1. **데이터 신선도 > 오프라인 편의** — 출결·성적 실시간 조회 앱, 스테일 캐시는 해악.
2. **유지보수 단순성** — 자동 업데이트 보장, 빌드 플러그인·의존성 추가 없음.
3. **3플랫폼 설치성 충족** — Chromium installability 요건 + iOS standalone 메타.

### Viable Options

#### Option A — 수동 최소 구현 (**선정**)
`app/manifest.ts` + `public/sw.js`(navigate 실패 시에만 오프라인 폴백) + 아이콘 규약 파일 + 설치 카드.
- **Pros:** 의존성 0, SW 20~30줄로 전 동작 파악 가능, 프리캐싱 없어 자동 업데이트 확실, 온라인 전용 요구와 정확히 일치.
- **Cons:** SW 수명주기(버전 캐시 정리 등)를 직접 다뤄야 함 — 단, 폴백 1파일이라 표면적 극소.

#### Option B — next-pwa/serwist 도입
- **Pros:** 검증된 workbox 수명주기, 커뮤니티 관례.
- **Cons:** 기본 동작이 정적 자산 프리캐싱 → **자동 업데이트 요구와 정면 충돌**(구버전 셸 1회 잔존), 빌드 플러그인+의존성 추가, 온라인 전용엔 명백한 과설계. **기각.**

#### Option C — manifest만(SW 없이)
- **Pros:** 최소 코드.
- **Cons:** 오프라인 시 브라우저 기본 에러 화면(앱답지 않음), 구형 Chromium 설치성 신뢰 불가, 스펙 AC-2(오프라인 안내) 미충족. **기각.**

---

## 수용 기준 (스펙 AC-1~9 상속, 구현 매핑)

- **AC-1** `app/manifest.ts`: name/short_name "Edu_Note", `start_url: "/today"`, `display: "standalone"`, `scope: "/"`, 안정적 `id`, theme/background color **`#0a0a0a`**(globals.css `--background` 확인값), icons 192/512 + maskable 512. manifest.ts 자체는 아이콘 게이트 전에 최종 경로로 작성 가능(PNG는 게이트 후 생성).
- **AC-2** `public/sw.js`: install 시 오프라인 페이지 1파일만 버전 캐시 + `skipWaiting`, activate 시 구캐시 정리 + `clients.claim` + **`navigationPreload.enable()`**, fetch는 **`mode === "navigate" && method === "GET"`만** 가로채 `event.preloadResponse` 우선 → `fetch` → 실패 시에만 오프라인 페이지. **라이브 응답 `cache.put` 금지**(온라인 전용 보장). 그 외 요청 무개입 — Navigation Preload로 SW 콜드스타트가 내비게이션을 직렬화하지 않음(기존 지연 개선 회귀 방지).
- **AC-3** 아이콘 후보 4종 SVG(서로 다른 접근, xAI 다크 톤+교사 어시스턴트) 제시 → **사용자 선정 게이트** → 선정본을 192/512/maskable-512/apple-touch(180) PNG로 변환·배치.
- **AC-4** iOS 메타: layout `metadata.appleWebApp`(capable/title/statusBarStyle) + `app/apple-icon.png` 규약 + `viewport` export에 `themeColor`.
- **AC-5** `install-app-card.tsx`(설정실 프로필): **조기 캡처 채널** — `beforeinstallprompt`는 카드 마운트 전에 발화하므로 전 라우트에 마운트되는 `app/sw-register.tsx`가 `preventDefault()`+window 스코프 ref에 보관+커스텀 이벤트 재발행, 카드는 그 채널에서 읽어 설치 버튼(`prompt()`) 노출. iOS(iPhone/iPad UA & 비standalone)→수동 안내 문구(+standalone 쿠키 분리로 앱 첫 실행 시 재로그인 1회 안내). standalone 감지(display-mode/navigator.standalone)→"앱으로 실행 중" 표시.
- **AC-6** `middleware.ts` matcher에 **앵커된** 제외 추가: `manifest\\.webmanifest$`·`sw\\.js$`·`offline\\.html$` (비앵커 `sw\\.js`는 `/xsw.js` 누수 매치 — 금지). 미인증 fetch가 /login 리다이렉트되지 않음을 Git Bash `curl.exe -I`로 200+정확한 Content-Type 확인.
- **AC-7** 자동 검증(⚠ Lighthouse 12부터 PWA 카테고리 삭제 — 사용 불가): `npm run typecheck`/`test`/`build` 그린 + 로컬 `next start`에서 manifest/sw/offline/아이콘 200·Content-Type·무리다이렉트 + manifest 필수 필드(192·512 아이콘, name, start_url, standalone) 파싱 단언 + SW 등록 확인. 설치성 최종 판정은 DevTools Application 패널(수동) + AC-8 실기기 게이트가 권위.
- **AC-8** 실기기 검증(배포 후 **사용자 게이트**): 데스크톱 Chrome/Edge 설치, Android Chrome 설치, iOS Safari 홈 화면 추가 — 독립 창 실행·로그인 유지·기능 정상.
- **AC-9** 회귀 없음: 기존 페이지·보안 헤더·레이트리밋 불변(전체 테스트 그린 + 헤더 스팟 체크).

---

## 구현 단계

### 1. 오프라인 폴백 — `public/offline.html` (신규, public/ 디렉토리 신설)
- 완전 자립형 정적 HTML(인라인 CSS, 외부 폰트/자원 참조 금지 — 오프라인이므로). 다크 톤, "인터넷 연결이 필요합니다" + 재시도 버튼(`location.reload()`).

### 2. 최소 SW — `public/sw.js` (신규)
- `CACHE_NAME = "edu-note-offline-v1"`, install: `cache.add("/offline.html")` + `skipWaiting()`.
- activate: 타 캐시 삭제 + `clients.claim()` + `self.registration.navigationPreload?.enable()`.
- fetch: `event.request.mode === "navigate" && event.request.method === "GET"`일 때만 — `(await event.preloadResponse) ?? fetch(request)` 실패 시 `caches.match("/offline.html")`. **라이브 응답 저장(cache.put) 절대 금지.** 다른 요청은 건드리지 않음(원칙 1).

### 3. Manifest — `app/manifest.ts` (신규)
- Next `MetadataRoute.Manifest` 반환. AC-1 값. 아이콘 경로 `public/icons/*.png`(4단계 산출물).

### 4. 아이콘 — 후보 제시 → 사용자 게이트 → PNG 세트
- 4a. SVG 후보 4종을 `public/icons/candidates/`에 제작(서로 다른 접근: 예 — 타이포그래피 모노그램/기하 심볼/노트 모티프/조합형). **사용자 확인·피드백 대기(게이트 1).**
- 4b. 선정본을 두 벌 준비: 일반용 + maskable용(안전 영역 ~10% 패딩을 **SVG 소스에 직접 반영** — 변환기는 리스케일만). 변환은 `npx --yes resvg-cli`(⚠ `@resvg/resvg-cli`는 npm 404 — unscoped `resvg-cli` v2.6.2 확인됨, 일회성·의존성 미추가):
  - `npx --yes resvg-cli icon.svg -w 192 -h 192 public/icons/icon-192.png`
  - `npx --yes resvg-cli icon.svg -w 512 -h 512 public/icons/icon-512.png`
  - `npx --yes resvg-cli icon-maskable.svg -w 512 -h 512 public/icons/icon-maskable-512.png`
  - `npx --yes resvg-cli icon.svg -w 180 -h 180 app/apple-icon.png`
  - favicon도 이 참에 `app/icon.png`(512 재사용)로 해결. resvg 실패 시 폴백: `sharp` 일회성 스크립트.

### 5. 레이아웃 통합 — `app/layout.tsx`
- `metadata`에 `manifest: "/manifest.webmanifest"`, `appleWebApp: { capable: true, title: "Edu_Note", statusBarStyle: "black-translucent" }` 추가. `viewport` export 신설(`themeColor: "#0a0a0a"` — Next 15는 metadata가 아닌 별도 viewport export 필수).
- SW 등록+조기 캡처 컴포넌트 `app/sw-register.tsx`(신규, `"use client"`): `useEffect`에서 `navigator.serviceWorker.register("/sw.js")`(실패 무해) **+ `beforeinstallprompt` 조기 리스너**(`preventDefault()` → window 스코프 ref 보관 → 커스텀 이벤트 재발행, AC-5 채널) → `<body>`에 마운트.

### 6. 미들웨어 제외 — `middleware.ts:36`
- matcher 제외 목록에 **앵커된** `manifest\\.webmanifest$`, `sw\\.js$`, `offline\\.html$` 추가(비앵커는 `/xsw.js` 누수 — 기존 세그먼트 경계 주석 관례와 동일한 정밀성 유지).

### 6.5. SW 신선도 헤더 — `next.config.ts` `headers()`
- `/sw.js`에 `Cache-Control: public, max-age=0, must-revalidate` 명시(Vercel 기본값 가정 제거 — R3를 사실로 만듦). 기존 보안 헤더 무변경.

### 7. 설치 카드 — `app/(shell)/setting/profile/install-app-card.tsx` (신규) + `page.tsx` 마운트
- 클라이언트 컴포넌트, `google-calendar-card.tsx` 스타일 관례. 상태 3분기: (a) standalone → "앱으로 실행 중" 완료 표시, (b) `beforeinstallprompt` 수신 → 설치 버튼(`prompt()` 호출), (c) iOS Safari → 수동 안내(공유 → 홈 화면에 추가). 그 외(이벤트 미수신 데스크톱 등) → 간단 안내.

### 8. 검증 (순서 중요 — 설치성 단언은 아이콘 게이트 뒤)
- **8a. 아이콘 무관(게이트 전 가능):** `npm run typecheck`/`test`/`build` 그린. `next start` 로컬에서 Git Bash **`curl.exe -I`**(PowerShell `curl` 별칭 아님)로 `/manifest.webmanifest`·`/sw.js`·`/offline.html` → 200 + 올바른 Content-Type + 미인증 무리다이렉트(AC-6).
- **8b. 아이콘 게이트(게이트 1) 후:** manifest 필수 필드 파싱 단언(192·512 아이콘 경로 실존, name, start_url, standalone) + 브라우저에서 SW 등록 확인 + DevTools Application 패널 installability 수동 확인(AC-7 — Lighthouse PWA 카테고리는 v12에서 삭제되어 대체).
- **8c. 배포 후:** AC-8 실기기 3플랫폼 확인(게이트 2, 사용자).
- **롤백:** 전 변경이 신규 파일 추가 + matcher 1줄 + next.config 헤더 1블록 — `git revert` 한 번으로 복구.

---

## 위험 및 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| R1: SW가 의도치 않게 응답 캐시 → 스테일 데이터 | 높음 | fetch 핸들러가 navigate 실패 폴백만 수행(응답 저장 없음). 코드리뷰+AC-2 명시 검증 |
| R2: matcher 제외 누락/오타 → 미인증 설치 실패 | 중 | AC-6 curl 검증을 필수 단계로. 기존 세그먼트 경계 주석 관례 준수 |
| R3: 구 SW 잔존으로 업데이트 지연 | 중 | `skipWaiting`+`clients.claim`+버전 캐시명. Vercel public 자산 기본 `max-age=0, must-revalidate`라 sw.js 자체도 즉시 갱신 |
| R4: iOS standalone 쿠키 분리로 "로그인 풀림" 오해 | 낮음 | 스펙 제약으로 명문화 + 설치 카드 안내 문구에 1줄 포함 |
| R5: 아이콘 게이트에서 재작업 반복 | 낮음 | 후보 4종을 서로 다른 접근으로 — 방향 수렴 후 세부 피드백만 |
| R6: X-Frame-Options 등 보안 헤더가 PWA 동작 간섭 | 낮음 | standalone은 iframe이 아니므로 무관. AC-9 헤더 스팟 체크로 회귀만 확인 |

---

## 검증 단계
1. typecheck/test/build 그린 (자동)
2. 로컬 `next start` — manifest/sw/offline 200 + Content-Type + 미인증 무리다이렉트 (자동, Git Bash curl.exe)
3. 아이콘 4후보 사용자 선정 (게이트 1)
4. 게이트 후: manifest 필드·아이콘 실존 단언 + SW 등록 + DevTools installability (Lighthouse PWA 카테고리 삭제로 대체)
5. 배포 후 3플랫폼 실기기 설치 확인 (게이트 2, 사용자)

---

## ADR

- **Decision:** next-pwa 없이 App Router 네이티브 규약 + 수작성 최소 SW(navigate 폴백 전용)로 PWA 설치성을 구현하고, 미들웨어 matcher에 셸 자산 3종을 제외한다. 아이콘은 4후보 사용자 게이트로 확정한다.
- **Drivers:** 데이터 신선도 > 오프라인 편의; 유지보수 단순성(자동 업데이트·의존성 0); 3플랫폼 설치성.
- **Alternatives considered:** (B) next-pwa/serwist — 프리캐싱이 자동 업데이트 요구와 충돌+의존성 추가, 기각. (C) manifest만 — 오프라인 UX 부재·설치성 신뢰 불가, 기각.
- **Why chosen:** 온라인 전용이라는 확정 제약 하에서 SW의 유일한 존재 이유는 설치성 요건+오프라인 안내뿐 — 이를 20~30줄 수작성으로 충족하면 업데이트 즉시성이 구조적으로 보장되고 회귀 표면이 최소화된다.
- **Consequences:** 오프라인 기능 요구가 미래에 생기면 SW 재설계 필요(현 구조는 확장이 아니라 교체 대상). 학생 페이지 설치성 확장 시 별도 manifest 분기 필요(현 구조는 막지 않음). 아이콘 선정 전까지 4b~ 이후 단계 일부 대기.
- **Follow-ups:** (1) 다음 단계 푸시 알림(Web Push: VAPID+구독 저장+발송 트리거) — 이번 SW는 push 핸들러 추가만으로 확장 가능. (2) 학생 페이지 PWA 분기 검토. (3) Lighthouse PWA 카테고리 CI 자동화 여부.

---

## 변경 이력
- Planner 초안.
- **Consensus 반영 (Architect SOUND-WITH-CONCERNS + Critic REVISE → 요구사항 전부 충족):**
  - P1a: Lighthouse PWA 카테고리(v12 삭제) 검증 게이트 → curl+manifest 필드 단언+DevTools+실기기 게이트로 교체 (AC-7, 8b).
  - P1b: SW에 Navigation Preload + `navigate&&GET` 가드 + `cache.put` 금지 명문화 (AC-2, 단계 2) — 기존 지연 개선 회귀 방지.
  - P2: `/sw.js` Cache-Control 명시(단계 6.5), matcher 제외 `$` 앵커(AC-6, 단계 6), `beforeinstallprompt` 조기 캡처를 `sw-register.tsx`로 지정(AC-5, 단계 5).
  - P3: manifest `scope`/`id` 추가, maskable 패딩은 SVG 소스에 반영(AC-1, 4b).
  - Critic #1: `@resvg/resvg-cli`(npm 404) → unscoped `resvg-cli` v2.6.2 + 사이즈별 명령 명시(4b).
  - Critic #2: 검증 순서 재배열 — 설치성 단언을 아이콘 게이트 뒤로(8a/8b/8c).
  - Critic #4/#5: curl은 Git Bash `curl.exe`, 색상 `#0a0a0a` 고정.
  - 롤백 경로 1문장 추가. manifest.ts는 게이트 전 작성 가능(경로만 선기입) 명시.
