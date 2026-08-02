import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/owner";
import { CoveLight } from "@/app/ui/cove-light";
import { GoogleLoginButton } from "./login-button";

export const metadata = { title: "로그인" };

/** 로그인 화면 (계획 §3.2). 이미 로그인+허용계정이면 홈으로. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getCurrentUser();
  const allowed = process.env.ALLOWED_EMAIL;
  if (user && (!allowed || user.email === allowed)) redirect("/");

  return (
    <>
      <CoveLight />
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl tracking-tight">📆 Edu_Note</h1>
      <p className="mt-2 text-sm text-neutral-500">
        교사 본인 계정으로만 로그인할 수 있습니다.
      </p>

      <div className="mt-8">
        <GoogleLoginButton />
      </div>

      {error === "forbidden" && (
        <p className="mt-6 text-sm text-red-600">
          등록된 교사 계정이 아닙니다.
        </p>
      )}
      {error === "auth" && (
        <p className="mt-6 text-sm text-red-600">
          로그인에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}
      </main>
    </>
  );
}
