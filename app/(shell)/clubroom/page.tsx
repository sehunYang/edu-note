import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** 동아리실 인덱스 — 기본 탭(동아리 개설)으로 리다이렉트. (QC v5 c9 D.1, AC-9.1) */
export default function ClubroomIndexPage() {
  redirect("/clubroom/create");
}
