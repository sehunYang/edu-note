import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { isBootstrapped } from "@/lib/setup/bootstrap";
import { allowedEmail } from "@/lib/config/env";
import { features } from "@/lib/config/features";
import { CoveLight } from "@/app/ui/cove-light";
import { GoogleLoginButton } from "./login-button";
import { MagicLinkForm } from "./magic-link-form";

export const metadata = { title: "로그인" };

/**
 * 로그인 화면.
 *
 * 배포판(S3)부터 기본은 **이메일 매직링크**다. 구글 버튼은 캘린더 연동을 위해
 * GCP 를 설정한 배포에서만 나타난다 — 설정하지 않은 교사에게 눌러도 실패하는
 * 버튼을 보여주지 않기 위해서다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getCurrentUser();
  const allowed = allowedEmail();
  if (user && (!allowed || user.email === allowed)) redirect("/");

  // 설치가 아직 안 끝났으면 로그인은 어차피 실패한다(리다이렉트 주소 미등록).
  // 로그인 화면이 막다른 길이 되지 않도록 설치 화면으로 안내한다.
  let needsSetup = false;
  try {
    needsSetup = !(await isBootstrapped(getDb()));
  } catch {
    needsSetup = false; // DB 를 못 읽는 상황까지 여기서 떠안지 않는다.
  }

  return (
    <>
      <CoveLight />
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-3xl tracking-tight">📆 Edu_Note</h1>
        <p className="mt-2 text-sm text-neutral-500">
          교사 본인 계정으로만 로그인할 수 있습니다.
        </p>

        {needsSetup && (
          <a
            href="/setup"
            className="mt-6 block w-full rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800 hover:bg-amber-100"
          >
            <b className="font-medium">설치를 마무리해 주세요 →</b>
            <span className="mt-1 block text-amber-700">
              마지막 설정 한 단계가 남아 있습니다. 끝내야 로그인 메일이 이 주소로
              돌아옵니다.
            </span>
          </a>
        )}

        <div className="mt-8 w-full">
          <MagicLinkForm />
        </div>

        {features.google && (
          <>
            <div className="mt-8 flex w-full items-center gap-3 text-xs text-neutral-600">
              <span className="h-px flex-1 bg-hairline" />
              또는
              <span className="h-px flex-1 bg-hairline" />
            </div>
            <div className="mt-6">
              <GoogleLoginButton />
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              구글 캘린더와 연동하려면 구글 로그인을 사용하세요.
            </p>
          </>
        )}

        {error === "forbidden" && (
          <p className="mt-6 text-sm text-red-500">등록된 교사 계정이 아닙니다.</p>
        )}
        {error === "auth" && (
          <p className="mt-6 text-sm text-red-500">
            로그인에 실패했습니다. 링크가 만료됐을 수 있으니 다시 시도해 주세요.
          </p>
        )}
      </main>
    </>
  );
}
