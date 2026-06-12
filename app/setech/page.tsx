import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** 세특 내보내기는 교실(/classroom/setech)로 이관되었다. (QC v2 2-2) */
export default function SetechRedirect() {
  redirect("/classroom/setech");
}
