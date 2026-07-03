import { redirect } from "next/navigation";

/** 구 경로 호환 리다이렉트 → 담임 교실(/homeroom/attendance). */
export default function AttendanceRedirect() {
  redirect("/homeroom/attendance");
}
