"use client";
import { useState } from "react";
import { Button } from "@/app/ui/button";
import { runSetupAction } from "./actions";
import type { BootstrapResult } from "@/lib/setup/bootstrap";

/**
 * 설치 마법사 폼 (배포판 S3). 교사가 이 앱에서 붙여넣는 유일한 토큰이다.
 * 결과는 단계별 체크리스트로 보여준다 — 실패했을 때 어디서 막혔는지 알아야
 * 다음 행동을 정할 수 있기 때문.
 */
export function SetupForm({ ownerEmail }: { ownerEmail: string | null }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BootstrapResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    const fd = new FormData(e.currentTarget);
    try {
      setResult(await runSetupAction(fd));
    } catch {
      setResult({
        ok: false,
        steps: [],
        message: "설정 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="w-full">
        <Checklist result={result} />
        <a
          href="/login"
          className="mt-6 block rounded-lg bg-white/10 px-5 py-3 text-center text-sm hover:bg-white/15"
        >
          로그인하러 가기 →
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <ol className="mb-6 space-y-3 text-left text-sm text-neutral-300">
        <li>
          <span className="mr-2 text-neutral-500">1.</span>
          <a
            href="https://supabase.com/dashboard/account/tokens"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Supabase 토큰 발급 페이지
          </a>
          를 새 탭에서 엽니다.
        </li>
        <li>
          <span className="mr-2 text-neutral-500">2.</span>
          <b className="font-medium">Generate new token</b> 을 누르고 이름은 아무거나
          (예: edu-note) 적습니다.
        </li>
        <li>
          <span className="mr-2 text-neutral-500">3.</span>
          만들어진 <code className="text-xs">sbp_</code> 로 시작하는 값을 복사해 아래에
          붙여넣습니다.
        </li>
      </ol>

      <label htmlFor="accessToken" className="sr-only">
        Supabase 액세스 토큰
      </label>
      <input
        id="accessToken"
        name="accessToken"
        type="password"
        required
        autoComplete="off"
        spellCheck={false}
        placeholder="sbp_..."
        className="w-full min-w-0 max-w-full rounded-lg border border-hairline bg-black/20 px-3 py-2.5 font-mono text-sm outline-none focus:border-neutral-500"
      />

      <Button
        type="submit"
        disabled={busy}
        className="mt-4 w-full px-5 py-2.5 text-sm font-normal disabled:opacity-60"
      >
        {busy ? "설정하는 중…" : "설정 완료하기"}
      </Button>

      <p className="mt-4 text-xs text-neutral-500">
        이 토큰은 저장되지 않습니다. 로그인 주소를 등록하고
        {ownerEmail ? ` ${ownerEmail} 계정을 초대한 뒤` : " 소유자 계정을 초대한 뒤"} 즉시
        버려집니다. 설정이 끝나면 이 화면은 다시 열리지 않습니다.
      </p>

      {result && !result.ok && (
        <div className="mt-6">
          <Checklist result={result} />
        </div>
      )}
    </form>
  );
}

function Checklist({ result }: { result: BootstrapResult }) {
  return (
    <div className="rounded-lg border border-hairline bg-black/20 p-4 text-left">
      {result.steps.length > 0 && (
        <ul className="space-y-2 text-sm">
          {result.steps.map((s) => (
            <li key={s.label} className="flex gap-2">
              <span aria-hidden>{s.ok ? "✅" : "❌"}</span>
              <span>
                {s.label}
                {s.detail && (
                  <span className="ml-1 text-xs text-neutral-500">({s.detail})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result.message && (
        <p
          className={`text-sm ${result.steps.length > 0 ? "mt-3 border-t border-hairline pt-3" : ""} ${
            result.ok ? "text-neutral-300" : "text-red-400"
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
