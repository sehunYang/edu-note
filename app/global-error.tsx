"use client";
import { useEffect } from "react";
import "./globals.css";

/**
 * 최상위 오류 경계 (사용성 개선 P0-3). 루트 레이아웃 자체가 실패한 경우에만 뜨며,
 * 이때는 RootLayout 이 대체되므로 html/body 를 직접 렌더해야 한다. 폰트 CDN·
 * 셸 컴포넌트에 기대지 않고 globals.css 만으로 다크 배경을 유지한다(흰 화면 방지).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] 치명적 오류:", error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
          <p className="text-5xl" aria-hidden="true">
            ⚠️
          </p>
          <h1 className="mt-4 text-xl tracking-tight">
            앱을 불러오지 못했습니다
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            잠시 후 다시 시도해 주세요. 계속되면 브라우저를 새로고침해 주세요.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-xs text-neutral-600">
              오류 코드 {error.digest}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center rounded-full border border-white bg-white px-5 text-sm text-black hover:bg-white/90"
            >
              다시 시도
            </button>
            <a
              href="/"
              className="inline-flex min-h-11 items-center rounded-full border border-white/25 px-5 text-sm text-white hover:bg-white/10"
            >
              홈으로
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
