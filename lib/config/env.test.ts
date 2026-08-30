import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  databaseUrl,
  publicDatabaseUrl,
  supabaseSecretKey,
  allowedEmail,
  neisApiKey,
  googleOAuth,
  cronSecret,
  siteUrl,
} from "./env";
import { googleTokenEncKey, deriveKey } from "./derive";

/**
 * 환경변수 어댑터 테스트 (배포판 S2).
 *
 * 이 파일이 지키는 것은 두 가지다.
 *  1) Vercel Marketplace 로 Supabase 를 붙였을 때 주입되는 **다른 이름**을 읽는가.
 *     (못 읽으면 원클릭 배포가 부팅부터 실패한다)
 *  2) 기존 이름이 항상 **먼저** 이긴다. 이미 운영 중인 배포가 영향을 받으면 안 된다(AC-9).
 */

const KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "PUBLIC_DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "ALLOWED_EMAIL",
  "OWNER_EMAIL",
  "NEIS_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_TOKEN_ENC_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("databaseUrl — 이름 폴백", () => {
  it("기존 이름(DATABASE_URL)이 Marketplace 이름보다 우선", () => {
    process.env.DATABASE_URL = "postgres://existing";
    process.env.POSTGRES_URL = "postgres://marketplace";
    expect(databaseUrl()).toBe("postgres://existing");
  });

  it("Marketplace 만 있어도 찾는다 — 원클릭 배포의 기본 상황", () => {
    process.env.POSTGRES_URL = "postgres://marketplace";
    expect(databaseUrl()).toBe("postgres://marketplace");
  });

  it("직결 URL 만 있어도 동작한다", () => {
    process.env.POSTGRES_URL_NON_POOLING = "postgres://direct";
    expect(databaseUrl()).toBe("postgres://direct");
  });

  it("아무것도 없으면 null — 호출부가 안내 메시지로 실패시킨다", () => {
    expect(databaseUrl()).toBeNull();
  });

  it("빈 문자열·공백은 미설정으로 본다", () => {
    process.env.DATABASE_URL = "   ";
    process.env.POSTGRES_URL = "postgres://mp";
    expect(databaseUrl()).toBe("postgres://mp");
  });
});

describe("publicDatabaseUrl — 공개 페이지 전용", () => {
  it("전용 값이 있으면 그것을 쓴다(앱 표면과 분리)", () => {
    process.env.PUBLIC_DATABASE_URL = "postgres://public";
    process.env.DATABASE_URL = "postgres://app";
    expect(publicDatabaseUrl()).toBe("postgres://public");
  });

  it("전용 값이 없으면 앱 URL 로 폴백(현행 동작 유지)", () => {
    process.env.DATABASE_URL = "postgres://app";
    expect(publicDatabaseUrl()).toBe("postgres://app");
  });
});

describe("supabaseSecretKey — 키 체계 두 벌", () => {
  it("기존 service_role 이름이 우선", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy";
    process.env.SUPABASE_SECRET_KEY = "new";
    expect(supabaseSecretKey()).toBe("legacy");
  });

  it("신규 secret 이름만 있어도 찾는다", () => {
    process.env.SUPABASE_SECRET_KEY = "new";
    expect(supabaseSecretKey()).toBe("new");
  });
});

describe("allowedEmail — 신뢰 기준점", () => {
  it("ALLOWED_EMAIL 우선, OWNER_EMAIL 도 허용", () => {
    process.env.OWNER_EMAIL = "b@b.com";
    expect(allowedEmail()).toBe("b@b.com");
    process.env.ALLOWED_EMAIL = "a@a.com";
    expect(allowedEmail()).toBe("a@a.com");
  });

  it("미설정이면 null — 호출부는 통과가 아니라 차단해야 한다", () => {
    expect(allowedEmail()).toBeNull();
  });
});

describe("선택 연동", () => {
  it("neisApiKey 는 없으면 null(기능만 꺼진다)", () => {
    expect(neisApiKey()).toBeNull();
    process.env.NEIS_API_KEY = "k";
    expect(neisApiKey()).toBe("k");
  });

  it("googleOAuth 는 id·secret 둘 다 있어야 성립", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    expect(googleOAuth()).toBeNull();
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(googleOAuth()).toEqual({ clientId: "id", clientSecret: "secret" });
  });

  it("cronSecret 은 선택 — 없으면 null", () => {
    expect(cronSecret()).toBeNull();
  });
});

describe("googleTokenEncKey — 명시 우선, 없으면 파생", () => {
  const valid32 = Buffer.alloc(32, 7).toString("base64");

  it("명시 env 가 있으면 그대로 쓴다 — 이미 그 키로 암호화된 토큰이 있다(AC-9)", () => {
    process.env.GOOGLE_TOKEN_ENC_KEY = valid32;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "root";
    expect(googleTokenEncKey()?.toString("base64")).toBe(valid32);
  });

  it("명시 env 길이가 32바이트가 아니면 조용히 넘어가지 않고 던진다", () => {
    process.env.GOOGLE_TOKEN_ENC_KEY = Buffer.alloc(16).toString("base64");
    expect(() => googleTokenEncKey()).toThrow(/32바이트/);
  });

  it("명시 env 가 없으면 서버 시크릿에서 32바이트를 파생한다", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "root-secret";
    const key = googleTokenEncKey();
    expect(key).not.toBeNull();
    expect(key!.length).toBe(32);
  });

  it("파생은 결정적이다 — 재배포해도 같은 키가 나와야 복호화가 된다", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "root-secret";
    const a = googleTokenEncKey()!.toString("hex");
    const b = googleTokenEncKey()!.toString("hex");
    expect(a).toBe(b);
  });

  it("루트 시크릿이 다르면 파생 키도 다르다", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "root-a";
    const a = googleTokenEncKey()!.toString("hex");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "root-b";
    const b = googleTokenEncKey()!.toString("hex");
    expect(a).not.toBe(b);
  });

  it("파생할 루트가 하나도 없으면 null", () => {
    expect(googleTokenEncKey()).toBeNull();
  });

  it("deriveKey 는 info 가 다르면 다른 키를 낸다(용도 분리)", () => {
    const a = deriveKey("root", "purpose-a").toString("hex");
    const b = deriveKey("root", "purpose-b").toString("hex");
    expect(a).not.toBe(b);
    expect(deriveKey("root", "purpose-a").length).toBe(32);
  });
});

describe("siteUrl — 배포마다 도메인이 다르다", () => {
  it("명시 설정이 최우선", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://my.example.com";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "auto.vercel.app";
    expect(siteUrl()).toBe("https://my.example.com");
  });

  it("Vercel 이 주는 도메인을 https 로 만들어 쓴다", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "edu-note.vercel.app";
    expect(siteUrl()).toBe("https://edu-note.vercel.app");
  });

  it("끝 슬래시는 제거한다 — 경로를 이어붙일 때 //가 되면 안 된다", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://my.example.com/";
    expect(siteUrl()).toBe("https://my.example.com");
  });

  it("아무것도 없으면 null", () => {
    expect(siteUrl()).toBeNull();
  });
});
