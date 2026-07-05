"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/app/ui/button";
import {
  getGoogleConnectionStatusAction,
  disconnectGoogleAction,
} from "./google-calendar-actions";

type Status = { connected: boolean; lastError: string | null } | null;

/**
 * 구글 캘린더 연결 카드(계획 6단계). 증분 동의(offline+consent)로
 * `/auth/callback`에 refresh token 캡처를 요청하고, 상태는 서버액션으로만 조회한다
 * (토큰 원문·암호문은 절대 이 컴포넌트로 내려오지 않는다 — AC-8).
 */
export function GoogleCalendarCard() {
  const [status, setStatus] = useState<Status>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refresh = async () => {
    setStatus(await getGoogleConnectionStatusAction());
  };

  useEffect(() => {
    refresh();
  }, []);

  const onConnect = async () => {
    setConnecting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar.events",
        queryParams: { access_type: "offline", prompt: "consent" },
        redirectTo: `${location.origin}/auth/callback?next=/setting/profile`,
      },
    });
    if (error) {
      setConnecting(false);
      alert("연결 시작 실패: " + error.message);
    }
    // 성공 시 구글로 리다이렉트됨.
  };

  const onDisconnect = async () => {
    setDisconnecting(true);
    await disconnectGoogleAction();
    await refresh();
    setDisconnecting(false);
  };

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-normal text-neutral-700">구글 캘린더</h3>
      <p className="mt-1 text-xs text-neutral-400">
        오늘의 학교에서 직접 추가한 일정을 본인 구글 캘린더로 자동 동기화합니다
        (단방향).
      </p>

      <div className="mt-3 text-sm">
        {status === null && <span className="text-neutral-400">확인 중…</span>}
        {status && !status.connected && (
          <span className="text-neutral-500">연결 안 됨</span>
        )}
        {status && status.connected && !status.lastError && (
          <span className="text-green-700">연결됨</span>
        )}
        {status && status.connected && status.lastError && (
          <span className="text-amber-700">
            재연결 필요 — {status.lastError}
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          onClick={onConnect}
          disabled={connecting}
          className="px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {connecting
            ? "이동 중…"
            : status?.connected
              ? "재연결(구글 캘린더 연결)"
              : "구글 캘린더 연결"}
        </Button>
        {status?.connected && (
          <Button
            variant="destructive"
            onClick={onDisconnect}
            disabled={disconnecting}
            className="px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {disconnecting ? "해제 중…" : "연결 해제"}
          </Button>
        )}
      </div>
    </section>
  );
}
