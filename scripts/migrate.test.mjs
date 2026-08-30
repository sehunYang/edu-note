/**
 * 마이그레이션 러너의 순수 로직 테스트 (DB 불필요).
 *
 * 실제 적용/트랜잭션/잠금 동작은 DB 가 있어야 의미가 있으므로
 * `npm run db:migrate:selftest` 로 실DB에서 검증한다. 여기서는 빌드를 중단시키는
 * 판단 로직(decideRun)과 목록·체크섬·파괴적 표기를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  checksum,
  listMigrations,
  isDestructive,
  resolveDatabaseUrl,
  decideRun,
  MIGRATIONS_DIR,
} from "./migrate.mjs";

describe("checksum", () => {
  it("같은 내용은 같은 값, 다른 내용은 다른 값", () => {
    expect(checksum("create table a();")).toBe(checksum("create table a();"));
    expect(checksum("create table a();")).not.toBe(checksum("create table b();"));
  });

  it("공백 한 칸 차이도 잡아낸다 — 적용 후 파일 수정 탐지가 목적", () => {
    expect(checksum("select 1;")).not.toBe(checksum("select 1; "));
  });
});

describe("isDestructive", () => {
  it("앞부분 주석의 DESTRUCTIVE 표기를 인식", () => {
    expect(isDestructive("-- 0099_x.sql — DESTRUCTIVE: 컬럼 삭제\ndrop ...")).toBe(true);
  });

  it("표기가 없으면 false", () => {
    expect(isDestructive("-- 평범한 마이그레이션\ncreate table t();")).toBe(false);
  });

  it("본문 한참 뒤에 나오는 단어는 무시 — 헤더 표기만 인정", () => {
    const text = "-- 헤더\n" + "x\n".repeat(400) + "-- DESTRUCTIVE";
    expect(isDestructive(text)).toBe(false);
  });
});

describe("listMigrations", () => {
  it("파일명 오름차순으로 반환하고 .sql 만 포함한다", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mig-"));
    writeFileSync(path.join(dir, "0002_b.sql"), "select 2;");
    writeFileSync(path.join(dir, "0001_a.sql"), "select 1;");
    writeFileSync(path.join(dir, "0010_c.sql"), "select 10;");
    writeFileSync(path.join(dir, "readme.md"), "무시되어야 함");
    mkdirSync(path.join(dir, "meta"));
    writeFileSync(path.join(dir, "meta", "_journal.json"), "{}");

    const got = listMigrations(dir);
    expect(got.map((m) => m.version)).toEqual(["0001_a", "0002_b", "0010_c"]);
  });

  it("0 패딩 덕분에 문자열 정렬이 곧 번호 순서다 (0009 < 0010)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mig-"));
    writeFileSync(path.join(dir, "0010_ten.sql"), "select 10;");
    writeFileSync(path.join(dir, "0009_nine.sql"), "select 9;");
    expect(listMigrations(dir).map((m) => m.version)).toEqual(["0009_nine", "0010_ten"]);
  });

  it("실제 리포의 마이그레이션을 읽을 수 있고 0000 이 첫 번째다", () => {
    const all = listMigrations(MIGRATIONS_DIR);
    expect(all.length).toBeGreaterThan(50);
    expect(all[0].version).toBe("0000_init_full_schema");
    // version 중복은 곧 기록 충돌 — 절대 없어야 한다.
    expect(new Set(all.map((m) => m.version)).size).toBe(all.length);
  });
});

describe("resolveDatabaseUrl", () => {
  it("DDL 안정성을 위해 직결(non-pooling)을 풀러보다 먼저 고른다", () => {
    expect(
      resolveDatabaseUrl({
        POSTGRES_URL_NON_POOLING: "postgres://direct",
        DATABASE_URL: "postgres://pooler",
        POSTGRES_URL: "postgres://mp",
      }),
    ).toBe("postgres://direct");
  });

  it("명시적 MIGRATE_DATABASE_URL 이 최우선", () => {
    expect(
      resolveDatabaseUrl({
        MIGRATE_DATABASE_URL: "postgres://explicit",
        POSTGRES_URL_NON_POOLING: "postgres://direct",
      }),
    ).toBe("postgres://explicit");
  });

  it("Marketplace 가 주입하는 POSTGRES_URL 만 있어도 찾는다", () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: "postgres://mp" })).toBe("postgres://mp");
  });

  it("아무것도 없으면 null", () => {
    expect(resolveDatabaseUrl({})).toBeNull();
  });
});

describe("decideRun", () => {
  it("프리뷰 빌드는 운영 스키마를 건드리지 않는다", () => {
    const d = decideRun({ VERCEL_ENV: "preview", DATABASE_URL: "postgres://x" });
    expect(d.run).toBe(false);
    expect(d.fail).toBeFalsy();
  });

  it("Vercel development 빌드도 건너뛴다", () => {
    expect(decideRun({ VERCEL_ENV: "development", DATABASE_URL: "postgres://x" }).run).toBe(
      false,
    );
  });

  it("프로덕션 + 접속정보 → 실행", () => {
    const d = decideRun({ VERCEL_ENV: "production", DATABASE_URL: "postgres://x" });
    expect(d.run).toBe(true);
    expect(d.url).toBe("postgres://x");
  });

  it("프로덕션인데 접속정보가 없으면 조용히 넘어가지 않고 빌드를 실패시킨다", () => {
    // 조용히 통과시키면 스키마 없는 DB 위에 앱이 떠서 전 페이지가 500 이 된다.
    const d = decideRun({ VERCEL_ENV: "production" });
    expect(d.run).toBe(false);
    expect(d.fail).toBe(true);
    expect(d.reason).toContain("Redeploy");
  });

  it("Vercel 이 아니고 접속정보도 없으면 그냥 건너뛴다 (로컬/CI 보호)", () => {
    const d = decideRun({});
    expect(d.run).toBe(false);
    expect(d.fail).toBeFalsy();
  });

  it("로컬에서 접속정보가 있으면 실행 — db:migrate 수동 실행 경로", () => {
    expect(decideRun({ DATABASE_URL: "postgres://x" }).run).toBe(true);
  });
});
