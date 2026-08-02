"use client";
import { useEffect, useState } from "react";
import { subscribeToPush, getLocalPushEndpoint } from "@/app/ui/push-subscribe";
import { Button } from "@/app/ui/button";
import {
  registerStudentPushAction,
  updateStudentPushPrefAction,
  sendStudentTestPushAction,
  getStudentPushStateAction,
} from "../actions";

/**
 * 학생 공개 페이지 알림 설정 카드(push-notifications, US-6).
 * VAPID 공개키 미설정 시 안내만 노출(버튼 비활성). 구독 전에는 "알림 받기" 버튼,
 * 구독 후에는 S1/S2/S3 토글 + 테스트 발송. iOS 비standalone 은 홈 화면 추가 안내.
 */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const PREF_LABELS: { key: "s1" | "s2" | "s3"; label: string; desc: string }[] = [
  { key: "s1", label: "새 공지", desc: "교사가 새 공지를 올리면" },
  { key: "s2", label: "상담 통지", desc: "상담 예약·취소가 처리되면" },
  { key: "s3", label: "서류 리마인드", desc: "제출 마감이 다가오면" },
];

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function NotifyCard({ token }: { token: string }) {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [prefs, setPrefs] = useState({ s1: true, s2: true, s3: true });
  const [iosBlocked, setIosBlocked] = useState(false);

  useEffect(() => {
    setIosBlocked(isIOS() && !isStandalone());
    // 구독은 기기별 — 이 기기의 endpoint 로 서버 상태를 복원해야 새로고침해도
    // 토글 상태가 유지되고, 다른 기기 구독과 혼동하지 않는다.
    (async () => {
      const endpoint = await getLocalPushEndpoint();
      if (!endpoint) return;
      const state = await getStudentPushStateAction(token, endpoint);
      if (state.subscribed) {
        setSubscribed(true);
        setPrefs(state.prefs);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const configured = VAPID_PUBLIC_KEY.length > 0;

  const onSubscribe = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    const result = await subscribeToPush(VAPID_PUBLIC_KEY);
    if (!result.ok) {
      const msg: Record<typeof result.reason, string> = {
        unsupported: "이 브라우저는 알림을 지원하지 않습니다.",
        "permission-denied": "알림 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.",
        "no-vapid-key": "알림 설정이 준비되지 않았습니다.",
        "subscribe-failed": "구독에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      };
      setError(msg[result.reason]);
      setBusy(false);
      return;
    }
    const saved = await registerStudentPushAction(token, result.subscription);
    if (!saved.ok) {
      setError(saved.message);
      setBusy(false);
      return;
    }
    setSubscribed(true);
    setPrefs({ s1: true, s2: true, s3: true });
    setBusy(false);
  };

  const onToggle = async (key: "s1" | "s2" | "s3") => {
    const next = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    setError(null);
    const res = await updateStudentPushPrefAction(token, key, next);
    if (!res.ok) {
      setPrefs((p) => ({ ...p, [key]: !next }));
      setError(res.message);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setError(null);
    setStatus(null);
    const res = await sendStudentTestPushAction(token);
    if (res.ok) setStatus("테스트 알림을 보냈습니다. 잠시 후 확인해 주세요.");
    else setError(res.message);
    setTesting(false);
  };

  return (
    <section className="rounded-2xl border border-hairline bg-card p-4">
      <h2 className="text-sm text-neutral-700">알림 설정</h2>

      {!configured ? (
        <p className="mt-2 text-sm text-neutral-400">
          알림 기능이 아직 준비되지 않았습니다.
        </p>
      ) : iosBlocked ? (
        <p className="mt-2 text-sm text-neutral-500">
          아이폰·아이패드는 홈 화면에 추가한 뒤 앱으로 열어야 알림을 받을 수
          있어요. Safari 공유 버튼 → &lsquo;홈 화면에 추가&rsquo;
        </p>
      ) : !subscribed ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-neutral-500">
            새 공지·상담 통지·서류 마감을 알림으로 받아보세요.
          </p>
          <Button
            onClick={onSubscribe}
            loading={busy}
            className="px-3 py-1.5 text-sm"
          >
            알림 받기
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {PREF_LABELS.map(({ key, label, desc }) => (
            <label
              key={key}
              className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3"
            >
              <span className="text-sm">
                <span className="text-neutral-700">{label}</span>
                <span className="ml-2 text-xs text-neutral-400">{desc}</span>
              </span>
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={() => onToggle(key)}
                className="h-5 w-5 shrink-0 accent-blue-500"
              />
            </label>
          ))}
          <Button
            onClick={onTest}
            loading={testing}
            className="px-3 py-1.5 text-sm"
          >
            테스트 알림 보내기
          </Button>
        </div>
      )}

      {status && <p role="status" className="mt-2 text-xs text-green-700">{status}</p>}
      {error && <p role="status" className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
