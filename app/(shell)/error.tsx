"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/app/ui/button";

/**
 * (shell) 오류 경계 (사용성 개선 P0-3). 셸 하위 어떤 페이지가 렌더/데이터 예외를
 * 던져도 사이드바·헤더는 유지한 채 이 화면만 콘텐츠 영역에 뜬다 — 사용자가
 * 앱 밖으로 튕기지 않고 다시 시도하거나 다른 실로 이동할 수 있다.
 *
 * 서버액션 가드(getOwnerId)가 던지는 "로그인이 필요합니다"·"허용되지 않은 계정"은
 * 재시도로 풀리지 않으므로 로그인 화면으로 안내한다.
 */
export default function ShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[shell] 렌더 오류:", error);
  }, [error]);

  const isAuth =
    error.message.includes("로그인이 필요") ||
    error.message.includes("허용되지 않은 계정");

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <p className="text-5xl" aria-hidden="true">
        {isAuth ? "🔒" : "⚠️"}
      </p>
      <h1 className="mt-4 text-xl tracking-tight">
        {isAuth ? "다시 로그인해 주세요" : "화면을 불러오지 못했습니다"}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        {isAuth
          ? "세션이 만료되었거나 허용되지 않은 계정입니다."
          : "일시적인 문제일 수 있습니다. 다시 시도해도 같은 화면이 나오면 새로고침해 주세요."}
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-neutral-600">
          오류 코드 {error.digest}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {isAuth ? (
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-full border border-white bg-white px-5 text-sm text-black hover:bg-white/90"
          >
            로그인 화면으로
          </Link>
        ) : (
          <Button variant="solid" onClick={reset} className="min-h-11 px-5 text-sm">
            다시 시도
          </Button>
        )}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full border border-white/25 px-5 text-sm text-white hover:bg-white/10"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
