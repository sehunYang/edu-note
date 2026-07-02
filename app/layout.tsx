import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edu_Note",
  description: "고등학교 교사 1인용 교수-수업-평가-기록 일체화 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
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
      <body>{children}</body>
    </html>
  );
}
