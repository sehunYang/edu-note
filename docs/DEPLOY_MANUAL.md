# Edu_Note 배포 매뉴얼 (사용자 직접 진행 체크리스트)

> 목표: 집 메인 컴퓨터를 켜두지 않고, **어디서든 본인 구글 계정으로** 접속. **무과금**(Vercel Hobby + Supabase 무료).
> 구조: DB·인증(Supabase)은 **이미 클라우드(서울)**. 이 매뉴얼은 **웹앱(Next.js)을 Vercel에 올리는 마지막 단계**.

---

## ✅ 이미 끝난 것 (Claude가 처리)
- [x] git 저장소 초기화 + 초기 커밋 (`main` 브랜치, 177파일)
- [x] 비밀키(`.env.local`·`.env.production`) git 미추적 확인 — `.gitignore` 보호
- [x] 라이브 Supabase(서울, ref `ntdvgneiqzeopmlevuwj`)에 마이그레이션 0001~0008 적용 완료
- [x] `tsc`·`build`·단위124·실DB통합13·시크릿스캔0 통과

## ⏳ 내가 직접 해야 하는 것 (아래 순서대로)

---

### 1단계 · GitHub 저장소 만들고 푸시

**방법 B (gh CLI) — 선택함**
```powershell
# (gh 설치가 끝났다고 가정. 안 됐으면: winget install --id GitHub.cli -e)
gh auth login          # 브라우저로 GitHub 로그인 (HTTPS, 기본값 따라가면 됨)
gh repo create edu-note --private --source . --push
```
> Claude Code 입력창에서 실행하려면 앞에 `!` 를 붙이세요: `! gh auth login`

**방법 A (웹, 대안)**
1. github.com → New repository → 이름 `edu-note`, **Private**, 다른 항목 추가 안 함 → Create
2. ```powershell
   git remote add origin https://github.com/<본인ID>/edu-note.git
   git push -u origin main   # Git Credential Manager가 브라우저 로그인 띄움
   ```

- [ ] GitHub에 `edu-note` 비공개 저장소 생성됨
- [ ] `git push` 완료 (코드가 GitHub에 올라감)

---

### 2단계 · Vercel 연결 (웹, CLI 불필요)
1. https://vercel.com → **GitHub 계정으로 로그인**(무료)
2. **Add New → Project → `edu-note` 저장소 Import**
3. Framework: **Next.js** 자동 감지 → 빌드 설정 그대로 (Build Command/Output 손대지 말 것)

- [ ] Vercel에 프로젝트 Import됨

---

### 3단계 · 환경변수 등록
Vercel 프로젝트 → **Settings → Environment Variables** → 아래 7개 입력
(값은 로컬 `.env.local`에서 그대로 복사. Environment는 Production·Preview·Development 모두 체크)

| 변수 이름 | 비고 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 클라이언트 노출 OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트 노출 OK |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ **서버 전용 — 절대 `NEXT_PUBLIC_` 붙이지 말 것** |
| `DATABASE_URL` | 서버 전용 |
| `ALLOWED_EMAIL` | 로그인 허용 단일 계정(본인 이메일) |
| `NEIS_API_KEY` | 학사일정·급식용 |
| `ANTHROPIC_API_KEY` | 현재 미사용이나 넣어둬도 무방 |

- [ ] 7개 변수 모두 등록 (특히 service_role에 NEXT_PUBLIC 안 붙였는지 재확인)

---

### 4단계 · 인증 콜백 URL 추가 ⚠️ (이거 안 하면 배포본에서 로그인 안 됨)
배포 주소를 `https://edu-note.vercel.app` 라고 가정 (실제 주소로 바꿔서).

**Supabase 대시보드** → Authentication → URL Configuration
- Site URL: `https://edu-note.vercel.app`
- Redirect URLs에 추가: `https://edu-note.vercel.app/auth/callback`

**Google Cloud Console** → API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트
- 승인된 리디렉션 URI에 다음이 **이미 있는지** 확인 (처음 셋업 때 등록됐으면 그대로 두면 됨):
  `https://ntdvgneiqzeopmlevuwj.supabase.co/auth/v1/callback`
- (참고: Google에는 Vercel 주소가 아니라 **Supabase 콜백 주소**가 들어갑니다. 로그인은 앱→Supabase→Google→Supabase→앱 순으로 돕니다.)

- [ ] Supabase Site URL + Redirect URL에 Vercel 주소 추가
- [ ] Google OAuth 리디렉션 URI에 Supabase 콜백 주소 존재 확인

---

### 5단계 · 배포 & 동작 확인
1. 1~4단계 후 Vercel이 자동 빌드·배포 (또는 Deployments → Redeploy)
2. 발급된 `https://….vercel.app` 주소를 **폰/외부 네트워크**에서 열기
3. 본인 구글 계정으로 로그인 → 홈 대시보드 도달 확인
4. 다른(허용 안 된) 계정은 차단되는지 확인

- [ ] 외부 기기에서 접속 + 본인 로그인 성공
- [ ] 집 컴퓨터 꺼도 접속되는지 확인

---

## 알아두기 (무과금 운영)
- **Supabase 무료 DB는 7일 미접속 시 일시정지** → 가끔 접속하거나 대시보드에서 수동 재개. 안전망으로 홈의 **"백업 내보내기(JSON)"** 를 주기적으로 받아두기.
- **Vercel Hobby**: 무료, 비상업용 약관(개인 직무 보조 용도로 수용 결정함).
- **추가 과금 0**: 서버 AI 세특은 코워크 내보내기로 대체했기 때문에 Anthropic API 호출이 없음.
- 코드 수정 후 재배포: `git push` 하면 Vercel이 자동으로 다시 빌드·배포함.

## 나중에 DB를 새로 만들 일이 생기면
마이그레이션은 `db:migrate`(0000) 후 커스텀 SQL을 **순서대로 따로** 적용:
`0001` → `0002` → `0003` → `0004` → `0005` → `0006` → `0007` → `0008`
(`node --env-file=.env.local -e "..."` 로 각 파일 실행 — 기존 방식과 동일)
