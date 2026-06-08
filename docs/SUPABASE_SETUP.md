# Supabase(서울) 설정 가이드 — 초보자용 단계별

> 개발 지식이 적어도 따라 할 수 있게 화면 순서대로 적었습니다.
> 막히면 그 단계 번호를 알려주세요. 도중에 나오는 **비밀번호·연결문자열은 절대 외부에
> 공유하지 마세요**(이 파일에도 적지 마세요).

목표: ① 서울 리전 DB 생성 → ② pg_cron 가용성 확인(검증 B) → ③ 연결문자열 받기 →
④ 우리 앱에 연결 → ⑤ 표 37개 만들기(마이그레이션).

---

## 1단계. 계정 + 프로젝트 만들기 (서울 리전)

1. <https://supabase.com> 접속 → **Start your project** → GitHub 또는 이메일로 가입.
2. 로그인 후 **New project** 클릭.
3. 입력:
   - **Name**: `edu-note` (아무 이름이나 가능)
   - **Database Password**: **Generate a password** 눌러 강한 비밀번호 생성 →
     **이 비밀번호를 메모장 등에 안전하게 저장**하세요. (나중에 연결문자열에 들어갑니다.)
   - **Region**: **Northeast Asia (Seoul)** 를 꼭 선택 (= `ap-northeast-2`, 한국 데이터 저장).
   - **Plan**: Free.
4. **Create new project** → 2~3분 기다리면 준비됩니다.

---

## 2단계. 검증 B — pg_cron / pg_net 가용성 확인 ★

우리 앱은 매일 1번 자동 동기화(컴시간 시간표·신고서 기한 재계산)에 `pg_cron`을 씁니다.
무료 플랜에서 되는지 확인합니다.

1. 왼쪽 메뉴 **SQL Editor** → **New query**.
2. 아래를 붙여넣고 오른쪽 아래 **Run**:
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select * from cron.job;
   ```
3. **에러 없이** 빈 표(또는 결과 0행)가 나오면 **가용 = 통과 ✅**.
   - 만약 권한 에러가 나면: 왼쪽 **Database → Extensions** 에서 `pg_cron`, `pg_net` 을
     검색해 토글을 **ON** 한 뒤 2번을 다시 실행.
   - 그래도 안 되면 무료 플랜 제한입니다. 대안(외부 무료 cron)이 있으니 알려주세요.

---

## 3단계. 연결문자열(DATABASE_URL) 받기

1. 화면 상단(또는 프로젝트 홈)의 **Connect** 버튼 클릭.
2. **Connection string → URI** 탭에서, **Session pooler** 라고 표시된 것을 고릅니다.
   - (이게 집/회사 인터넷(IPv4)에서도 잘 붙고, 마이그레이션·개발에 안전합니다.)
   - 형태 예시:
     `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`
3. 복사한 뒤 `[YOUR-PASSWORD]` 부분을 **1단계에서 저장한 비밀번호**로 바꿉니다.

> 참고: 나중에 Vercel 배포(실서버)에는 **Transaction pooler(6543)** 문자열을 씁니다.
> 지금 마이그레이션·로컬 개발은 위의 **Session pooler(5432)** 하나면 충분합니다.

---

## 4단계. 앱에 연결 (.env.local 만들기)

1. 프로젝트 폴더(`Edu_Note`) 안에 **`.env.local`** 이라는 파일을 새로 만듭니다.
   (옆에 있는 `.env.example` 을 복사해서 이름만 `.env.local` 로 바꿔도 됩니다.)
2. 최소 이 한 줄을 넣습니다(3단계에서 만든 문자열):
   ```
   DATABASE_URL=postgresql://postgres.xxxx:실제비번@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
   ```
3. 로그인 허용 이메일과(나중 인증 빌드용) Supabase API 키도 함께 넣어두면 좋습니다.
   값은 **Project Settings → API** 와 **Database** 에서 복사:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        (Project Settings → API → anon public)
   SUPABASE_SERVICE_ROLE_KEY=eyJ...            (같은 화면 service_role — 서버 전용 비밀!)
   ALLOWED_EMAIL=sehun2488@gmail.com
   ```
4. `.env.local` 은 비밀이므로 **절대 깃/외부에 올리지 마세요**(기본적으로 무시되도록 되어 있음).

---

## 5단계. 표 37개 만들기 (마이그레이션 적용)

방법 A — 터미널(권장):
```powershell
npm run db:migrate
```
성공하면 11개 컴포넌트의 **37개 표**가 한 번에 생성됩니다.

방법 B — 터미널이 어려우면 SQL Editor 붙여넣기:
1. `lib/db/migrations/0000_init_full_schema.sql` 파일 내용을 전부 복사 → SQL Editor에 붙여넣고 Run.
2. 이어서 `lib/db/migrations/0001_get_public_page.sql` 도 같은 방법으로 Run.

확인: 왼쪽 **Table Editor** 에 `persons`, `student_years`, `attendance_records` …
같은 표들이 보이면 성공 ✅.

---

## 6단계. (나중) Google 로그인 + RLS

이건 인증 빌드(Phase 1-A) 때 함께 진행합니다. 미리 알아둘 것만:
- **Authentication → Providers → Google** 을 켜고, Google Cloud Console에서 OAuth 동의화면 +
  클라이언트 ID/비밀을 발급받아 넣습니다.
- 로그인은 **본인 이메일(`ALLOWED_EMAIL`)** 만 허용하도록 미들웨어로 제한합니다.
- RLS(행 보안) 정책으로 `owner_id = 본인` 데이터만 접근하도록 잠급니다.
- 준비되면 같이 단계별로 도와드리겠습니다.

---

## 막히면 / 다음 행동

- **2단계(pg_cron) 결과**와 **5단계(마이그레이션) 성공 여부**만 알려주셔도 충분합니다.
- `DATABASE_URL` 을 `.env.local` 에 넣으신 뒤 원하시면, 제가 `npm run db:migrate` 실행과
  검증 B 결과 확인까지 대신 진행해 드릴 수 있습니다(비밀번호 자체는 알려주지 않으셔도 됨 —
  `.env.local` 에만 있으면 됩니다).
