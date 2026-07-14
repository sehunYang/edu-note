"use client";
import { useEffect } from "react";

/**
 * Service Worker 등록 + beforeinstallprompt 조기 캡처(계획 pwa-installability,
 * AC-5). 설정실 설치 카드가 마운트되기 전에 이벤트가 발화할 수 있으므로, 전
 * 라우트에 마운트되는 이 컴포넌트가 가장 먼저 리스너를 붙여 이벤트를 보관하고
 * 커스텀 이벤트로 재발행한다. 등록 실패는 앱 동작에 영향 없음(무해).
 */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.__eduNoteInstallPromptEvent = e;
      window.dispatchEvent(new CustomEvent("edu-note-install-prompt-ready"));
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  return null;
}

declare global {
  interface Window {
    __eduNoteInstallPromptEvent?: Event;
  }
}
