# Deep Interview Spec: Edu_Note PWA 설치성 (교사 앱)

## Metadata
- Interview ID: di-pwa-2026-07-14
- Rounds: 8 (+Round 0 토폴로지)
- Final Ambiguity Score: 4.1%
- Type: brownfield
- Generated: 2026-07-14
- Threshold: 0.05
- Threshold Source: user explicit override ("모호도 5% 미만", settings 부재로 기본 0.2 대체)
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.97 | 0.35 | 0.34 |
| Constraint Clarity | 0.96 | 0.25 | 0.24 |
| Success Criteria | 0.95 | 0.25 | 0.24 |
| Context Clarity | 0.95 | 0.15 | 0.14 |
| **Total Clarity** | | | **0.959** |
| **Ambiguity** | | | **4.1%** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| PWA 설치성 | active | 교사 앱을 데스크톱/Android/iOS에 독립 앱처럼 설치·실행 | 전 수용 기준 커버 |
| 푸시 알림 목업 | **deferred** | 알림 설정 UI 자리 | R5 Contrarian 수용 — "동작 않는 '준비 중' 토글은 가치 없음" → 목업 자체를 생략, 다음 단계에서 UI+실구현 일괄 (2026-07-14 사용자 확정) |
| 푸시 알림 실구현 | **deferred** | Web Push 발송/구독 | 사용자가 초기 요청에서 다음 개발 단계로 명시 유예 |

## Goal
Edu_Note **교사 앱**(로그인 표면)을 PWA로 만들어 데스크톱(Chrome/Edge 설치), Android(Chrome 설치), iOS(Safari 홈 화면에 추가)에서 브라우저 UI 없이 **독립 앱처럼 설치·실행**되게 한다. 설치된 앱은 아이콘 클릭 시 `/today`(오늘의 학교)로 시작한다. 학생 공개 페이지(`/p/[token]`)는 이번 설치 대상이 아니지만, **확장이 막히지 않는 구조**(manifest 분리 가능한 배치)로 구현한다.

## Constraints
- **온라인 전용**: 오프라인이면 "인터넷 연결 필요" 안내 화면만 표시. 데이터·페이지 캐싱 없음 — service worker는 설치 요건 충족 + 오프라인 폴백만 담당하는 최소 구현. (근거: 전 데이터가 서버 DB 실시간 조회, 출결 등 신선도 민감. R3 확정)
- **자동 업데이트 보장**: 최소 SW 구성으로 main 배포 즉시 다음 실행에 새 버전 반영(사용자 질의로 확인된 요구). 공격적 프리캐싱 금지.
- **시작 화면 = `/today`**: manifest `start_url`. 미로그인 시 기존 미들웨어가 /login으로 보내는 흐름 그대로 수용.
- **iOS 플랫폼 제약 수용**: 자동 설치 프롬프트 없음(수동 '홈 화면에 추가'), standalone 쿠키 저장소 분리(앱에서 최초 1회 로그인 필요). 이를 우회하려 하지 않고 안내로 해결.
- **기존 코드 보존**: middleware matcher가 manifest/SW/아이콘 요청을 세션 검사 없이 통과시켜야 함(현재 정적 확장자 제외 규칙 확인·보강). next.config 보안 헤더 유지.
- **디자인 철학**: 아이콘·설치 안내 UI는 xAI 다크 리디자인 톤 + "교사 어시스턴트" 정체성 반영.
- **신규 무거운 의존성 지양**: 온라인 전용이므로 next-pwa 등 불필요 — 수동 구현(app/manifest.ts + 최소 SW).

## Non-Goals
- 푸시 알림(목업 포함) — 다음 개발 단계 (R5에서 목업도 제외 확정)
- 오프라인 데이터 열람/동기화
- 학생 공개 페이지(`/p/[token]`)의 설치성 — 단, 구조적으로 막지 않을 것
- 앱스토어 배포(TWA 등)

## Acceptance Criteria
- [ ] AC-1 `app/manifest.ts`(또는 동등): name/short_name "Edu_Note", `start_url: /today`, `display: standalone`, 다크 톤 theme/background color, 192·512px 아이콘(+maskable) 제공
- [ ] AC-2 최소 service worker 등록: 설치성 요건 충족, fetch는 네트워크 우선, 오프라인 내비게이션 시 "인터넷 연결 필요" 폴백 페이지 표시. 프리캐싱 없음(자동 업데이트 보장)
- [ ] AC-3 **아이콘 후보 4종**: 서로 다른 접근의 SVG 4개 제작(xAI 다크 톤+교사 어시스턴트 반영) → 사용자 피드백으로 1종 선정 → PNG(192/512/maskable/apple-touch-icon) 변환 반영
- [ ] AC-4 iOS 지원 메타: `apple-mobile-web-app-capable`, `apple-touch-icon`, status-bar-style — Safari '홈 화면에 추가' 시 standalone 실행
- [ ] AC-5 설정실 프로필에 "앱으로 설치" 섹션: Chrome/Edge/Android = `beforeinstallprompt` 기반 설치 버튼, iOS = 수동 안내 문구(공유→홈 화면에 추가), 이미 설치(standalone 실행) 시 섹션 숨김/완료 표시
- [ ] AC-6 middleware가 `/manifest.webmanifest`(및 SW·아이콘 경로)를 인증 없이 통과 — 미로그인 상태에서도 설치성 유지
- [ ] AC-7 자동 검증: Lighthouse PWA installable 통과 + manifest/SW/아이콘 응답 200 확인 + `npm run typecheck`/`test`/`build` 그린
- [ ] AC-8 실기기 검증(배포 후 사용자): 데스크톱 Chrome/Edge 설치, Android Chrome 설치, iOS Safari 홈 화면 추가 — 각각 독립 창 실행·로그인 유지·기능 정상 (사용자 확인 게이트)
- [ ] AC-9 회귀 없음: 기존 페이지·보안 헤더·공개 페이지 레이트리밋 동작 불변

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 설치 대상 = 앱 전체 | 두 표면(교사/학생) 중 어느 쪽? (R1) | 교사 앱만, 학생 확장 가능 구조 |
| PWA니까 오프라인 지원 | 데이터 신선도 리스크 지적 (R3) | 온라인 전용 확정 |
| 푸시 목업이 가치 있음 | Contrarian: 죽은 토글은 기대만 준다 (R5) | 목업 생략, 다음 단계 일괄 |
| 아이콘은 대충 생성 | 디자인 철학 반영 요구 (R6) | 4종 SVG 후보→사용자 선정 프로세스 |
| 시작 화면 = 홈 | 매일 아침 여는 앱의 첫 화면? (R7) | `/today` 확정 |
| 사용자가 알아서 설치 | iOS는 수동 설치라 안내 필요 (R8) | 설정실 안내 섹션 확정 |

## Technical Context (brownfield)
- Next.js 15 App Router + Vercel Hobby. PWA 자산 전무: `public/` 없음, manifest/SW/아이콘/favicon 없음 → 전부 신규
- `app/layout.tsx`: 메타 최소(title/desc), CDN 폰트(Pretendard jsdelivr, Google Fonts) — 온라인 전용이라 캐싱 무관
- `middleware.ts`: 보호 경로 Supabase 세션 + `/p/*` 레이트리밋. matcher가 `favicon.ico`·이미지 확장자 제외 중 — manifest/SW 경로 제외 확인 필요 (AC-6)
- `next.config.ts`: 보안 헤더(X-Frame-Options DENY 등, 유지), staleTimes 30s
- 모바일 /→/today 리다이렉트는 현재 코드에 없음 — start_url이 /today라 불필요
- 도구: next-pwa 미사용, `app/manifest.ts` + 수동 최소 SW

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| 교사 앱 | core domain | 로그인 표면, /today 시작 | PWA셸이 감싼다 |
| PWA 셸 | core domain | manifest, 최소 SW, 아이콘(4후보→1), 메타태그 | 교사 앱을 설치 가능하게 |
| 오프라인 안내 페이지 | supporting | "인터넷 연결 필요" 문구 | SW가 오프라인 시 표시 |
| 설치 안내 섹션 | supporting | 설치 버튼(Chrome계)+iOS 수동 안내, 설치 시 숨김 | 설정실 프로필에 위치 |
| 학생 공개 페이지 | external (비대상) | /p/[token] | 이번 미설치, 확장 가능 유지 |

## Ontology Convergence
| Round | Count | New | Changed | Stable | Stability |
|-------|-------|-----|---------|--------|-----------|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 4 | 0 | 1 (푸시목업→알림설정섹션) | 3 | 100% |
| 3 | 5 | 1 (오프라인안내) | 0 | 4 | 80% |
| 4 | 5 | 0 | 0 | 5 | 100% |
| 5 | 4 | 0 | 0 | 4 (알림설정섹션 의도적 제거) | 100% |
| 6-7 | 4 | 0 | 0 | 4 | 100% |
| 8 | 5 | 1 (설치안내섹션) | 0 | 4 | 80% |

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds + R0)</summary>

**R0 토폴로지:** 3컴포넌트(설치성/푸시목업/푸시실구현-유예) → "맞습니다"
**R1 설치 범위:** 교사 앱 vs 학생 페이지 → "이번엔 교사만+확장설계" (모호도 64%)
**R2 목업 깊이:** → "설정 UI만 (비활성)" (49%)
**R3 오프라인:** → "온라인 전용" (34%)
**R4 완료 기준:** → "자동검증+사용자 실기기" (23%)
**R5 ⚡Contrarian 목업 존재:** → "목업 생략 (contrarian 수용)" (11%) — 토폴로지 축소
**R6 🔪Simplifier 아이콘:** → "SVG 후보 4종 제작(xAI 톤+교사 어시스턴트), 사용자 피드백으로 결정" (8%)
**R7 시작 화면:** → "오늘의 학교(/today)" (6.4%)
**R8 설치 안내:** → "설정실에 안내 섹션 (추천)" (4.1% ✅)

**중간 질의:** "배포하면 설치된 앱도 자동 업데이트되나?" → 온라인 전용 구성이라 자동 반영 보장 (constraints에 명문화)
</details>
