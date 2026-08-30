import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicPage } from "@/lib/public/get-public-page";
import { CoveLight } from "@/app/ui/cove-light";
import { GoneNotice } from "./gone";
import { PublicPageView } from "./public-page-view";
import { getDb } from "@/lib/db";
import { getVapidPublicKey } from "@/lib/config/secrets";

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

/**
 * 설명 요소(제목·description·og)는 전부 정적이다 — 학생 이름·반 같은 개인정보를
 * 넣지 않는다. 토큰 링크는 카카오톡 등으로 전달되고 메신저 크롤러가 이 태그를
 * 읽어 미리보기 카드를 만드는데, 여기에 이름이 들어가면 링크가 잘못 흘러갔을 때
 * 페이지를 열기도 전에 누구 것인지 드러난다. 카드에는 "무엇을 보는 페이지인지"
 * 까지만 담고, 개인 정보는 토큰 검증 뒤 본문에서만 노출한다.
 */
const STUDENT_PAGE_DESCRIPTION =
  "시간표·학사일정·급식·출결·상담을 한곳에서 확인하는 학생 전용 안내 페이지입니다.";

export const metadata: Metadata = {
  title: "학생 안내",
  description: STUDENT_PAGE_DESCRIPTION,
  // 루트에서 이미 noindex 지만, 유출 시 피해가 가장 큰 경로라 여기서 다시 못 박고
  // 검색엔진 캐시(스냅샷) 저장까지 막는다.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  openGraph: {
    type: "website",
    siteName: "Edu_Note",
    locale: "ko_KR",
    title: "학생 안내 · Edu_Note",
    description: STUDENT_PAGE_DESCRIPTION,
    images: [
      { url: "/icons/icon-512.png", width: 512, height: 512, alt: "Edu_Note" },
    ],
  },
  twitter: {
    card: "summary",
    title: "학생 안내 · Edu_Note",
    description: STUDENT_PAGE_DESCRIPTION,
    images: ["/icons/icon-512.png"],
  },
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
      <PublicPageView
        token={token}
        payload={result.payload}
        vapidKey={await getVapidPublicKey(getDb())}
      />
    </>
  );
}
