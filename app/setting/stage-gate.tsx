import { completeStageAction, reopenStageAction } from "./actions";
import type { SettingStage } from "@/lib/db/queries";

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
    <div className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-4">
      <p className="text-xs text-neutral-400">
        {completed
          ? "이 단계는 완료되었습니다. 다음 단계로 진행하세요."
          : "이 단계를 완료하면 다음 단계가 해제됩니다."}
      </p>
      {completed ? (
        <form action={reopenStageAction}>
          <input type="hidden" name="stage" value={stage} />
          <button className="rounded-full border border-white/25 px-3 py-1.5 text-xs text-neutral-600 hover:bg-white/10">
            다시 열기
          </button>
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
