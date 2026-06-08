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
    include: ["lib/**/*.test.ts"],
  },
});
