"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/app/ui/button";

/**
 * 이메일 매직링크 로그인 (배포판 S3).
 *
 * 왜 기본값이 됐나: 구글 로그인은 교사마다 GCP 프로젝트·OAuth 동의화면을 직접 만들어야
 * 해서 설치의 최대 관문이었다. 매직링크는 Supabase 기본 기능이라 추가 설정이 없다.
 * 구글 로그인은 캘린더 동기화를 원하는 사람만 나중에 켜는 고급 옵션으로 내려갔다.
 *
 * 여기서 이메일을 아무나 넣어도 로그인되지 않는다 — 설치 시 Supabase 신규가입이
 * 차단되고 소유자 계정만 초대돼 있으며, 앱 미들웨어가 ALLOWED_EMAIL 로 한 번 더 막는다.
 */
export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // 재전송 쿨다운 — 메일이 도착하기 전에 연타해서 이전 링크를 무효화하는 일을 막는다.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sending || cooldown > 0) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${location.origin}/auth/confirm`,
        // 신규 계정을 만들지 않는다. 소유자는 설치 때 이미 초대돼 있다.
        shouldCreateUser: false,
      },
    });
    setSending(false);
    if (err) {
      setError(
        "로그인 링크를 보내지 못했습니다. 등록된 교사 계정이 맞는지 확인해 주세요.",
      );
      return;
    }
    setSent(true);
    setCooldown(60);
  }

  if (sent) {
    return (
      <div className="w-full text-center">
        <p className="text-sm text-neutral-300">
          <strong className="font-medium">{email}</strong> 으로 로그인 링크를 보냈습니다.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          메일함(스팸함도)을 확인해 링크를 눌러 주세요. 링크는 잠시 후 만료됩니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setError(null);
          }}
          disabled={cooldown > 0}
          className="mt-4 text-xs text-neutral-400 underline disabled:opacity-50"
        >
          {cooldown > 0 ? `다시 보내기 (${cooldown}초)` : "다시 보내기"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="w-full">
      <label htmlFor="login-email" className="sr-only">
        이메일
      </label>
      <input
        id="login-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="본인 이메일"
        className="w-full min-w-0 max-w-full rounded-lg border border-hairline bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-neutral-500"
      />
      <Button
        type="submit"
        disabled={sending || email.trim().length === 0}
        className="mt-3 w-full px-5 py-2.5 text-sm font-normal disabled:opacity-60"
      >
        {sending ? "보내는 중…" : "로그인 링크 받기"}
      </Button>
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </form>
  );
}
