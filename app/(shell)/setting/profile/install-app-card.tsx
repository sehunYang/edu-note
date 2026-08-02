"use client";
import { useEffect, useState } from "react";
import { Button } from "@/app/ui/button";

/**
 * 앱으로 설치 카드(계획 pwa-installability, AC-5). layout.tsx 인라인 스크립트가
 * 조기 캡처해 둔 beforeinstallprompt 이벤트를 읽어 설치 버튼을 노출한다.
 * iOS Safari는 이 이벤트가 없어 수동 안내로, Android는 주소창 아이콘이 없고
 * 자동 배너도 preventDefault로 억제되므로 이 버튼(또는 ⋮ 메뉴)이 설치 경로다.
 * prompt() 실패는 화면에 에러로 표시해 원인 진단이 가능하게 한다.
 */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari 전용 플래그.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function InstallAppCard() {
  const [standalone, setStandalone] = useState(false);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStandalone(isStandalone());
    setPlatform(isIOS() ? "ios" : isAndroid() ? "android" : "other");

    if (window.__eduNoteInstallPromptEvent) {
      setInstallEvent(window.__eduNoteInstallPromptEvent);
    }
    const onReady = () =>
      setInstallEvent(window.__eduNoteInstallPromptEvent ?? null);
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("edu-note-install-prompt-ready", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("edu-note-install-prompt-ready", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onInstall = async () => {
    if (!installEvent) return;
    setInstalling(true);
    setError(null);
    // beforeinstallprompt: prompt()/userChoice는 표준 타입에 없으므로 unknown 경유.
    const promptEvent = installEvent as unknown as {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    };
    // 워치독: prompt()가 성공도 실패도 없이 무한 대기하는 사례(브라우저 프로필에
    // 남은 반쯤 설치된 잔재 등)에서 "설치 중…" 먹통을 끊고 행동 가능한 안내를 띄운다.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("브라우저가 10초간 설치 요청에 응답하지 않았습니다")),
        10_000,
      ),
    );
    try {
      await Promise.race([
        (async () => {
          await promptEvent.prompt();
          const choice = await promptEvent.userChoice;
          if (choice.outcome === "accepted") setInstalled(true);
        })(),
        timeout,
      ]);
    } catch (err) {
      // 실패 원인을 카드에 그대로 노출 — 실기기 진단용(예: 이미 설치됨, 프롬프트 취소).
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    } finally {
      // prompt()는 이벤트당 1회만 유효 — 성공/실패와 무관하게 소진 처리.
      setInstallEvent(null);
      window.__eduNoteInstallPromptEvent = undefined;
      setInstalling(false);
    }
  };

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm text-neutral-700">앱으로 설치</h3>

      <div className="mt-3 space-y-2 text-sm">
        {(standalone || installed) && (
          <span className="text-green-700">
            {standalone ? "앱으로 실행 중" : "설치 완료"}
          </span>
        )}

        {!standalone && !installed && installEvent && (
          <Button
            onClick={onInstall}
            disabled={installing}
            className="px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {installing ? "설치 중…" : "앱으로 설치"}
          </Button>
        )}

        {!standalone && !installed && !installEvent && platform === "ios" && (
          // 브라우저가 설치 버튼을 주지 않는 플랫폼 — 수동 경로는 추측할 수 없으므로
          // 남긴다. 재로그인은 겪으면 고장으로 보이는 동작이라 함께 알린다.
          <p className="text-xs text-neutral-500">
            Safari 공유 버튼 → &lsquo;홈 화면에 추가&rsquo;
            <span className="block text-neutral-400">
              첫 실행 시 로그인을 한 번 더 해야 할 수 있습니다
            </span>
          </p>
        )}

        {!standalone && !installed && !installEvent && platform === "android" && (
          <p className="text-xs text-neutral-500">
            Chrome 메뉴(⋮) → &lsquo;앱 설치&rsquo;
          </p>
        )}

        {!standalone && !installed && !installEvent && platform === "other" && (
          <p className="text-xs text-neutral-400">
            주소창 설치 아이콘 또는 브라우저 메뉴 → &lsquo;설치&rsquo;
          </p>
        )}

        {error && (
          <p className="text-xs text-red-600">설치 실패: {error}</p>
        )}
      </div>
    </section>
  );
}
