import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 런타임 인증키 해석 테스트 (배포판 S5, 2026-08-31 우선순위 변경).
 *
 * 왜 있는가: Deploy 화면이 나이스 인증키 칸을 강제하던 시절, 임의값을 넣고 배포한
 * 교사가 앱에서 그 값을 고칠 수 없었다(env 가 우선이라 폼이 잠겼다). 우선순위를
 * DB → env 로 뒤집어 해결했고, 그 계약을 여기서 고정한다.
 */
let storedRow: { value: string }[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => storedRow }),
      }),
    }),
  }),
}));

const { resolveNeisKey, neisKeySource, neisKeyInEnv, verifyNeisKey, __resetNeisKeyCache } =
  await import("./runtime-key");

beforeEach(() => {
  storedRow = [];
  delete process.env.NEIS_API_KEY;
  __resetNeisKeyCache();
});

afterEach(() => {
  delete process.env.NEIS_API_KEY;
  vi.unstubAllGlobals();
});

describe("우선순위 — 앱에서 저장한 값이 환경변수를 이긴다", () => {
  it("DB 값이 있으면 env 가 있어도 DB 값을 쓴다", async () => {
    process.env.NEIS_API_KEY = "from-env";
    storedRow = [{ value: "from-app" }];
    expect(await resolveNeisKey()).toBe("from-app");
    expect(await neisKeySource()).toBe("app");
  });

  it("DB 값이 없으면 env 로 폴백한다", async () => {
    process.env.NEIS_API_KEY = "from-env";
    expect(await resolveNeisKey()).toBe("from-env");
    expect(await neisKeySource()).toBe("env");
  });

  it("둘 다 없으면 null", async () => {
    expect(await resolveNeisKey()).toBeNull();
    expect(await neisKeySource()).toBe("none");
  });

  it("DB 값을 비우면 다시 env 값으로 돌아간다 — 앱에서 되돌릴 수 있어야 한다", async () => {
    process.env.NEIS_API_KEY = "from-env";
    storedRow = [{ value: "from-app" }];
    expect(await resolveNeisKey()).toBe("from-app");

    storedRow = [];
    __resetNeisKeyCache(); // 저장 액션이 하는 일
    expect(await resolveNeisKey()).toBe("from-env");
  });

  it("공백만 저장된 행은 없는 것으로 본다", async () => {
    process.env.NEIS_API_KEY = "from-env";
    storedRow = [{ value: "   " }];
    expect(await resolveNeisKey()).toBe("from-env");
  });

  it("neisKeyInEnv 는 환경변수 유무만 알려준다(안내 문구용)", () => {
    expect(neisKeyInEnv()).toBe(false);
    process.env.NEIS_API_KEY = "x";
    expect(neisKeyInEnv()).toBe(true);
  });
});

describe("verifyNeisKey — 아무 값이나 '켜짐'으로 보이면 안 된다", () => {
  const stubFetch = (body: unknown, ok = true, status = 200) =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok, status, json: async () => body }),
    );

  it("실측된 거부 응답(ERROR-290)을 잡아낸다", async () => {
    // 2026-08-31 실제 NEIS 응답: HTTP 200 + RESULT.CODE=ERROR-290
    stubFetch({
      RESULT: { CODE: "ERROR-290", MESSAGE: "인증키가 유효하지 않습니다." },
    });
    const r = await verifyNeisKey("1234567890");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("인증키가 유효하지 않습니다");
  });

  it("정상 키는 통과시킨다", async () => {
    stubFetch({ schoolInfo: [{ head: [{ RESULT: { CODE: "INFO-000" } }] }] });
    expect((await verifyNeisKey("valid-key")).ok).toBe(true);
  });

  it("데이터가 없어도(INFO-200) 키 자체는 유효한 것으로 본다", async () => {
    stubFetch({ RESULT: { CODE: "INFO-200", MESSAGE: "데이터가 없습니다." } });
    expect((await verifyNeisKey("valid-key")).ok).toBe(true);
  });

  it("네트워크 실패로 확인을 못 하면 저장을 막지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await verifyNeisKey("k");
    expect(r.ok).toBe(true);
    expect(r.message).toContain("확인하지 못했습니다");
  });

  it("HTTP 오류는 거부한다", async () => {
    stubFetch({}, false, 503);
    expect((await verifyNeisKey("k")).ok).toBe(false);
  });
});
