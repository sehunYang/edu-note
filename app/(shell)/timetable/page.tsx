import { redirect } from "next/navigation";

/** 시간표(동기화·그리드)는 세팅실(수업 관리)로 이관됨 — 진입 시 리다이렉트. */
export default function TimetablePage() {
  redirect("/setting/courses");
}
