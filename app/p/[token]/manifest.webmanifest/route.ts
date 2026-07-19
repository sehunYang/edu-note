import { NextResponse } from "next/server";

/**
 * 학생 공개 페이지 전용 PWA manifest `/p/[token]/manifest.webmanifest`.
 *
 * 전역 manifest(public/manifest.webmanifest)는 start_url이 교사용 /today 라서, 학생이
 * 자기 토큰 페이지에서 설치하면 로그인 화면으로 떨어진다. 루트 레이아웃의
 * 인라인 스크립트가 /p/<token> 경로에서 manifest <link>를 이 라우트로
 * 교체해, 설치된 앱이 항상 본인 토큰 페이지로 열리게 한다.
 *
 * - id/start_url/scope 전부 /p/<token> — 학생마다 별개 앱으로 설치되고,
 *   교사용 앱(id "/?app")과도 충돌하지 않는다.
 * - DB 조회 없음: 토큰 실존 검증은 페이지 진입 시 get_public_page가 담당하고,
 *   여기서는 형식(hex 32자)만 검증한다. manifest 자체는 비밀이 아니며
 *   미들웨어 /p/* IP 레이트리밋은 동일하게 적용된다.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // 토큰은 DB 기본값 encode(gen_random_bytes(16),'hex') — 소문자 hex 32자.
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const path = `/p/${token}`;
  return NextResponse.json(
    {
      id: path,
      name: "Edu_Note",
      short_name: "Edu_Note",
      description: "학생 안내 페이지 — 시간표·일정·안내를 한곳에서",
      start_url: path,
      scope: path,
      display: "standalone",
      theme_color: "#0a0a0a",
      background_color: "#0a0a0a",
      icons: [
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
