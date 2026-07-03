"use client";

import { useEffect, useRef, useState } from "react";

/**
 * value 가 바뀔 때 이전 값→새 value 로 rAF 카운트업(ease-out cubic).
 * prefers-reduced-motion: reduce 이면 애니메이션 없이 즉시 최종값.
 *
 * 하이드레이션 안전을 위해 초기 state 를 최종 value 로 두므로(SSR/클라 첫 렌더
 * 동일값) **최초 마운트에서는 카운트업이 재생되지 않고 정적 표시**된다 — 값이
 * 클라이언트에서 갱신될 때만 애니메이션한다. (초기 로드부터 0→value 를 연출하려면
 * value→0 의 한 프레임 플래시를 감수해야 하므로 의도적으로 배제했다.)
 */
export function CountUp({
  value,
  durationMs = 400,
  className,
  suffix,
}: {
  value: number;
  durationMs?: number;
  className?: string;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;

    if (from === to) {
      setDisplay(to);
      return;
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(to);
      return;
    }

    let raf = 0;
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setDisplay(to);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <span className={className}>
      {Math.round(display).toLocaleString("ko-KR")}
      {suffix}
    </span>
  );
}
