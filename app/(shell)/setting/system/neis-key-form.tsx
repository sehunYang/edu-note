"use client";
import { useState } from "react";
import { Button } from "@/app/ui/button";
import { saveNeisKeyAction } from "./actions";
import type { NeisKeySource } from "@/lib/config/runtime-key";

/**
 * 나이스 인증키 등록 칸 (배포판 S5).
 *
 * 이 칸이 배포판의 핵심 약속을 지킨다 — "키를 나중에 받아도 앱 안에서 넣으면 된다".
 *
 * ⚠ 2026-08-31: 예전엔 환경변수에 값이 있으면 이 폼을 아예 숨겼다. 그런데 Deploy 화면이
 * 인증키 칸을 강제하던 탓에 임의값을 넣고 배포한 교사가 앱에서 고칠 방법이 없었다.
 * 이제 폼은 항상 열려 있고, 여기 저장한 값이 환경변수보다 우선한다.
 */
export function NeisKeyForm({ source }: { source: NeisKeySource }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    setBusy(true);
    setMsg(null);
    try {
      const r = await saveNeisKeyAction(new FormData(form));
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) form.reset();
    } catch {
      setMsg({ ok: false, text: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3">
      <label htmlFor="neisKey" className="sr-only">
        나이스 인증키
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="neisKey"
          name="neisKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            source === "none" ? "나이스 인증키 붙여넣기" : "새 인증키로 교체하려면 입력"
          }
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-black/20 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-500"
        />
        <Button type="submit" disabled={busy} className="px-4 py-2 text-sm disabled:opacity-60">
          {busy ? "확인 중…" : "저장"}
        </Button>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        {source === "env" && (
          <>
            지금은 <b className="font-medium">배포할 때 넣은 값</b>을 쓰고 있습니다. 여기에
            저장하면 그 값보다 우선합니다.{" "}
          </>
        )}
        {source === "app" && <>지금은 이 화면에서 저장한 값을 쓰고 있습니다. </>}
        <a
          href="https://open.neis.go.kr"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          나이스 교육정보 개방포털
        </a>
        에서 무료로 즉시 발급됩니다. 저장 전에 실제로 통하는 키인지 확인합니다.
        {source !== "none" && <> 비워서 저장하면 지웁니다.</>}
      </p>

      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
