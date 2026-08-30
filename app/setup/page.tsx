import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { isBootstrapped } from "@/lib/setup/bootstrap";
import { allowedEmail } from "@/lib/config/env";
import { CoveLight } from "@/app/ui/cove-light";
import { SetupForm } from "./setup-form";

export const metadata = { title: "설치 마무리", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * 설치 마법사 `/setup` (배포판 S3).
 *
 * 설치가 끝난 배포에서는 **404** 다 — 한 번 쓰고 닫히는 문이다.
 * 미들웨어 matcher 에서 제외돼 로그인 없이 열린다(로그인이 아직 불가능한 상태를
 * 해결하는 화면이므로 필연적).
 *
 * 이 문이 열려 있는 동안 제3자가 먼저 도달해도 위험하지 않다: 소유자 이메일은
 * Vercel 환경변수로 이미 고정돼 있어, 여기서 할 수 있는 일은 "정해진 소유자"를 위해
 * Auth 를 설정하는 것뿐이다. 자신에게 접근권을 줄 방법이 없다.
 */
export default async function SetupPage() {
  let done = false;
  try {
    done = await isBootstrapped(getDb());
  } catch {
    // DB 접속 자체가 안 되는 상태 — 설치 화면은 열어 두고 아래에서 안내한다.
    done = false;
  }
  if (done) notFound();

  const owner = allowedEmail();

  return (
    <>
      <CoveLight />
      <main className="mx-auto flex min-h-[80vh] max-w-lg flex-col justify-center px-6 py-12">
        <h1 className="text-center text-2xl tracking-tight">📆 거의 다 됐습니다</h1>
        <p className="mt-3 text-center text-sm text-neutral-400">
          로그인 메일이 이 주소로 돌아오도록 Supabase 설정을 한 번만 맞추면 끝입니다.
          <br />
          약 1분 걸립니다.
        </p>

        {!owner && (
          <div className="mt-6 rounded-lg border border-amber-900/50 bg-amber-950/30 p-4 text-sm text-amber-200">
            <b className="font-medium">먼저 할 일이 있습니다.</b>
            <p className="mt-1 text-amber-200/80">
              Vercel 프로젝트의 환경변수에 <code>ALLOWED_EMAIL</code> 을 본인 이메일로
              등록한 뒤 다시 배포해 주세요. 이 값이 로그인할 수 있는 유일한 계정을
              정합니다.
            </p>
          </div>
        )}

        <div className="mt-8">
          <SetupForm ownerEmail={owner} />
        </div>
      </main>
    </>
  );
}
