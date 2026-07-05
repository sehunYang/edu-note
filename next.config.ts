import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 클라이언트 라우터 캐시(지연 개선 ④): 최근 방문한 동적 페이지를 30초간 재사용 —
    // 뒤로가기·재방문이 서버 왕복 없이 즉시 표시된다(기본값 0 = 매번 재요청).
    // 30초 내 데이터 변경은 서버액션의 revalidatePath 가 해당 경로 캐시를 무효화하므로
    // 본인 조작에 의한 변경은 즉시 반영된다(단일 사용자 앱이라 타인 변경 시나리오 없음).
    staleTimes: { dynamic: 30 },
  },
  // 공개 페이지는 검색엔진 비색인. 전역 보안 헤더.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 클릭재킹 방지 — 이 앱은 어디에도 iframe 삽입될 이유가 없다.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        // 학생 공개 토큰 페이지는 절대 색인 금지 (계획 §3.2)
        source: "/p/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
