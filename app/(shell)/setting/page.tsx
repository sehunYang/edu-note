import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** 세팅실 진입 → 첫 단계(학년도)로. */
export default function SettingHome() {
  redirect("/setting/year");
}
