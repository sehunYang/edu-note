"use client";
import { useState } from "react";
import { Button } from "@/app/ui/button";
import { saveNeisKeyAction } from "./actions";

/**
 * NEIS 인증키 등록 칸 (배포판 S5).
 *
 * 이 칸이 배포판 설계의 핵심 약속을 지킨다 — "키를 나중에 받아도, 앱 안에서 넣으면
 * 된다". 이게 없으면 교사가 Vercel 대시보드에 들어가 환경변수를 고치고 재배포해야 한다.
 */
export function NeisKeyForm({
  enabled,
  fromEnv,
}: {
  enabled: boolean;
  fromEnv: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (fromEnv) {
    return (
      <p className="mt-2 text-xs text-neutral-500">
        이 배포는 인증키가 환경변수로 고정돼 있습니다. 변경은 Vercel 환경변수에서 하세요.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await saveNeisKeyAction(fd);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) e.currentTarget.reset();
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
          placeholder={enabled ? "새 인증키로 교체하려면 입력" : "나이스 인증키 붙여넣기"}
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-black/20 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-500"
        />
        <Button type="submit" disabled={busy} className="px-4 py-2 text-sm disabled:opacity-60">
          {busy ? "저장 중…" : "저장"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        <a
          href="https://open.neis.go.kr"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          나이스 교육정보 개방포털
        </a>
        에서 무료로 즉시 발급됩니다. 비워서 저장하면 연동이 꺼집니다.
      </p>
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
