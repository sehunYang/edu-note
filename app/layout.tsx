import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./sw-register";
import { siteUrl } from "@/lib/config/env";

// manifest/appleWebApp을 metadata export에 넣지 않는 이유: Next 15.2+ 스트리밍
// 메타데이터가 이 태그들을 <body>로 흘려보낸 뒤 하이드레이션 때 <head>로 끌어올리는데,
// Chrome의 manifest 연결(installability)이 이 늦은 삽입에서 깨진다(실측:
// Page.getAppManifest 빈 값 → 설치 커밋 조용히 실패). 아래 <head>에 정적으로 직접 넣는다.
// title.template: 각 page 가 `title: "출결 관리"` 만 선언하면 "출결 관리 · Edu_Note"
// 가 된다(사용성 개선 P0-4). 이전에는 50개 페이지 중 2개만 제목을 설정해 모든
// 브라우저 탭·방문기록·북마크가 "Edu_Note" 하나로 뭉개졌다.
// metadataBase: openGraph 이미지를 상대경로로 쓰려면 절대 URL 기준이 필요하다.
// Vercel 은 프로덕션 도메인을 VERCEL_PROJECT_PRODUCTION_URL 로 넣어준다(프리뷰
// 배포에서도 프로덕션 도메인이 들어와, 미리보기 카드가 항상 실서비스를 가리킨다).
const SITE_URL = siteUrl() ?? "http://localhost:3000";

const SITE_DESCRIPTION =
  "고등학교 교사 1인용 교수-수업-평가-기록 일체화 플랫폼";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Edu_Note",
  title: { default: "Edu_Note", template: "%s · Edu_Note" },
  description: SITE_DESCRIPTION,
  // 색인할 공개 랜딩이 없는 서비스다(교사=로그인 뒤, 학생=비밀 토큰 링크).
  // 루트에서 noindex 를 기본값으로 깔아 로그인 화면 등이 검색에 노출되지 않게 한다.
  // /p/* 는 유출 위험이 커 페이지에서 한 번 더 명시한다.
  robots: { index: false, follow: false },
  // 카카오톡·슬랙 등 메신저 링크 미리보기용. noindex 와 무관하게 메신저 크롤러는
  // og 태그를 읽으므로, 제목만 덩그러니 뜨던 카드에 설명·아이콘을 채운다.
  openGraph: {
    type: "website",
    siteName: "Edu_Note",
    locale: "ko_KR",
    title: "Edu_Note",
    description: SITE_DESCRIPTION,
    images: [
      { url: "/icons/icon-512.png", width: 512, height: 512, alt: "Edu_Note" },
    ],
  },
  twitter: {
    card: "summary",
    title: "Edu_Note",
    description: SITE_DESCRIPTION,
    images: ["/icons/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* PWA manifest 링크 — JSX 로 렌더하지 않고 아래 인라인 스크립트가
            파싱 시점에 동기 생성한다(head 내 script 라 installability 에 필요한
            "파싱 시점 존재" 조건 충족, 스트리밍 메타데이터 경유 금지는 기존과 동일).
            JSX <link> 로 두면 React 19 하이드레이션이 hoistable 링크를 재조정하며
            클라이언트에서 바꾼 href 를 원복 + 원본 링크를 중복 삽입한다(실측:
            /p/* 토큰 스왑이 하이드레이션 후 /manifest.webmanifest 2개로 되돌아감).
            스크립트가 만든 노드는 React 소유가 아니라 하이드레이션이 건드리지 않는다.
            같은 이유로 app/manifest.ts 는 금지 — 존재하면 Next 가 전역 링크를
            메타데이터로 자동 주입해 문서상 첫 manifest 링크(Chrome 이 이것만 씀)를
            차지한다. 교사용 전역 manifest 는 public/manifest.webmanifest 정적 파일.
            ① 학생 공개 페이지(/p/<hex32토큰>)면 토큰별 manifest 를 연결(전역
               manifest 는 start_url 이 교사용 /today 라 학생 설치가 로그인 화면으로
               떨어짐) — 학생 페이지엔 설치 카드가 없으므로 beforeinstallprompt 를
               잡지 않아 브라우저 기본 설치 유도를 살린다.
            ② 그 외 경로는 전역 manifest + beforeinstallprompt 조기 캡처 — React
               하이드레이션(useEffect)보다 먼저 발화할 수 있으므로(특히 모바일)
               파싱 시점에 리스너를 건다. 카드(install-app-card)는 window ref +
               커스텀 이벤트로 읽는다(AC-5). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var m=location.pathname.match(/^\\/p\\/([0-9a-f]{32})(?:\\/|$)/);var l=document.createElement('link');l.rel='manifest';l.href=m?'/p/'+m[1]+'/manifest.webmanifest':'/manifest.webmanifest';document.head.appendChild(l);if(m)return;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__eduNoteInstallPromptEvent=e;window.dispatchEvent(new Event('edu-note-install-prompt-ready'));});})();",
          }}
        />
        <link
          rel="apple-touch-icon"
          href="/apple-icon.png"
          sizes="180x180"
          type="image/png"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* iOS 홈 화면 아이콘 이름. 경로별로 바꾸지 않는다 — 학생 페이지에서
            "학생 안내"로 바꾸려면 스크립트 생성이 필요한데, /p/* 에서는 스크립트가
            head 에 붙인 노드가 렌더 경로에 따라 사라지는 것이 실측됐다(같은 이유로
            manifest 링크도 /p/* 404 화면에서는 유실된다). 안드로이드 쪽 구분은
            토큰 manifest 의 short_name("학생 안내")이 담당한다. */}
        <meta name="apple-mobile-web-app-title" content="Edu_Note" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&display=swap"
        />
      </head>
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
