# Deep Interview Spec: PWA 푸시 알림 (교사·학생 영역)

## Metadata
- Interview ID: di-push-notify-2026-07-17
- Rounds: 8 (+Round 0 토폴로지)
- Final Ambiguity Score: 4.8%
- Type: brownfield
- Generated: 2026-07-17
- Threshold: 0.05
- Threshold Source: user explicit override ("모호도 5%", settings 부재로 기본 0.2 대체)
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.97 | 0.35 | 0.34 |
| Constraint Clarity | 0.94 | 0.25 | 0.24 |
| Success Criteria | 0.94 | 0.25 | 0.24 |
| Context Clarity | 0.95 | 0.15 | 0.14 |
| **Total Clarity** | | | **0.952** |
| **Ambiguity** | | | **4.8%** |

## Topology
| Component | Status | Description | Coverage |
|-----------|--------|-------------|----------|
| 푸시 인프라 | active | VAPID·구독 DB·발송 유틸·SW 핸들러·설정 UI(교사/학생)·테스트 버튼 | AC-1~5, 10 |
| 교사 영역 알림 | active | 즉시 2종 + 아침 브리핑(수업일 7:30) | AC-6~7 |
| 학생 영역 알림 | active | 새 공지·상담 통지·서류 리마인드 3종 | AC-8~9 |

## Goal
이전 PWA 단계에서 명시 유예했던 푸시 알림을 실구현한다. **교사**(로그인 표면, 설치된 PWA 포함)는 학생 행동에 대한 **즉시 알림 2종**과 **수업일 아침 7:30 브리핑 1건**을 받고, **학생**(공개 페이지 `/p/[token]` 구독자)은 **새 공지·상담 변경 통지·제출 서류 리마인드 3종**을 받는다. 양쪽 모두 **종류별 토글 + 테스트 발송 버튼**이 있는 설정 UI를 가진다.

## 알림 카탈로그 (확정)

### 교사 — 즉시 (이벤트 트리거)
| # | 알림 | 트리거 지점 (실코드) | 내용 예시 | 클릭 딥링크 |
|---|---|---|---|---|
| T1 | 상담 신청 접수 | `reserveCounselAction`(app/p/[token]/actions.ts:32) | "김○○ 상담 신청 — 7/21(월) 점심" | /homeroom/counsel |
| T2 | 상담 취소 요청 | `requestCounselCancelAction`(:41) | "김○○ 상담 취소 요청" | /homeroom/counsel |

### 교사 — 아침 브리핑 (수업일만 7:30 KST, 크론 1건)
| # | 요소 | 데이터 소스 (재사용) |
|---|---|---|
| T3a | 오늘 수업 요약(수업 n개·첫 교시) | `listTodayLessons` |
| T3b | 오늘의 할 일 | `collectNudges` |
| T3c | 미제출 신고서 현황(위험/심각 건수) | `listPendingReportTiers` |
| T3d | 오늘 학사일정·상담 예약 | `getEventsInRange`·상담 예약 조회 |
- 4요소를 **1건의 푸시**로 합성(제목: "오늘의 학교 브리핑" 류). 내용이 전부 비면 발송 생략.
- 수업일 판정: `schoolDayCalendar`(주말·방학·공휴일 조용).

### 학생 — 3종
| # | 알림 | 트리거 | 대상 | 비고 |
|---|---|---|---|---|
| S1 | 새 공지·한마디 | 교사가 한마디/개별 공지 등록 시 즉시 | targetScope=all → 구독 전원 / individual → 해당 학생만 | |
| S2 | 상담 변경 통지 | 교사 `cancelReservationAction`·`approveCancelAction`(homeroom/counsel/actions.ts:125,141) | 해당 학생 | 신청은 즉시 확정 구조라 "확정 알림"은 불필요(인터뷰 중 코드로 확인) |
| S3 | 제출 서류 리마인드 | 아침 크론(교사 브리핑과 동일 실행)에서 미제출 신고서 보유 학생에게 | 해당 학생 | **민감정보 금지**: "제출할 서류가 있어요" 수준 중립 문구(사유·질병정보 미포함 — 공개 페이지 DTO allowlist 원칙과 동일) |

## Constraints
- **Vercel Hobby 크론 = 하루 1회**: 모든 시간 기반 알림(T3, S3)은 단일 크론 실행에 통합. KST 7:30 = UTC 22:30(전날) 크론 표현식.
- **iOS Web Push 제약**: iOS 16.4+ 홈 화면 추가된 상태에서만 수신 가능 — 학생 홈 탭 카드에 iOS 안내 문구 포함. 교사도 동일(이미 PWA 설치 완료).
- **구독 데이터 모델**: 교사 구독(ownerId 귀속)과 학생 구독(publicToken/studentYearId 귀속) 구분 저장. 종류별 토글 상태도 함께 저장(교사: 즉시/브리핑 2토글, 학생: S1/S2/S3 3토글).
- **발송 실패 무해성**: 푸시 발송 실패(구독 만료 등)가 원 액션(상담 신청 저장 등)을 절대 실패시키지 않는다 — 구글 캘린더 push의 best-effort 원칙(원칙 3)과 동일. 410/404 구독은 정리.
- **보안**: VAPID private key는 서버 env 전용. 학생 구독 등록은 유효 토큰 스코프 서버액션으로만. 알림 본문에 민감정보(사유·성적·타 학생 정보) 금지.
- **기존 SW 확장**: `public/sw.js`에 `push`·`notificationclick` 핸들러 추가(코브·오프라인 폴백 로직 불변). 클릭 시 딥링크 열기(열린 창 focus 우선).
- **신규 의존성 최소**: 발송은 `web-push` 라이브러리 1개 허용(표준). DB 마이그레이션 필요(구독 테이블).

## Non-Goals
- 알림 히스토리/받은편지함 UI
- 교사 다중 계정·다중 기기별 개별 관리 UI(구독은 기기별 자동 누적, 관리 화면은 없음)
- 이메일/SMS 등 푸시 외 채널
- 학생 아침 시간표·급식 알림(인터뷰에서 명시 제외)
- 선택과목 제출·공지 읽음 교사 알림(인터뷰에서 명시 제외)

## Acceptance Criteria
- [ ] AC-1 (인프라) VAPID 키 env 설정 + 구독 테이블 마이그레이션(교사/학생 구분, 종류별 토글 컬럼) + `web-push` 발송 유틸(410/404 구독 자동 정리, 절대 throw 안 함)
- [ ] AC-2 (SW) `public/sw.js`에 push 핸들러(제목/본문/딥링크 표시)·notificationclick(기존 창 focus 또는 새 창) 추가 — 기존 오프라인 폴백·자동 업데이트 동작 회귀 없음
- [ ] AC-3 (교사 설정 UI) 설정실 프로필에 "알림" 카드: 권한 요청+구독 등록, 즉시/브리핑 2토글, 테스트 발송 버튼
- [ ] AC-4 (학생 설정 UI) 공개 페이지 홈 탭에 "알림 받기" 카드: 권한 요청+구독 등록(토큰 스코프), S1/S2/S3 3토글, 테스트 발송 버튼, iOS 홈화면 추가 안내
- [ ] AC-5 (테스트 발송) 양쪽 테스트 버튼 클릭 → 해당 기기로 즉시 푸시 1건 수신
- [ ] AC-6 (교사 즉시) T1/T2 트리거 액션 수행 시 구독된 교사 기기 전부에 즉시 발송(토글 on일 때만), 원 액션은 발송 실패와 무관하게 성공
- [ ] AC-7 (브리핑) Vercel 크론(UTC 22:30)이 수업일에만 T3 합성 1건 발송, 비수업일·내용 전무 시 미발송. S3도 같은 실행에서 대상 학생별 발송
- [ ] AC-8 (학생 S1) 한마디/개별 공지 등록 시 대상 규칙(all=전원, individual=해당자)대로 발송
- [ ] AC-9 (학생 S2) 교사 취소/취소승인 시 해당 학생에게 발송. S1~S3 전부 토글 존중 + 본문 민감정보 없음
- [ ] AC-10 (검증) typecheck/test/build 그린 + 구독/발송 유틸 단위·통합 테스트 + 배포 후 실기기: 테스트 버튼 수신(교사·학생 각 1기기) 및 상담 신청 1건 종단 확인(게이트, 사용자)

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 알림 후보는 사용자가 나열 | 기능 전수조사 후 제안·선별 방식(사용자 요청) | 즉시 4후보 중 2, 브리핑 4요소 전부, 학생 4후보 중 3 선별 |
| 시간 알림 자유 배치 | Vercel Hobby 크론 1일 1회 제약 노출 | 아침 7:30 크론 1건에 T3+S3 통합 |
| 상담 "확정" 알림 필요 | 코드 확인: 신청 즉시 확정, 승인 단계 없음 | S2는 취소/취소승인 통지로 재정의 |
| 설정은 단순할수록 좋다 | Contrarian: 전체 on/off 제안 | 기각 — 종류별 토글 확정 |
| 검증은 실이벤트로 | Simplifier: 테스트 버튼 1개가 최단 검증 | 테스트 버튼 + 실이벤트 병행 |

## Technical Context (brownfield)
- SW `public/sw.js` 전 페이지 등록됨(root layout `SwRegister`) — push 핸들러 추가만 필요. PWA Follow-up에 "push 핸들러 추가만으로 확장 가능" 기록돼 있었음.
- 트리거 지점 실존 확인: `reserveCounselAction`/`requestCounselCancelAction`/`saveElectiveAction`/`markNoticeReadAction`(학생발), `cancelReservationAction`/`approveCancelAction`(교사발), 한마디 `targetScope all|individual`(misc.ts:172).
- 데이터 소스 재사용: `collectNudges`·`listTodayLessons`·`listPendingReportTiers`·`schoolDayCalendar`.
- 크론 미사용 상태 — `vercel.json` 또는 `next.config` crons 신설 필요(Hobby 1일 1회 제한).
- 교사 설정실 프로필에 `install-app-card` 존재 — 알림 카드 인접 배치.
- 학생 공개 페이지 = 모바일 4탭(홈/일정/시간표/기록), 알림 카드는 홈 탭.
- 학생 데이터 민감성 원칙: 공개 DTO allowlist(사유텍스트·원점수 미노출) — 알림 본문도 동일 원칙.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| 푸시 구독 | core domain | endpoint/keys, 소유(교사 ownerId 또는 학생 토큰), 종류별 토글 | 기기마다 1행, 발송 대상 결정 |
| 교사 즉시 알림(T1·T2) | core domain | 상담 신청/취소요청 | 학생 액션이 트리거 |
| 아침 브리핑(T3) | core domain | 수업 요약·넛지·신고서·일정, 수업일 7:30 | 크론이 합성 발송 |
| 학생 알림(S1~S3) | core domain | 공지/상담통지/서류리마인드, 중립 문구 | 교사 액션·크론이 트리거 |
| 발송 유틸 | supporting | web-push, best-effort, 만료 구독 정리 | 모든 알림이 경유 |
| SW push 핸들러 | supporting | 표시+딥링크 클릭 | 기존 SW 확장 |
| 설정 카드 | supporting | 권한·토글·테스트 버튼 (교사 프로필/학생 홈 탭) | 구독을 생성·수정 |
| 크론 잡 | supporting | UTC 22:30(KST 7:30), 하루 1회 | T3+S3 실행 |
| 수업일 캘린더 | external | schoolDayCalendar | 브리핑 발송 게이트 |

## Ontology Convergence
| Round | Count | New | Changed | Stable | Stability |
|-------|-------|-----|---------|--------|-----------|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 5 | 1(브리핑) | 0 | 4 | 100% |
| 3 | 7 | 2(학생 알림·구독) | 0 | 5 | 100% |
| 4 | 8 | 1(설정 토글) | 0 | 7 | 100% |
| 5~7 | 9 | 1(크론) | 0 | 8 | 100% |
| 8 | 9 | 0 | 0 | 9 | 100% (확정) |

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds + R0)</summary>

**R0 토폴로지:** 3컴포넌트(인프라/교사/학생) → "맞습니다"
**R1 교사 즉시(제안 4중 선별):** → 상담 신청 접수 + 상담 취소 요청 (선택과목·읽음확인 제외) (58%)
**R2 아침 브리핑 구성(제안 4중 선별):** → 4요소 전부 (50%)
**R3 학생 알림(제안 4중 선별):** → 새 공지 + 상담 통지 + 서류 리마인드 (아침 시간표·급식 제외) (42%)
**R4 ⚡Contrarian 설정 세분화:** 전체 on/off 제안 → 기각, "종류별 토글" (35%)
**R5 브리핑 발송 규칙:** → 수업일만 7:30 (27%)
**R6 🔪Simplifier 검증:** → 테스트 버튼 + 실이벤트 (17%)
**R7 학생 설정 위치:** → 홈 탭 카드 (10%)
**R8 종합 확인:** 6개 결정 요약 → "이대로 확정" (4.8% ✅)

**인터뷰 중 코드 검증:** 상담은 신청 즉시 확정(승인 단계 없음) → S2를 취소/취소승인 통지로 재정의.
</details>
