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
      <body>{children}</body>
    </html>
  );
}
