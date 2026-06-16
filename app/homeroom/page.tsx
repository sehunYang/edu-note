import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** 담임 교실 인덱스 — 기본 탭(자율·진로활동)으로 리다이렉트(QC v5 c3). */
export default function HomeroomPage() {
  redirect("/homeroom/activities");
}
