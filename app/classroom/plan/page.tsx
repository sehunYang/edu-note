import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * 수업 계획실 진입 (QC v4 US-2). 2단계(학기계획→차시계획)로 분리되어, 진입 시
 * 학기계획 단계로 보낸다. `?semester` 쿼리는 그대로 전달한다.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string }>;
}) {
  const sp = await searchParams;
  const qs = sp.semester ? `?semester=${sp.semester}` : "";
  redirect(`/classroom/plan/semester${qs}`);
}
