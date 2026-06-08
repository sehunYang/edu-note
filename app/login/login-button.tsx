"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Google 로그인 버튼 (계획 §3.2). PKCE 흐름으로 /auth/callback 으로 복귀. */
export function GoogleLoginButton() {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setLoading(false);
      alert("로그인 시작 실패: " + error.message);
    }
    // 성공 시 구글로 리다이렉트됨.
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium shadow-sm hover:bg-neutral-50 disabled:opacity-60"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.2C12.2 13.7 17.6 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-17z" />
        <path fill="#FBBC05" d="M10.4 28.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.2z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.8 2.1-6.4 0-11.8-4.2-13.6-9.9l-7.9 6.2C6.4 42.6 14.6 48 24 48z" />
      </svg>
      {loading ? "이동 중…" : "Google로 로그인"}
    </button>
  );
}
