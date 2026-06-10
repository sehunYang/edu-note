import { redirect } from "next/navigation";

/** 학생 명단은 세팅실(학생 명단 관리)로 이관됨 — 진입 시 리다이렉트. */
export default function StudentsPage() {
  redirect("/setting/students");
}
