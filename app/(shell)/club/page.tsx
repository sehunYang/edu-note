import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * 구 평면 동아리 라우트 (QC v5 c9 D.2/R9). 동아리실 허브(/clubroom)로 이관됨 —
 * 기존 /club 링크 호환을 위해 redirect 만 남긴다.
 */
export default function ClubLegacyPage() {
  redirect("/clubroom");
}
