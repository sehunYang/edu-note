import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "Edu_Note",
  description: "고등학교 교사 1인용 교수-수업-평가-기록 일체화 플랫폼",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Edu_Note",
    statusBarStyle: "black-translucent",
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
        {/* beforeinstallprompt 조기 캡처 — React 하이드레이션(useEffect)보다 먼저
            발화할 수 있으므로(특히 모바일) 인라인 스크립트로 문서 파싱 시점에 리스너를
            건다. 카드(install-app-card)는 window ref + 커스텀 이벤트로 읽는다(AC-5). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__eduNoteInstallPromptEvent=e;window.dispatchEvent(new Event('edu-note-install-prompt-ready'));});",
          }}
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
