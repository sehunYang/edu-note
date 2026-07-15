"use client";
import { useEffect } from "react";

/**
 * Service Worker 등록(계획 pwa-installability). 등록 실패는 앱 동작에 영향
 * 없음(무해). beforeinstallprompt 조기 캡처는 하이드레이션 레이스를 피하려고
 * layout.tsx <head>의 인라인 스크립트가 담당한다 — 여기서 다시 걸지 않는다.
 */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}

declare global {
  interface Window {
    __eduNoteInstallPromptEvent?: Event;
  }
}
