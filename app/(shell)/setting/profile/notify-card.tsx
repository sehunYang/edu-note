"use client";
import { useEffect, useState } from "react";
import { Button } from "@/app/ui/button";
import { subscribeToPush, type PushSubscribeResult } from "@/app/ui/push-subscribe";
import {
  getTeacherPushStateAction,
  registerTeacherPushAction,
  toggleTeacherPushPrefAction,
  sendTeacherTestPushAction,
} from "./push-actions";

type State = {
  subscribed: boolean;
  prefs: { instant: boolean; briefing: boolean };
} | null;

const REASON_MESSAGE: Record<string, string> = {
  unsupported: "이 브라우저는 웹 푸시를 지원하지 않습니다(iOS는 홈 화면 앱으로 설치 후 가능).",
  "permission-denied": "알림 권한이 거부되었습니다. 브라우저 사이트 설정에서 알림을 허용해 주세요.",
  "no-vapid-key": "서버 설정이 필요합니다(VAPID 키 미설정).",
  "subscribe-failed": "구독에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

/**
 * 교사 알림 설정 카드(합의 계획 push-notifications, US-5). NEXT_PUBLIC_VAPID_PUBLIC_KEY
 * 가 없으면 어떤 액션도 호출하지 않고 안내만 표시(무해성). 구독/토글/테스트발송은
 * 모두 서버액션 경유이며, 실제 알림 수신은 비동기라 발송 요청 여부까지만 안내한다.
 */
export function NotifyCard() {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const [state, setState] = useState<State>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    setState(await getTeacherPushStateAction());
  };

  useEffect(() => {
    if (!vapidKey) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEnable = async () => {
    setBusy(true);
    setMessage(null);
    const result: PushSubscribeResult = await subscribeToPush(vapidKey);
    if (!result.ok) {
      setMessage(REASON_MESSAGE[result.reason] ?? "알림을 켤 수 없습니다.");
      setBusy(false);
      return;
    }
    await registerTeacherPushAction(result.subscription);
    await refresh();
    setBusy(false);
  };

  const onTogglePref = async (key: "instant" | "briefing", value: boolean) => {
    if (!state) return;
    setState({ ...state, prefs: { ...state.prefs, [key]: value } });
    await toggleTeacherPushPrefAction(key, value);
  };

  const onTest = async () => {
    setBusy(true);
    setMessage(null);
    await sendTeacherTestPushAction();
    setMessage("발송 요청됨 — 잠시 후 기기 알림을 확인하세요.");
    setBusy(false);
  };

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-normal text-neutral-700">알림</h3>
      <p className="mt-1 text-xs text-neutral-400">
        상담 신청·취소 요청 즉시 알림과 수업일 아침 브리핑을 이 기기의 푸시 알림으로 받습니다.
      </p>

      {!vapidKey ? (
        <p className="mt-3 text-sm text-neutral-500">
          서버 설정이 필요합니다(관리자에게 문의).
        </p>
      ) : state === null ? (
        <p className="mt-3 text-sm text-neutral-400">확인 중…</p>
      ) : !state.subscribed ? (
        <div className="mt-3">
          <Button
            onClick={onEnable}
            disabled={busy}
            className="px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {busy ? "설정 중…" : "알림 켜기"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={state.prefs.instant}
              onChange={(e) => onTogglePref("instant", e.target.checked)}
            />
            즉시 알림(상담 신청·취소 요청)
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={state.prefs.briefing}
              onChange={(e) => onTogglePref("briefing", e.target.checked)}
            />
            하루 브리핑
          </label>
          <div>
            <Button
              onClick={onTest}
              disabled={busy}
              className="px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {busy ? "발송 중…" : "테스트 알림 보내기"}
            </Button>
          </div>
        </div>
      )}

      {message && <p className="mt-3 text-xs text-neutral-500">{message}</p>}
    </section>
  );
}
