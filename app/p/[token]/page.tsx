import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicPage } from "@/lib/public/get-public-page";
import { CoveLight } from "@/app/ui/cove-light";
import { GoneNotice } from "./gone";
import { PublicPageView } from "./public-page-view";

/**
 * 공개 학생 안내 페이지 `/p/[token]` (QC v3 Part B, US-B13, AC-12.x).
 *
 * 단일 `get_public_page(token)` 어댑터만 사용한다. 응답은 allowlist DTO 로
 * 사전집계된 값뿐(사유텍스트·원점수·타 학생 데이터 없음). 폐기=410, 만료=410,
 * 없음=404. 검색엔진 비색인(noindex) 강제. 쓰기(선택과목 자가매핑·상담신청)는
 * 토큰 스코프 서버액션(actions.ts → lib/public/student-write)으로만 수행한다.
 */

// 토큰 페이지는 항상 동적(캐시 금지) + 비색인.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "학생 안내",
  robots: { index: false, follow: false },
};

export default async function PublicStudentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getPublicPage(token);

  if (result.status === "not_found") notFound();
  // 코브 조명은 정상·gone 분기 각각에 삽입(공통 최상위 없음). 404는 미적용(수용).
  if (result.status === "revoked")
    return (
      <>
        <CoveLight />
        <GoneNotice reason="revoked" />
      </>
    );
  if (result.status === "expired")
    return (
      <>
        <CoveLight />
        <GoneNotice reason="expired" />
      </>
    );

  return (
    <>
      <CoveLight />
      <PublicPageView token={token} payload={result.payload} />
    </>
  );
}
