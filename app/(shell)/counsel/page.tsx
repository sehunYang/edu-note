import { redirect } from "next/navigation";

/** 구 경로 호환 리다이렉트 → 담임 교실(/homeroom/counsel). */
export default function CounselRedirect() {
  redirect("/homeroom/counsel");
}
