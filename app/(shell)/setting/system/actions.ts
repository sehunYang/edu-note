"use server";
import { revalidatePath } from "next/cache";
import { getOwnerId } from "@/lib/auth/owner";
import { saveNeisKey, verifyNeisKey, neisKeyInEnv } from "@/lib/config/runtime-key";

/**
 * 시스템 상태 화면의 서버액션 (배포판 S5).
 * 소유자만 실행할 수 있다 — getOwnerId 가 세션과 ALLOWED_EMAIL 을 함께 검사한다.
 */
export async function saveNeisKeyAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  await getOwnerId();

  const raw = String(formData.get("neisKey") ?? "").trim();

  // 비우기는 언제나 허용한다 — 잘못 넣은 값을 앱 안에서 되돌릴 수 있어야 한다.
  if (!raw) {
    await saveNeisKey("");
    revalidatePath("/setting/system");
    return {
      ok: true,
      message: neisKeyInEnv()
        ? "앱에 저장한 인증키를 지웠습니다. 환경변수에 설정된 값으로 돌아갑니다."
        : "인증키를 지웠습니다. 나이스 연동이 꺼집니다.",
    };
  }

  // 저장 전에 실제로 통하는 키인지 NEIS 에 물어본다. 아무 값이나 넣어도 "켜짐"으로
  // 보이면, 교사는 연동이 됐다고 믿고 학사일정이 안 나오는 이유를 못 찾는다.
  const check = await verifyNeisKey(raw);
  if (!check.ok) {
    return {
      ok: false,
      message: `나이스가 이 인증키를 거부했습니다 — ${check.message ?? "사유 불명"}`,
    };
  }

  await saveNeisKey(raw);
  revalidatePath("/setting/system");
  return {
    ok: true,
    message: check.message
      ? `저장했습니다. (${check.message})`
      : "확인했습니다. 학사일정·급식 동기화를 사용할 수 있습니다.",
  };
}
