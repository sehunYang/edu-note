# Edu_Note — 아키텍처 & 구현 합의 계획 (Consensus Plan)

> **Status: `pending approval` (합의 통과 — Critic APPROVED)** — Planner→Architect→Critic 합의 산출물(반복 2회차). Architect: SOUND-WITH-CHANGES(F1~F11 전부 RESOLVED), Critic: **APPROVED**(CRITICAL 1+MAJOR 6 해소, 잔여 비차단 3건 폴딩). 실행(코드 작성)은 **사용자의 별도 명시 승인 후에만** 진행.
> 입력 명세서: `.omc/specs/deep-interview-edu-note.md` (모호도 4.8% PASSED)
> 모드: `--consensus --direct`, RALPLAN-DR **deliberate**(고위험: 학생 PII·공개 토큰 페이지·인증)

---

## 0. 다음 세션 이어가기 (RESUME — 2026-06-05 갱신)
- **현재 상태**: 합의 계획 APPROVED. **Phase 0 스캐폴드 + Phase 1-A 전체 스키마 작성 완료**. Next 15 빌드 통과, `tsc --noEmit` 통과, `drizzle-kit generate` → `lib/db/migrations/0000_init_full_schema.sql`(37테이블, sid정규식·report_tracking exactly-one·토큰 128bit 기본값·38 FK 포함) 생성됨. **남은 차단 = 검증 B(Supabase pg_cron)** + 실제 마이그레이션 적용은 DATABASE_URL 필요.
- **✅ `/lib/domain` 완료 (2026-06-05)**: byteCount·attendanceRules·escalation(countSchoolDays)·remainingSessions·activityPlacement·evalMethodDisplay·nudge(가중랜덤) 구현 + **Vitest 34개 테스트 그린**. types.ts로 DB enum과 분리(순수·클라공용).
- **✅ `/lib/public` 공개 페이지 보안 완료 (2026-06-05)**: 단일 `get_public_page(token)` SQL 함수(migration 0001 — 토큰→단일 student_year_id, 출결 DB 사전집계[reason/note_field 미SELECT], 성적 목업 '준비중', revoked/expired 상태마커), TS allowlist DTO + `parsePublicPagePayload`(심층방어 strict 픽커) + `summarizeAttendance`/`buildPublicPagePayload`, service-role 독점 어댑터 `get-public-page.ts`. **골든 페이로드 테스트 14건 그린**(사유텍스트·원점수·수행줄글·타학생·내부키 직렬화 부재, allowlist 외 키 미반영, 상태 404/410). 전체 테스트 48 그린, tsc 통과.
- **✅ `/lib/csv` CSV 파이프라인 완료 (2026-06-06)**: RFC4180 저수준 파서(`parseCsv` — 따옴표/콤마/줄바꿈/`""`/BOM/CRLF·CR·LF) + `parseCsvRecords`(헤더기반 레코드·1기반 행번호) + 학생명단 검증기(`parseStudentRoster` — 학번 `^[0-9]{5}$`, 학번→학년/반/번호 파생·명시컬럼 일치검증, 파일내 학번중복, 전화형식, 필수헤더 `CsvHeaderError`, **행단위 오류 리포트로 정상행 보존**, 원본 미저장). **Vitest 23개 그린**(전체 71). 순수·DB무관.
- **다음 빌드 후보**: (1) RLS 정책 + Google OAuth allowlist 미들웨어(Supabase 연결 필요 → 검증 B와 묶음), (2) ~~CSV 파이프라인(`/lib/csv`)~~ ✅완료, (3) 세특 데이터 묶음 내보내기(`/lib/setech`, 코워크), (4) `/p/[token]` 페이지 + 발급/폐기/CSV. (1) 외엔 검증 B와 독립.
- **재개 한마디**: "Edu_Note 계획으로 이어가자" → 이 파일을 읽고 이 지점부터 재개.
- **결정 1 (호스트) — ✅ Vercel Hobby 확정**: Cloudflare 탈락(사용자 실측: 장시간 524 + **Claude API 403 차단**). Render는 콜드스타트로 보류. Vercel Hobby 선택(Next 제작사). 비상업 약관 모호성은 인지·수용.
- **결정 2 (AI 세특) — ✅ 코워크 내보내기 워크플로 확정 (2026-06-05)**: **Anthropic API는 Pro 구독과 별개로 사용량 과금** → Phase 1에서 **서버사이드 Claude 호출 미사용**. 컴포넌트 C/D의 "AI 세특 자동생성"을 **데이터 묶음 내보내기(지침+관찰+수행평가→클립보드/프롬프트 번들) → Claude Code(코워크)에서 생성 → 결과 붙여넣기+바이트 카운터 검수+CSV**로 대체. 서버사이드 API 생성은 **추후 사용자가 API 과금 활성화 시 옵션 경로**로 승격(스캐폴드의 `lib/integrations/claude.ts`·`/api/health/claude` 보존). **영향**: ① **검증 A(Claude 200 OK)가 차단 게이트에서 제외**(API 미사용) ② Vercel 함수 timeout 완화책(스트리밍+1명단위)은 API 경로 활성화 시에만 유효 ③ 데이터 설계는 불변(`special_note_drafts`에 `source` 의미만 추가).
- **결정 3 (남은 실행 전 검증)**: **검증 B만 남음** — Supabase 무료 `pg_cron`+`pg_net` 가용성(서울 리전, 시간표 sync·신고서 에스컬레이션 일일 재계산용). 미가용 시 외부 무료 cron 대안(§6).
- **다음 행동**: 검증 B 확인 → Phase 1-A(부트스트랩·인증·Drizzle 전체 스키마·CSV) 빌드. 스키마 설계는 호스트/검증과 무관하므로 선작업 가능.

---

## 1. Requirements Summary
고등학교 교사 1인용 다기기 클라우드 웹앱. 공간(`~실`) 기반 UI, 공통/담임 이원화. 핵심: 학번 기반 영속 학생 모델, 강제 팝업 넛지, 5종 특기사항 Claude API 생성(바이트 규칙·상한 강제), 출결 사유×성격+신고서 추적, 시수 자동집계, 캘린더(공공API·창체4영역·ICS), 동아리, 학생별 공개 토큰 페이지. 제약: **무료티어 우선·서울 리전·Google OAuth(본인만)·서버사이드 AI·오프라인 미지원·CSV 대량입력·외부 API 읽기 전용**. 최우선 목표: **처음부터 완벽한 데이터 모델·아키텍처**(11개 컴포넌트 전부 설계, 빌드는 1·2단계).

---

## 2. RALPLAN-DR Summary

### Principles (원칙)
1. **데이터 모델 우선·전체 설계**: 11개 컴포넌트 스키마를 1차에 전부 확정(빌드는 단계적). 영속 학생 ID와 연도별 학적을 분리해 연도 간 추적을 보장. 식별·연결 상태머신은 모든 종결상태를 모델링.
2. **PII 최소노출·심층방어**: 인증 영역=RLS(`owner_id=auth.uid()`), **공개 영역=service-role + 단일 토큰해석 함수 + 사전집계 화이트리스트 DTO**(원자료 행·사유텍스트·원점수 절대 미반환). 비밀키는 서버 전용.
3. **무료티어 내 단순·관리형**: 서버리스 + 관리형 DB. 외부 호출/AI는 전부 서버에서. 배포 호스트는 상업이용 허용 무료 옵션 우선.
4. **외부 의존은 실패를 가정**: 컴시간·공공 API는 깨질 수 있으므로 실패 시 수기 fallback·명시 경고·감사로그를 1급 기능으로. 외부 데이터(학사일정) 변동이 파생 상태를 조용히 바꾸지 않도록 스냅샷·관측화.
5. **결정론적 도메인 규칙**: 출결(사유×성격)·신고서 기한(수업일 5일·3/5 에스컬레이션)·바이트 규칙·평가방식 분류·자율진로 배치·시수 잔여 계산을 **빠짐없이** 코드 상수/룰테이블로 고정(`/lib/domain`).

### Decision Drivers (상위 3)
1. **개인정보보호(PIPA) + 보안** — 학생 명렬·성적·출결·상담·의료성 사유. 데이터 국내 저장, 최소 노출.
2. **무료티어 비용 제약** — 호스팅·DB 무료, AI만 사용량 과금.
3. **유지보수성** — 1인 교사가 장기 운영. 단일 언어/프레임워크·관리형 서비스·명확한 모듈 경계.

### Viable Options (프레임워크+DB 결정)

#### Option A — Next.js(App Router) + Supabase(서울 ap-northeast-2)  ✅ 권장
**접근:** TypeScript 풀스택. Supabase Postgres(서울) + Auth(Google) + RLS, Drizzle 스키마, 서버에서 Claude·외부 API 호출, `pg_cron`+`pg_net`(가용성 확인 전제, §6 가정)로 일일 동기화.
- **Pros:** 무료티어 충족·서울 리전·Auth+RLS 내장(PII 방어)·거대 생태계(유지보수·문서·AI보조)·서버사이드 키 은닉·SSR 공개 페이지.
- **Cons:** 관리형 벤더 종속(단, Postgres 표준 스키마라 이전 비용 제한적); 무료 DB 장기 미접속 일시정지(§6 완화).

#### Option B — SvelteKit + Supabase(서울)
- **Pros:** 번들 경량.
- **Cons:** 생태계·문서·AI보조가 Next 대비 작아 **유지보수성(Driver 3)** 에서 명확히 열위. 1인 운영 학습/유지비↑.

#### Option C — Next.js + Neon(서울 인접) Postgres + Auth.js(자체 인증)
**접근:** 관리형 Postgres(Neon)지만 인증·세션·스케줄러를 직접 구성.
- **Pros:** 인증·DB 벤더를 분리해 각 레이어 교체 자유도↑(Supabase 단일 종속 회피). Neon 브랜칭으로 마이그레이션 안전.
- **Cons:** **Auth·RLS·스케줄러 자체 구현 부담**(Driver 1 보안·Driver 2 단순성 리스크↑). PII 인증을 직접 짜는 것은 1인 운영자에게 사고면적↑. 서울 리전 무료 스케줄러 옵션 빈약.

**선택: Option A.** Drivers 3개 모두 우위. B는 생태계 열위(Driver 3). C는 보안·스케줄러 자체구현 부담(Driver 1·2) — 인증을 직접 짜는 위험이 단일 벤더 종속 회피 이득을 상회. (Neon 분리 이점은 인정하나, 관리형 Auth+RLS의 PII 방어 가치가 더 큼.)

### 별도 결정 — 배포 호스트 (프레임워크 결정과 독립 축) — ✅ Vercel Hobby 확정 (2026-06-05)
공개 페이지·서버 렌더·서버사이드 Claude/외부 호출 담당. 데이터·인증·cron은 Supabase 보유.
- **Cloudflare Pages/Workers** ❌ **탈락 확정** — 사용자 실측: 장시간 동기호출 524 + **Cloudflare→Claude API 403 차단**(Anthropic 엣지 egress 차단). 기능적 사용 불가.
- **Vercel Hobby** ✅ **채택** — Next 제작사 호스트로 SSR/서버액션/서버사이드 Claude 호출 정상. 셋업 최용이. **완화: ① 함수 timeout → 긴 세특은 스트리밍+학생1명 단위 호출 ② 비상업 약관 모호성은 인지·수용**(개인 직무 보조 도구).
- **대안(보류): Render 무료 노드** — 긴 동기 호출 편하나 콜드스타트(15분 미사용→슬립). Vercel 함수 timeout이 실제 병목이 되면 재고.

---

## 3. Technical Architecture (확정안)

### 3.1 스택
| 레이어 | 선택 | 비고 |
|--------|------|------|
| 프레임워크 | **Next.js 15 (App Router) + TypeScript** | SSR 공개 페이지, 서버 액션/라우트 핸들러 |
| UI | React + Tailwind CSS + shadcn/ui | `~실` 공간 레이아웃, 단계별 페이지 분리 |
| DB | **Supabase Postgres (ap-northeast-2 서울)** | RLS, `pg_cron`, `pg_net` |
| 인증 | **Supabase Auth — Google OAuth**, 단일 이메일 allowlist | 본인 계정만 |
| ORM | Drizzle ORM (타입 안전 스키마·마이그레이션) | 스키마=단일 진실원 |
| AI 세특 | **코워크 내보내기**(Phase 1 기본): 데이터 묶음→Claude Code→결과 붙여넣기. **서버사이드 Claude API는 비활성**(추후 과금 활성화 시 옵션 경로, 키는 서버 env) | API 미사용 = 추가 과금 0 |
| 외부 | 나이스 개방포털(학사일정·급식), 컴시간알리미(시간표) | 서버 fetch, 읽기 전용 |
| 스케줄 | **Supabase pg_cron**(매일 1회 sync 함수 호출) | 가용성 §6 가정-검증 |
| 배포 | **Vercel Hobby**(Next 제작사) | §2 별도결정. 긴 세특=스트리밍+1명단위로 함수 timeout 회피 |

### 3.2 보안 설계 (PII 심층방어)
**RLS의 범위 명시:** RLS(`owner_id = auth.uid()`)는 **인증된 앱 표면만** 보호한다. 공개 `/p/[token]` 표면은 RLS를 **우회하는 service-role**로 동작하므로, **공개 표면의 유일한 보호 장치는 사전집계 화이트리스트 DTO**다. (RLS가 공개 페이지를 지킨다는 착각 금지.)

**공개 페이지 단일 진입 — 누출면 차단:**
- 공개 읽기는 **단일 함수 `get_public_page(token)`**(Postgres RPC/SQL function)만을 통한다. 이 함수가 토큰→**하나의 `student_year_id`**를 해석하고, **모든 하위 조회(출결·성적·메시지)를 그 한 id로만 필터**한다. 클라이언트가 학번/ID를 전달하는 경로는 존재하지 않는다. service-role 사용은 `/p/[token]` 모듈에 **독점**된다.
- 반환 타입은 **명시적 allowlist DTO**(컴파일타임 exhaustive 체크). 공개 응답에 들어갈 수 있는 필드는 다음으로 **한정**:
  - 공통칸: 이번주 할일(제목·일시), 교사 한마디, 시간표(요일·교시·과목명), 급식.
  - 개별칸 — **출결요약**: 성격별 **횟수 집계만**(지각 N·조퇴 N·결과 N·결석 N) + 미제출 신고서 **유무 플래그**. **`reason`(질병/생리통 등)·`note_field` 자유텍스트·원자료 행 절대 미포함.**
  - 개별칸 — **성적요약**: 과목별 **석차·등급(5등급)·성취도(A~E)** 만(평가방식에 따라 표기). **원점수(raw score)·수행 줄글·타 학생 데이터 미포함.** Phase 1에서 `grades`는 목업이므로 공개 DTO는 **목업 상태일 때 성적칸을 '준비중'으로 비활성**(목업 값도 새지 않도록).
- URL에 PII 없음, `X-Robots-Tag: noindex`, HTTPS 강제. 토큰=`gen_random_bytes(16)`(128bit). `revoked_at`/`expires_at` 지원, **재발급/폐기 + CSV 재배포**.
- ⚠ Phase 2 상담 학부모 발췌 공유 페이지(기획안)도 **동일한 `get_public_page` DTO 규율을 상속**해야 한다(나중에 비안전하게 덧붙이지 말 것).

**기타:**
- **비밀키**: `ANTHROPIC_API_KEY`·NEIS 키·컴시간 파라미터 → 서버 env only. **클라이언트 번들 시크릿 부재 CI 정적 스캔**.
- **CSV 업로드**: 서버 검증(헤더·타입·학번 `^\d{5}$`)·행 단위 오류 리포트. 원본 파일 미저장(파싱 후 폐기). 백업 내보내기 파일 자체도 PII이므로 다운로드 즉시성·미보존.
- **감사 로그** `audit_log`: 공개 페이지 접근·AI 생성·CSV 임포트·토큰 발급/폐기·**출결 에스컬레이션 티어 전이**·동기화 성공/실패.

### 3.3 데이터 모델 (전체, 1차 설계)
> 명명: snake_case. 모든 테이블 `owner_id`·`created_at`·`updated_at`. 연도 스코프 테이블 `school_year`.

**정체성(전체 종결상태 모델링):**
- `persons(id pk, owner_id, display_name)` — 영속 학생.
- `student_years(id pk, person_id fk, school_year, sid char(5), grade, class_no, number, name, phone?, parent_name?, parent_phone?, career?, ...)` — 연도별 학적. `UNIQUE(owner_id, school_year, sid)`, `sid ~ ^\d{5}$`.
- `year_links(id, new_student_year_id, candidate_person_id?, link_status enum[auto_linked | pending | new_person], reason?, resolved_at?)` — **3종 종결상태 전부 표현**: 유일매칭=`auto_linked`(candidate 연결), 동명이인=`pending`(수동 해소 큐, 작년 반/번호·진로를 candidate에서 표시), 무매칭=`new_person`(신규 `persons` 행 생성). "비움"=`new_person` 경로.

**그룹/수업:**
- `homeroom_classes(id, school_year, grade, class_no)`; `homeroom_members(homeroom_id, student_year_id)`.
- `subjects(id, name, school_year, curriculum_category enum, eval_method enum[상대절대 | 절대 | 성취3단계], jipil_mid_weight?, jipil_final_weight?, achievement_cuts jsonb?, exam_boundary_date?)` — 평가설정 nullable(추후), **`exam_boundary_date`로 '시험 전까지' 잔여시수 분모 계산**. **의미(N2): 단일 날짜 = "다가오는 시험"** — 중간 경과 후 교사가 기말 날짜로 재지정(re-point). 동시 추적이 필요해지면 2차에 `exam_periods(section_id, kind enum[mid|final], date)`로 승격.
- `performance_items(subject_id, name, weight)` — 수행평가 요소(복수).
- `course_sections(id, subject_id, label, room?, exam_boundary_date?)` — 분반별 시험경계(과목 기본값 override).
- `enrollments(section_id, student_year_id)`.
- `timetable_slots(section_id, weekday, period, room, source enum[comcigan|manual])`.
- `class_sessions(section_id, date, status enum[planned|done|not_held])` — 시수. 남은차시 = (exam_boundary까지 planned) − done. **생성 정책(N3):** 컴시간 sync 시 `오늘~exam_boundary_date` 범위의 `planned` 행을 시간표 슬롯 기준으로 생성/정리. **`done`·`not_held` 행은 절대 덮어쓰지 않음**(미래 `planned`만 add/remove). → AC §5 "변경분만 upsert"에 포함.

**기록/세특:**
- `subject_observations(student_year_id, section_id, session_id, observed_on, body, keywords text[])` — 교과 키워드 8.
- `homeroom_behavior_notes(student_year_id, noted_on, body, keywords text[])` — 행특 키워드 7.
- `performance_assessments(student_year_id, subject_id, name, score, prose)` — 수행평가(줄글).
- `creative_activity_records(area enum[자율|동아리|진로], activity_date, common_body, club_id?)` + `creative_activity_student_overrides(record_id, student_year_id, body)`.
- `class_roles(student_year_id, role_name, role_desc, service_time_flag bool)` — 학급역할(개별봉사, 시간 미추적).
- `student_activity_entries(student_year_id, tag enum[자율|진로|both], placement enum[자율|진로]?, body)` — `both`일 때 생성 시 배치 surface를 `placement`에 1곳으로 확정(규칙 §3.4).
- `student_extra_notes(student_year_id, subject_id?, body)`.
- `special_note_drafts(student_year_id, type enum[자율|동아리|진로|교과세특|행동발달], subject_id?, content, byte_count, byte_limit, status enum[draft|editing|finalized], source enum[cowork|api], model?, generated_at)` — **`source=cowork`(기본)**: 코워크에서 생성된 텍스트를 교사가 붙여넣어 저장(`model`=null 또는 수동 메모). `source=api`: 추후 서버 Claude 생성 시. 바이트 카운터·상한은 source 무관 동일 강제.

**출결:**
- `attendance_records(student_year_id, date, reason enum[질병|인정|미인정|기타], kind enum[지각|조퇴|결과|결석], report_required bool(파생저장), report_submitted bool, note_field text?)`.
- `report_tracking(id pk, attendance_record_id?, field_trip_id? fk→field_trip_reports.id, deadline_date date(파생), last_tier enum[정상|위험|심각], last_computed_at)` — **에스컬레이션 스냅샷 영속**(일일 pg_cron 재계산, 티어 전이는 `audit_log`). 마감 계산은 수업일 캘린더 기반 파생이되 **티어 상태는 영속·관측·알림 가능**. **`CHECK (num_nonnulls(attendance_record_id, field_trip_id) = 1)`** — 한 추적행은 출결 또는 교외체험 중 정확히 하나만 가리킴. (N1)
- `field_trip_reports(id pk, student_year_id, trip_date, post_report_submitted bool)` — 사후보고서만 추적(신청서 추적 안 함). **에스컬레이션 적용:** 사후보고서도 출결 신고서와 **동일한 수업일 5일·3/5 티어** 규칙을 적용(기준일=`trip_date`). 따라서 `report_tracking`의 field_trip 행도 동일 분모로 일일 재계산. (Critic 잔여3)

**기타:**
- `clubs(id, name)`; `club_members(club_id, student_year_id, desired_career)`.
- `counseling_logs(student_year_id, date, target enum[학생|학부모], body)` — AI분석 컬럼은 추후(목업 UI).
- `tasks(title, deadline, progress)`; `budgets(area, planned_amount)` + `budget_expenses(budget_id, date, amount, memo)`.
- `calendar_events(date, source enum[neis|manual|personal|task], cca_area enum[자율|동아리|진로|봉사]?, title)`.
- `school_day_calendar(date, is_school_day bool)` — 공휴일·주말 제외 수업일 산정(신고서 기한·잔여시수의 단일 진실원). NEIS/수동 보정.
- `grades(student_year_id, subject_id, rank?, grade_5?, achievement?)` — **Phase1 목업**(스키마만).
- `public_pages(student_year_id, token, common_payload jsonb?, teacher_message text?, revoked_at?, expires_at?)`.
- `teacher_profile`; `setup_state(feature, completed_at)` — 초기세팅 게이트.
- `meal_cache(date, payload)`; `audit_log(event_type, ref, detail jsonb, at)`.

**세특 작성 지침 저장:** 1차는 **레포 자산 파일**(`/content/세특 작성 지침.md`, 버전관리). 교사 튜닝 요구가 생기면 `style_guides(version, body)` 테이블로 승격(2차 결정 포인트).

### 3.4 도메인 규칙 (코드 상수 — `/lib/domain`, 빠짐없이)
- **byteCount**: `한글3 / 영숫특공백1 / 줄바꿈2`. 상한: 자율3000·동아리3000·진로4200·교과세특3000·행동발달3000.
- **attendanceRules**: 신고서 필요 = 결석 항상; 조퇴·지각·결과 = `reason∈{인정}` **또는** 사유에 '생리통' 포함 시(룰테이블 키워드, 문자열 하드코딩 대신 `report_required_reasons` 상수). 교외체험 = 사후보고서.
- **escalation**: 미제출 경과 수업일 `≤3 정상 / >3 위험 / >5 심각(상시)`. 수업일은 `school_day_calendar` 기반.
- **nudgeEngine**: ①미기록 수업(2명: 가중랜덤[기록 최소 우선]+직접) ②16시후 행특 ③동아리 활동일 −7d부터 미작성 ④미제출 신고서.
- **evalMethodDisplay**: `eval_method`→표기 항목(석차등급 산출 여부). 2022 개정 과목 프리셋 시드 + 개별작성.
- **activityPlacement**(신규): `student_activity_entries.tag=both`이면 생성 시 **자율 우선 배치**(기본 정책, 변경 가능 상수) → `placement` 1곳 확정. 한 항목이 양쪽 세특에 중복 투입되지 않음.
- **remainingSessions**(신규): 남은차시 = `count(class_sessions where date ≤ exam_boundary and status=planned)` − `count(done)`; `not_held`는 done/planned에서 제외해 별도 집계. **경계 해석 = `COALESCE(section.exam_boundary_date, subject.exam_boundary_date)`**(분반 override 우선, 과목 기본값 fallback).

### 3.5 모듈/디렉터리 (경계)
```
/app             (~실: setup, classroom, staffroom, stats, print, today, homeroom, counsel, notice, club, /p/[token] 공개)
/lib/domain      (순수 규칙: byteCount, attendanceRules, escalation, nudgeEngine, evalMethodDisplay, activityPlacement, remainingSessions, yearLink)
/lib/db          (drizzle schema, migrations, queries) — get_public_page RPC 정의 포함
/lib/integrations(neis, comcigan — 서버 전용; claude는 추후 API 경로용 보존·비활성)
/lib/setech       (세특 데이터 묶음 어셈블러: 지침+관찰+수행평가+진로 → 코워크 프롬프트 번들 + 붙여넣기 검수)
/lib/csv         (parsers + validators per entity)
/lib/public      (공개 페이지 전용 service-role 어댑터 + allowlist DTO) — service-role 독점 사용 지점
/server          (route handlers, server actions, pg_cron sync, backup export)
/content         (세특 작성 지침.md)
```

---

## 4. Build Phases & Dependencies
**데이터 모델/스키마: Phase 1에 11개 컴포넌트 전체 마이그레이션 생성.**

- **Phase 1 (코어 빌드):**
  1. A: Next+Supabase 부트스트랩, Google OAuth(allowlist), RLS, Drizzle **전체** 스키마 마이그레이션, `school_day_calendar`, 초기세팅 게이트, CSV 파이프라인(학생/수업명단), **주간 백업 내보내기**, 클라 시크릿 스캔 CI.
  2. B: 과목·분반·수강·시간표(컴시간 sync+fallback)·시수(`class_sessions`·미진행·잔여계산)·평가설정·과목 프리셋 시드·`exam_boundary`.
  3. E: 캘린더(NEIS 학사일정 fetch·수동/개인·창체4영역·ICS import).
  4. C: 강제 팝업 넛지엔진, 교과 관찰(2명), 행특(16시), 바이트 카운터, 지침.md 로더, **세특 데이터 묶음 내보내기(코워크 프롬프트 번들)+결과 붙여넣기 검수**(서버 Claude 호출 아님), CSV 입출력, activityPlacement.
  5. F: 출결(사유×성격·날짜/학생 전환), `report_tracking` 스냅샷·에스컬레이션(pg_cron 재계산), 교외체험 사후보고서.
  6. K-1: 오늘의 학교 통합 넛지 대시보드.
- **Phase 2 (빌드):** D 동아리(세특 구조 재사용) → G 상담(AI 목업) → H 업무·예산 → K-2 통계실(성적 목업)·인쇄실(선택 PDF) → I 공지실+공개 토큰 페이지(`get_public_page` DTO).

의존성: A → (B,E) → C(B,E 필요) → F(B·school_day 필요) → K-1(전부 집계). Phase2: D는 E·C, I는 E·F·K + `/lib/public` DTO에 의존.

---

## 5. Acceptance Criteria (명세서 §5 상속 + 보안/아키텍처 추가)
명세서 AC-A~AC-J 전부 상속. 추가:
- [ ] 비로그인/타 Google 계정 접근 시 모든 도메인 라우트 차단(RLS+미들웨어).
- [ ] 클라이언트 번들 정적 스캔에 `ANTHROPIC_API_KEY`·NEIS·컴시간 시크릿 미포함(CI 게이트).
- [ ] 공개 `/p/[token]` 은 `get_public_page`만 사용하고, 응답에 **타 학생 데이터·`reason`/`note_field` 자유텍스트·원점수·원자료 행이 전혀 없다**(골든 페이로드 테스트로 단언). 폐기/만료 토큰은 404/410, `noindex` 헤더 존재.
- [ ] 공개 출결요약은 성격별 **횟수 집계 + 신고서 미제출 유무**만 포함한다.
- [ ] 목업 상태의 `grades`는 공개 페이지 성적칸에 '준비중'으로 표시되고 어떤 값도 직렬화되지 않는다.
- [ ] `year_links`가 3종 종결상태(`auto_linked`/`pending`/`new_person`)를 모두 표현하고, 무매칭은 신규 `persons` 행을 만든다.
- [ ] `report_tracking` 티어가 일일 pg_cron으로 재계산·영속되고, 티어 전이가 `audit_log`에 기록된다(학사일정 소급 변경에도 전이 이력 보존).
- [ ] `pg_cron` 일일 작업이 컴시간 sync를 호출해 변경분만 upsert; 실패 시 `audit_log` + 캘린더 경고; "마지막 성공 동기화" 배지 노출.
- [ ] Drizzle 마이그레이션이 11개 컴포넌트 테이블을 1회 적용으로 생성(빈 DB→full schema).
- [ ] `남은차시` = planned(≤exam_boundary) − done 으로 계산되고 `not_held`는 분모에서 제외된다.
- [ ] 바이트 카운터·attendanceRules·activityPlacement·remainingSessions 단위테스트 통과.

---

## 6. Risks & Mitigations
| 리스크 | 영향 | 완화 |
|--------|------|------|
| 컴시간 비공식 API 변경/차단 | 시간표·시수·팝업 마비 | 어댑터 격리, 실패 시 수기 fallback + 경고 + 감사로그, sync는 비차단 best-effort, 마지막 성공 동기화 배지 |
| 공개 토큰 링크 유출 | 본인 PII 노출 | 128bit·noindex·폐기/만료·감사로그, **사전집계 DTO(사유텍스트·원점수·타인 데이터 불포함)**, 단일 `get_public_page` |
| 출결 의료성 사유(생리통) 공개 노출 | 민감 PII | 공개 출결요약=횟수만, `reason`/`note_field` DTO 제외 + 골든 페이로드 테스트 |
| 학사일정 소급 변경이 에스컬레이션을 조용히 변경 | 신고서 상태 오류 | `report_tracking` 티어 스냅샷 영속 + 전이 감사로그(파생은 마감일에 한정) |
| 무료 DB 7일 미접속 일시정지 | 접속 실패 | **주간 백업 내보내기(1차 포함)** 가 1차 안전망; 수동 unpause 런북; pg_cron-keepalive는 best-effort로만 간주(자기부활 불가 인지) |
| Claude API 비용/장애 | 세특 생성 실패 | 서버 타임아웃·재시도·부분결과 저장, 비용은 사용자 수용 |
| 이름 기반 연도 매핑 오류 | 기록 오연결 | `pending` 큐 + 작년 반/번호·진로 표시 후 수동 확정, 자동연결은 유일매칭만, 무매칭은 신규 person |
| PII가 클라 상태로 과다 노출 | 유출면↑ | 서버 컴포넌트 우선, 민감 목록 서버 페이지네이션, 공개 라우트 `/lib/public` 격리 |

**가정 — 실행 전 검증 필요(assumptions-to-verify):**
- Supabase 무료 플랜 ap-northeast-2에서 `pg_cron`+`pg_net` 가용 여부(미가용 시 대안: 외부 무료 cron→서버 sync 엔드포인트 호출).
- Cloudflare Pages가 선택 Next 기능(서버 액션/노드 런타임)을 충분 지원하는지(미흡 시 Fly.io 상시가동 노드).

---

## 7. Pre-mortem (3 실패 시나리오 — deliberate)
1. **"공개 페이지에서 성적/의료 사유가 새어나갔다."** — 원인: 출결 '요약'이 원자료 행(`reason`/`note_field`)을 직렬화, 또는 하위 조회가 잘못된 scope. **예방:** 단일 `get_public_page` 토큰 해석 + 사전집계 DTO + **골든 페이로드 테스트**(타 학번 차단 + 본인 페이로드에 사유텍스트·원점수 부재 단언) + service-role을 `/lib/public`에 독점.
2. **"시간표/에스컬레이션이 조용히 망가져 한 학기 내내 틀렸다."** — 원인: 외부 변동을 best-effort가 삼킴/파생 상태 소급 변동. **예방:** sync·티어 전이를 `audit_log`+캘린더 경고로 관측화, 마지막 성공 동기화 배지, `report_tracking` 스냅샷 영속, 미수신 N일 연속 강한 경고.
3. **"무료티어 한계로 데이터 손실/정지."** — 원인: DB 일시정지·용량초과·호스트 약관. **예방:** **주간 CSV/JSON 백업(1차 포함)**, 용량 모니터링, 셀프호스팅 마이그레이션 런북, 상업이용 허용 Cloudflare Pages 채택.

## 8. Expanded Test Plan (deliberate)
- **Unit**: byteCount(경계·혼합), attendanceRules(신고서 필요·생리통·교외체험), escalation 수업일 계산(공휴일/주말 제외), evalMethodDisplay 분류→표기, activityPlacement(both→1곳), remainingSessions(planned−done, not_held 제외), 가중랜덤 분포(최소 우선), 학번 정규식.
- **Integration**: CSV 임포트(정상/오류행), Drizzle 마이그레이션 빈DB 적용, year_links 3상태(유일/동명이인/무매칭→신규person), Claude 모킹→초안 byte_limit 강제, pg_cron sync upsert+실패 경로, report_tracking 일일 재계산+전이 audit.
- **E2E**: 비인가 차단, 초기세팅 게이트(잠금→활성), 강제 팝업 미해제, 공개 `/p/[token]` **골든 페이로드**(본인 데이터만·사유텍스트/원점수/타인 부재·목업성적 '준비중'·폐기 토큰 404·noindex), 출결 날짜/학생 전환.
- **Observability**: `audit_log`(공개접근·AI생성·임포트·토큰발급/폐기·티어전이·sync), 마지막 성공 동기화 지표+캘린더 경고, 클라 번들 시크릿 부재 CI, 주간 백업 내보내기 동작.
- **공개 페이로드 방어 테스트(보강)**: `common_payload` jsonb에 예기치 않은 키를 써넣어도 `get_public_page` 읽기 DTO가 **allowlist 외 키를 절대 반영하지 않음**을 단언(부주의한 writer가 미래 DTO 변경으로 노출되는 것 방지). (Critic 잔여2)

---

## 9. Verification Steps
1. `drizzle migrate` 빈 DB→전체(11컴포넌트) 스키마 생성.
2. 단위/통합/E2E 그린(특히 공개 골든 페이로드·year_links 3상태·report_tracking 전이).
3. 클라 번들 시크릿 스캔 CI 통과.
4. 공개 페이지 침투 점검(타 토큰·폐기·색인·사유텍스트/원점수 부재) 통과.
5. 컴시간 sync dry-run + 실패 주입 시 경고/감사로그/배지 확인.
6. 주간 백업 내보내기 산출물 검증(대상 테이블·PII 처리).
7. Phase 1 수용기준 AC-A/B/C/E/F/K-1 데모.

---

## 10. ADR (Architecture Decision Record)
- **Decision**: Next.js(App Router)+TypeScript + Supabase(서울, Auth/RLS/pg_cron) + Drizzle + 서버사이드 Claude, **배포는 Vercel Hobby**(2026-06-05 확정). 공개 페이지는 단일 `get_public_page` + 사전집계 화이트리스트 DTO. 11개 컴포넌트 데이터 모델 1차 전체 설계, 빌드는 1·2단계.
- **Drivers**: PIPA·PII 보안 / 무료티어 비용 / 1인 유지보수성.
- **Alternatives considered**: (B) SvelteKit — 생태계 열위로 탈락. (C) Next+Neon+Auth.js — 인증/스케줄러 자체구현 보안·단순성 부담으로 탈락(분리 이점 < 관리형 Auth 가치). 배포: **Cloudflare Pages — 실측 Claude API 403 차단으로 탈락**; Render 무료 — 콜드스타트로 보류; **Vercel Hobby 채택**(비상업 약관 리스크는 인지·수용, 함수 timeout은 스트리밍+1명단위로 완화).
- **Why chosen**: 세 드라이버 모두 동시 충족하는 유일 조합. 관리형 Auth+RLS가 PII 방어를, 무료티어가 비용을, Next 생태계가 유지보수성을 만족.
- **Consequences**: 관리형 벤더 종속(표준 Postgres라 완화), 무료티어 운영 한계(백업·런북으로 완화), 공개 표면 보안이 DTO 규율에 전적 의존(테스트·격리로 강제).
- **Follow-ups**: pg_cron/Cloudflare 가용성 실행 전 검증(§6 가정); 성적 import 형식·AI 상담분석·학부모 발췌 공유는 2차(공개 DTO 규율 상속); 스타일가이드 DB 승격 여부 2차 결정.

## 11. Changelog (반복 2회차 — Architect/Critic 반영)
- **[BLOCKING 해소]** 공개 출결/성적 페이로드를 사전집계(횟수·등급)로 한정, `reason`/`note_field`/원점수/원자료행/타인 데이터 금지(§3.2, AC, 테스트). (Critic C1, Architect F1/F2)
- **[BLOCKING 해소]** 골든 페이로드 테스트(본인 페이로드 형태 단언) 추가(§8 E2E/Integration). (Critic M2)
- **[BLOCKING 해소]** 단일 `get_public_page(token)` 토큰해석 함수 + service-role `/lib/public` 독점(§3.2/§3.5). (Critic M1, Architect F1)
- **[BLOCKING 해소]** `year_links` 3종 종결상태(auto/pending/new_person) 모델링(§3.3). (Critic M4, Architect F7)
- **[반영]** `report_tracking` 티어 스냅샷 영속 + 전이 감사로그 + 일일 재계산(§3.3/3.4). (Architect F3, Critic M3)
- **[반영]** `activityPlacement`·`remainingSessions`·`exam_boundary_date` 추가로 Principle #5 일관성 회복(§3.3/3.4). (Critic M5, Architect F8/F10)
- **[반영]** Supabase pause 완화를 주간 백업으로 교체, pg_cron-keepalive는 best-effort 명시(§6). (Critic M7, Architect F5)
- **[반영]** 배포 호스트를 독립 결정축으로 분리, Cloudflare Pages 채택, Option C 보강(§2). (Critic M6, Architect F4/안티테제)
- **[반영]** RLS는 인증 표면만 보호·공개 표면은 DTO가 유일 보호라고 명시(§3.2). (Architect F6)
- **[반영]** 스타일가이드 저장 위치(레포 자산, 승격 경로), 상담 발췌 페이지 DTO 상속 명시(§3.3/3.2). (Architect F9/F11)
- **[가정 명시]** pg_cron 가용성·Cloudflare 적합성·Vercel 약관을 실행 전 검증 항목으로 분리(§6).
- **[N1 반영]** `report_tracking` exactly-one CHECK + `field_trip_reports.id pk` 명시(§3.3). (Architect 재검토 N1)
- **[N2 반영]** `exam_boundary_date`="다가오는 시험" 단일날짜 재지정 의미 명문화, 동시추적 시 `exam_periods` 승격(§3.3). (N2)
- **[N3 반영]** `class_sessions` `planned` 행 생성/정리 정책(오늘~경계, done/not_held 불변) 명시(§3.3). (N3)
- **[Critic 잔여 폴딩]** remainingSessions 경계=`COALESCE(section, subject)`(§3.4); 교외체험 사후보고서도 동일 5일·티어 적용(§3.3); 공개 `common_payload` allowlist 외 키 미반영 테스트(§8). → Critic **APPROVED**.
- **[2026-06-05 호스트 확정]** 배포 = **Vercel Hobby**(Cloudflare는 Claude API 403 차단으로 탈락). §0·§2·§3.1·§10 반영.
- **[2026-06-05 AI 세특 = 코워크 내보내기 확정]** Anthropic API가 Pro 구독과 별개 과금이므로 Phase 1은 **서버사이드 Claude 호출 미사용**. C/D의 AI 생성을 **데이터 묶음 내보내기→Claude Code(코워크) 생성→붙여넣기+바이트검수+CSV**로 대체. 서버 API 경로는 추후 옵션으로 보존. **검증 A(Claude 200 OK) 게이트 제외**, 검증 B(pg_cron)만 잔존. `special_note_drafts.source enum[cowork|api]` 추가, `/lib/setech` 모듈 신설. §0·§3.1·§3.3·§3.5·§4 반영. AC-C는 "Claude API 서버 호출" → "코워크 번들 내보내기/붙여넣기 검수"로 의미 갱신(테스트 가능 기준 동일: 바이트 규칙·상한 강제·CSV 출력).
