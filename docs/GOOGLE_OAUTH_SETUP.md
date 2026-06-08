# Google 로그인(OAuth) 설정 가이드 — 초보자용 단계별

> 목표: **본인 Google 계정으로만** Edu_Note에 로그인되게 만들기.
> 당신이 할 일은 **두 군데(Google Cloud Console + Supabase 대시보드)에 값 입력**뿐입니다.
> 코드(미들웨어·로그인 버튼·서버액션 연결)는 제가 만들어 둘게요.
>
> ⚠ 중간에 나오는 **Client Secret(클라이언트 비밀)은 비밀번호처럼** 다루세요. 외부 공유 금지.
> 이 파일에도 적지 마세요(`.env.local`에만).

당신 프로젝트 고정값 (그대로 복사해서 쓰면 됩니다):

- **Supabase 콜백 URL**:
  `https://ntdvgneiqzeopmlevuwj.supabase.co/auth/v1/callback`
- **허용 로그인 이메일**: `sehun2488@gmail.com` (이 계정만 로그인 허용)

---

## A. Google Cloud Console — OAuth 클라이언트 발급

### A-1. 프로젝트 만들기
1. <https://console.cloud.google.com> 접속 (Google 로그인).
2. 상단 좌측 프로젝트 선택 → **새 프로젝트** → 이름 `edu-note` → **만들기**.
3. 만든 프로젝트가 선택됐는지 상단에서 확인.

### A-2. OAuth 동의 화면 (Consent screen)
1. 왼쪽 메뉴 ☰ → **API 및 서비스 → OAuth 동의 화면**.
2. **User Type: External(외부)** 선택 → **만들기**.
3. 앱 정보 입력:
   - 앱 이름: `Edu_Note`
   - 사용자 지원 이메일: 본인 이메일
   - 개발자 연락처 이메일: 본인 이메일
   - 나머지는 비워도 됨 → **저장 후 계속**.
4. **범위(Scopes)**: 아무것도 추가하지 말고 **저장 후 계속** (기본 email·profile로 충분).
5. **테스트 사용자(Test users)**: **+ ADD USERS** → 본인 이메일(`sehun2488@gmail.com`) 추가 → **저장 후 계속**.
   - 💡 **여기서 멈추세요. "게시(Publish)" 하지 마세요.**
     혼자 쓰는 도구라 **테스트 모드 그대로**가 가장 안전·간단합니다(구글 심사 불필요).
     테스트 사용자로 등록된 본인만 로그인됩니다.

### A-3. OAuth 클라이언트 ID 만들기
1. 왼쪽 메뉴 → **API 및 서비스 → 사용자 인증 정보(Credentials)**.
2. 상단 **+ 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**.
3. **애플리케이션 유형: 웹 애플리케이션**.
4. 이름: `edu-note-web` (아무거나).
5. **승인된 JavaScript 원본(Authorized JavaScript origins)** — **+ URI 추가**:
   - `http://localhost:3000`
   - (나중에 Vercel 배포하면 `https://<당신앱>.vercel.app` 도 추가)
6. **승인된 리디렉션 URI(Authorized redirect URIs)** — **+ URI 추가** (★ 가장 중요):
   - `https://ntdvgneiqzeopmlevuwj.supabase.co/auth/v1/callback`
7. **만들기** → 팝업에 **클라이언트 ID**와 **클라이언트 비밀(Client Secret)** 이 나옵니다.
   **두 값을 복사해 안전한 곳에 저장**하세요. (다음 B 단계에서 씁니다.)

---

## B. Supabase 대시보드 — Google 공급자 켜기

1. <https://supabase.com> → 내 프로젝트(edu-note) → 왼쪽 **Authentication**.
2. **Sign In / Providers**(또는 **Providers**) → 목록에서 **Google** 클릭.
3. **Enable Sign in with Google** 토글 **ON**.
4. 입력:
   - **Client ID (for OAuth)**: A-3에서 받은 클라이언트 ID 붙여넣기
   - **Client Secret (for OAuth)**: A-3에서 받은 클라이언트 비밀 붙여넣기
5. (화면에 보이는 **Callback URL**이 위 A-3의 리디렉션 URI와 같은지 확인 —
   `...supabase.co/auth/v1/callback`)
6. **Save**.

### B-2. 로그인 후 돌아올 주소 설정
1. **Authentication → URL Configuration**.
2. **Site URL**: `http://localhost:3000` (개발용. 나중에 배포하면 Vercel 주소로 변경)
3. **Redirect URLs** → **Add URL**:
   - `http://localhost:3000/**`
   - (나중에 `https://<당신앱>.vercel.app/**` 추가)
4. **Save**.

---

## C. 그다음 (제가 코드로 처리할 부분)

당신이 A·B를 마치면, 아래는 제가 만들어 연결합니다 — 직접 하실 것 없습니다:

- `@supabase/ssr` 설치, 서버/클라이언트 Supabase 클라이언트 (`lib/supabase/…`)
- **미들웨어**: 로그인 안 했거나 **허용 이메일이 아니면 모든 화면 차단** (`ALLOWED_EMAIL`)
- **로그인/로그아웃** 버튼 + `/auth/callback` 처리
- 서버액션이 **로그인한 본인 ID(ownerId)** 로 데이터를 저장하도록 쿼리계층과 연결
  → 그러면 CSV 학생명단 업로드·공개페이지 토큰 발급이 실제 화면에서 동작합니다.

`.env.local`에는 이미 필요한 값(`NEXT_PUBLIC_SUPABASE_URL`, `…ANON_KEY`, `ALLOWED_EMAIL`)이
들어가 있어 추가 입력은 없습니다.

---

## 막히면 / 다음 행동

- A·B를 끝내고 **"구글 로그인 설정 끝"** 이라고만 알려주세요. 그러면 제가 C(코드)를 진행합니다.
- 중간에 화면 문구가 가이드와 다르거나 에러가 나면, 그 화면을 캡처하듯 글로 알려주세요.
- 클라이언트 ID/비밀은 **저에게 알려줄 필요 없습니다** — Supabase 대시보드(B단계)에만 넣으면 됩니다.
  (앱은 Supabase를 통해 로그인하므로 이 두 값이 코드/`.env.local`에 들어가지 않습니다.)
