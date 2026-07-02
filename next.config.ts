import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
