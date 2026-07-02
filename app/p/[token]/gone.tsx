/**
 * 폐기/만료 토큰 안내 (계획 §3.2 — 폐기/만료는 410).
 * Next App Router 에서 notFound() 는 404 고정이므로, 410 의미는 별도 안내 컴포넌트로
 * 표현한다(검색 비색인은 page 의 metadata.robots 로 이미 적용).
 */
export function GoneNotice({ reason }: { reason: "revoked" | "expired" }) {
  const message =
    reason === "revoked"
      ? "이 링크는 폐기되었습니다."
      : "이 링크는 유효 기간이 지났습니다.";
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-normal">접근할 수 없는 링크</h1>
      <p className="mt-2 text-sm text-neutral-500">{message}</p>
      <p className="mt-1 text-xs text-neutral-400">
        담임 선생님께 새 링크를 요청하세요.
      </p>
    </main>
  );
}
