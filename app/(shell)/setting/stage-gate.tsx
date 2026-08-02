import { completeStageAction, reopenStageAction } from "./actions";
import type { SettingStage } from "@/lib/db/queries";
import { Button } from "@/app/ui/button";

/**
 * 단계 완료/재오픈 버튼 (AC-0.1). 각 세팅 단계 하단에 두어 setup_state 를 기록한다.
 * 완료해야 다음 단계 네비가 해제된다.
 */
export function StageGate({
  stage,
  completed,
  disabled,
}: {
  stage: SettingStage;
  completed: boolean;
  disabled?: boolean;
}) {
  return (
    /* 간략화 S-1: 버튼 옆 설명문 삭제. "이 단계 완료 →" 와 상단 StageNav 의 자물쇠가
       같은 말을 이미 하고 있었다. */
    <div className="mt-8 flex items-center justify-end border-t border-neutral-100 pt-4">
      {completed ? (
        <form action={reopenStageAction}>
          <input type="hidden" name="stage" value={stage} />
          <Button className="px-3 py-1.5 text-xs text-neutral-600">
            다시 열기
          </Button>
        </form>
      ) : (
        <form action={completeStageAction}>
          <input type="hidden" name="stage" value={stage} />
          <button
            disabled={disabled}
            className="rounded-md border border-green-600 bg-green-600 px-3 py-1.5 text-xs font-normal text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            이 단계 완료 →
          </button>
        </form>
      )}
    </div>
  );
}
