"use client";

import type { ComponentProps } from "react";

/**
 * 확인을 거치는 제출 버튼 (사용성 개선 P1-9).
 *
 * 실측: 삭제 UI 가 있는 21개 파일 중 확인 절차가 있는 것은 4개(19%)뿐이었고,
 * 되돌리기는 앱 전체에 0건이었다 — 공지·상담일지·출결 기록·예산처럼 재입력
 * 비용이 큰 데이터가 클릭 한 번에 사라졌다. 서버액션 `<form action={...}>`
 * 안에서 쓰는 제출 버튼이 대부분이라, 취소 시 submit 을 막는 방식이 가장 적게
 * 침습적이다(기존 코드가 쓰던 window.confirm 관례와도 일치).
 */
export function ConfirmButton({
  message,
  onClick,
  children,
  ...props
}: ComponentProps<"button"> & { message: string }) {
  return (
    <button
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}
