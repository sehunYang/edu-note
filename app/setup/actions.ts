"use server";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { isBootstrapped, runBootstrap, type BootstrapResult } from "@/lib/setup/bootstrap";

/**
 * 설치 마법사 서버액션 (배포판 S3).
 *
 * 토큰은 인자로 받아 그대로 흘려보내고 **저장·로그를 남기지 않는다**.
 * 설치가 끝난 배포에서는 어떤 경우에도 실행되지 않는다(이중 가드: 페이지 + 여기).
 */
export async function runSetupAction(formData: FormData): Promise<BootstrapResult> {
  const db = getDb();
  if (await isBootstrapped(db)) {
    return { ok: false, steps: [], message: "이미 설치가 완료된 배포입니다." };
  }

  const token = String(formData.get("accessToken") ?? "");
  if (!token) {
    return { ok: false, steps: [], message: "액세스 토큰을 입력해 주세요." };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  return runBootstrap(db, token, origin);
}
