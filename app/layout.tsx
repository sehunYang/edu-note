import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./sw-register";

// manifest/appleWebApp을 metadata export에 넣지 않는 이유: Next 15.2+ 스트리밍
// 메타데이터가 이 태그들을 <body>로 흘려보낸 뒤 하이드레이션 때 <head>로 끌어올리는데,
// Chrome의 manifest 연결(installability)이 이 늦은 삽입에서 깨진다(실측:
// Page.getAppManifest 빈 값 → 설치 커밋 조용히 실패). 아래 <head>에 정적으로 직접 넣는다.
export const metadata: Metadata = {
  title: "Edu_Note",
  description: "고등학교 교사 1인용 교수-수업-평가-기록 일체화 플랫폼",
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
        {/* beforeinstallprompt 조기 캡처 — React 하이드레이션(useEffect)보다 먼저
            발화할 수 있으므로(특히 모바일) 인라인 스크립트로 문서 파싱 시점에 리스너를
            건다. 카드(install-app-card)는 window ref + 커스텀 이벤트로 읽는다(AC-5). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__eduNoteInstallPromptEvent=e;window.dispatchEvent(new Event('edu-note-install-prompt-ready'));});",
          }}
        />
        {/* PWA 필수 태그 — 파싱 시점에 <head>에 존재해야 Chrome installability가
            안정적으로 동작한다(스트리밍 메타데이터 경유 금지, 위 주석 참조). */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link
          rel="apple-touch-icon"
          href="/apple-icon.png"
          sizes="180x180"
          type="image/png"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
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
