"use server";
import { revalidatePath } from "next/cache";
import { getOwnerId } from "@/lib/auth/owner";
import { saveNeisKey, neisKeyIsFromEnv } from "@/lib/config/runtime-key";

/**
 * 시스템 상태 화면의 서버액션 (배포판 S5).
 * 소유자만 실행할 수 있다 — getOwnerId 가 세션과 ALLOWED_EMAIL 을 함께 검사한다.
 */
export async function saveNeisKeyAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  await getOwnerId();

  if (neisKeyIsFromEnv()) {
    return {
      ok: false,
      message:
        "이 배포는 NEIS 키가 환경변수로 고정돼 있습니다. 바꾸려면 Vercel 환경변수를 수정하세요.",
    };
  }

  const raw = String(formData.get("neisKey") ?? "").trim();
  // 지우기(빈 값)는 허용한다 — 잘못 넣은 키를 앱 안에서 되돌릴 수 있어야 한다.
  if (raw && raw.length < 10) {
    return { ok: false, message: "인증키가 너무 짧습니다. 값을 다시 확인해 주세요." };
  }

  await saveNeisKey(raw);
  revalidatePath("/setting/system");
  return {
    ok: true,
    message: raw
      ? "저장했습니다. 학사일정·급식 동기화를 사용할 수 있습니다."
      : "인증키를 지웠습니다. 나이스 연동이 꺼집니다.",
  };
}
