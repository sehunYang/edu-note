"use client";
import { useEffect, useState } from "react";
import { Button } from "@/app/ui/button";

/**
 * 앱으로 설치 카드(계획 pwa-installability, AC-5). sw-register.tsx가 조기
 * 캡처해 재발행한 beforeinstallprompt 이벤트를 구독해 설치 버튼을 노출한다.
 * iOS Safari는 이 이벤트가 존재하지 않으므로 수동 안내 문구로 대체한다.
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

export function InstallAppCard() {
  const [standalone, setStandalone] = useState(false);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  const [ios, setIos] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIOS());

    if (window.__eduNoteInstallPromptEvent) {
      setInstallEvent(window.__eduNoteInstallPromptEvent);
    }
    const onReady = () => setInstallEvent(window.__eduNoteInstallPromptEvent ?? null);
    window.addEventListener("edu-note-install-prompt-ready", onReady);
    return () => window.removeEventListener("edu-note-install-prompt-ready", onReady);
  }, []);

  const onInstall = async () => {
    if (!installEvent) return;
    setInstalling(true);
    // beforeinstallprompt: prompt()/userChoice는 표준 타입에 없으므로 unknown 경유.
    const promptEvent = installEvent as unknown as {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    };
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setInstallEvent(null);
    setInstalling(false);
  };

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-normal text-neutral-700">앱으로 설치</h3>
      <p className="mt-1 text-xs text-neutral-400">
        데스크톱·Android·iOS에 독립 앱처럼 설치해 홈 화면·작업표시줄에서 바로
        실행할 수 있습니다. 인터넷 연결이 있어야 정상 동작합니다.
      </p>

      <div className="mt-3 text-sm">
        {standalone && (
          <span className="text-green-700">앱으로 실행 중</span>
        )}

        {!standalone && installEvent && (
          <Button
            onClick={onInstall}
            disabled={installing}
            className="px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {installing ? "설치 중…" : "앱으로 설치"}
          </Button>
        )}

        {!standalone && !installEvent && ios && (
          <p className="text-xs text-neutral-500">
            Safari 하단 공유 버튼 → &lsquo;홈 화면에 추가&rsquo;를 눌러 설치하세요.
            앱으로 처음 실행 시 로그인을 한 번 다시 해야 할 수 있습니다(브라우저와
            별도 저장소 사용).
          </p>
        )}

        {!standalone && !installEvent && !ios && (
          <p className="text-xs text-neutral-400">
            브라우저 주소창의 설치 아이콘 또는 메뉴에서 &lsquo;설치&rsquo;를
            선택하세요.
          </p>
        )}
      </div>
    </section>
  );
}
