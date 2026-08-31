import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // tsconfig 의 "@/*" → 프로젝트 루트. 런타임 값 import(@/lib/...) 해소용.
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // Next 전용 "server-only" 가드를 테스트(node)에서 빈 모듈로 무력화.
      "server-only": fileURLToPath(
        new URL("./lib/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    // scripts/ 도 포함 — 마이그레이션 러너의 순수 로직(목록·체크섬·실행 판단)은
    // DB 없이 검증할 수 있고, 빌드를 중단시키는 코드라 회귀를 잡아야 한다.
    include: ["lib/**/*.test.ts", "scripts/**/*.test.mjs", "app/**/*.test.ts"],
  },
});
