import { redirect } from "next/navigation";

/** 학사일정·급식은 세팅실(학사 일정 + 키워드)로 이관됨 — 진입 시 리다이렉트. */
export default function CalendarPage() {
  redirect("/setting/calendar");
}
