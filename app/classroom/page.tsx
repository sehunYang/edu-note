import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** 교실 인덱스 — 기본 탭(수업 계획실)으로 리다이렉트. */
export default function ClassroomIndexPage() {
  redirect("/classroom/plan");
}
