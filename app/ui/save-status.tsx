"use client";
import { useEffect, useRef, useState } from "react";

/**
 * 저장 완료 인라인 표시(공용).
 *
 * 왜: 출결 빠른입력·교과관찰·행특·차시 일괄저장은 저장 성공 신호가 "목록이 늘어남"
 * 뿐이라, 목록이 화면 밖이면 교사가 저장 여부를 알 수 없었다(조회 직전·쉬는시간처럼
 * 급한 상황에서 재클릭·중복입력으로 이어짐). 버튼 옆에서 즉시 확인되게 한다.
 *
 * 사용: `const [saved, markSaved] = useSaveStatus()` 로 상태를 만들고
 * 서버액션 성공 직후 `markSaved("20901 고제나 지각 기록됨")` 을 호출한다.
 */
export function SaveStatus({
  message,
  className,
}: {
  message: string | null;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`text-xs transition-opacity duration-200 ${
        message ? "text-emerald-500 opacity-100" : "opacity-0"
      } ${className ?? ""}`}
    >
      {message ? `✓ ${message}` : ""}
    </span>
  );
}

/** 저장 메시지 상태 + 3초 후 자동 소거. */
export function useSaveStatus(): [string | null, (msg: string) => void] {
  // 같은 문구를 연속 저장해도 타이머가 재시작되도록 seq 를 같이 들고 간다.
  const [state, setState] = useState<{ text: string | null; seq: number }>({
    text: null,
    seq: 0,
  });
  const seqRef = useRef(0);

  useEffect(() => {
    if (!state.text) return;
    const t = setTimeout(() => setState({ text: null, seq: state.seq }), 3000);
    return () => clearTimeout(t);
  }, [state]);

  return [
    state.text,
    (msg: string) => setState({ text: msg, seq: ++seqRef.current }),
  ];
}
