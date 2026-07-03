"use client";
import { useActionState } from "react";
import { generateAllAction, type GenState } from "./actions";
import { Button } from "@/app/ui/button";

/** 차시 생성/갱신 버튼 (계획 §4 B). 결과를 옆에 표시. */
export function GenerateButton() {
  const [state, action, pending] = useActionState<GenState, FormData>(
    generateAllAction,
    null,
  );
  return (
    <form action={action} className="flex items-center gap-3">
      <Button
        type="submit"
        disabled={pending}
        className="px-4 py-2 text-sm font-normal disabled:opacity-60"
      >
        {pending ? "생성 중…" : "차시 생성 / 갱신"}
      </Button>
      {state && state.ok && (
        <span className="text-sm text-green-700">
          ✅ {state.sections}개 분반 · 신규 {state.generated}차시
          {state.skipped > 0 && ` · 건너뜀 ${state.skipped}(경계 미설정)`}
        </span>
      )}
      {state && !state.ok && (
        <span className="text-sm text-red-700">{state.message}</span>
      )}
    </form>
  );
}
