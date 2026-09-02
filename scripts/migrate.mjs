#!/usr/bin/env node
/**
 * 마이그레이션 자동 러너 (배포판 S1).
 *
 * 왜 필요한가: 배포판은 교사가 GitHub "Merge" 한 번으로 업데이트한다. 그때 스키마가
 * 저절로 따라오지 않으면 새 코드가 옛 스키마 위에 올라간다. 그래서 빌드 단계에서
 * 미적용 마이그레이션을 자동 적용하고, 실패하면 **배포를 중단**한다(fail-closed).
 *
 * 설계 결정
 *  - 버전 추적: schema_migrations(version pk, checksum, applied_at).
 *  - 파일 단위 트랜잭션. 전체를 한 트랜잭션으로 묶을 수 없다 — 0013 이 enum 값을
 *    추가하고 0014 가 그 값을 쓰는데, 같은 트랜잭션이면 "unsafe use of new value of
 *    enum" 으로 실패한다(0013 파일 주석 참조).
 *  - 잠금: pg_advisory_xact_lock (트랜잭션 스코프). 세션 스코프 pg_advisory_lock 은
 *    Supabase 트랜잭션 풀러(6543)에서 statement 마다 서버 커넥션이 바뀔 수 있어
 *    신뢰할 수 없다. 트랜잭션 스코프는 풀러에서도 안전하다.
 *    잠금 안에서 적용 여부를 다시 확인하므로, 동시 빌드 2개가 같은 파일을 두 번
 *    적용하지 않는다. 두 러너가 같은 순서로 돌기 때문에 순서도 보존된다.
 *  - checksum 불일치(이미 적용된 파일이 나중에 수정됨)는 경고가 아니라 **중단**이다.
 *    적용된 SQL 과 리포의 SQL 이 다르면 이후 모든 추론이 무너진다.
 *
 * 사용
 *   node --env-file=.env.local scripts/migrate.mjs            # 미적용분 적용
 *   node --env-file=.env.local scripts/migrate.mjs --dry-run  # 조회만(쓰기 없음)
 *   node --env-file=.env.local scripts/migrate.mjs --baseline # 전부 '적용됨'으로 기록만
 *   node --env-file=.env.local scripts/migrate.mjs --self-test # 기계장치 검증(스크래치 테이블)
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** 이 프로젝트 전용 advisory lock 키. 'edun' 의 ASCII. 다른 앱과 충돌하지 않는다. */
export const LOCK_KEY = 0x6564756e;

export const MIGRATIONS_DIR = fileURLToPath(
  new URL("../lib/db/migrations/", import.meta.url),
);

/**
 * 파일 내용의 SHA-256 앞 16자. 적용 후 파일이 바뀌었는지 판별하는 용도.
 *
 * ⚠ 줄바꿈을 정규화한 뒤 해시한다. 그러지 않으면 **플랫폼마다 다른 값**이 나온다 —
 * Windows 체크아웃은 CRLF, Linux(Vercel 빌드)는 LF 라서 같은 파일이 다른 해시를
 * 갖는다. 실제로 이것 때문에 Windows 에서 baseline 을 기록한 뒤 Vercel 빌드가
 * "28개가 바뀌었습니다" 로 계속 실패했다(2026-09-02). 파일 내용의 정체성은
 * 줄바꿈 방식과 무관해야 한다.
 */
export function checksum(text) {
  return hash(text.replace(/\r\n/g, "\n"));
}

/**
 * 정규화 이전 방식. Windows 에서 기록된 옛 체크섬을 알아보기 위해서만 쓴다 —
 * 같은 내용인데 줄바꿈만 다른 경우를 '변경됨' 으로 오판하지 않기 위한 이행 장치.
 */
export function legacyChecksum(text) {
  return hash(text);
}

function hash(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/**
 * 마이그레이션 목록을 파일명 오름차순으로 반환. `meta/`(드리즐 저널)는 .sql 이
 * 아니라 자연히 제외된다. version = 파일명에서 .sql 을 뗀 것(예: 0013_event_kind_add_values).
 */
export function listMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => {
      const text = readFileSync(path.join(dir, file), "utf8");
      return {
        version: file.replace(/\.sql$/, ""),
        file,
        text,
        checksum: checksum(text),
        destructive: isDestructive(text),
      };
    });
}

/**
 * 파괴적 변경 표기. 앞부분 주석에 DESTRUCTIVE 가 있으면 참.
 * 데이터가 사라질 수 있는 마이그레이션은 릴리스 노트와 백업 안내가 필요하다.
 */
export function isDestructive(text) {
  return /^\s*--.*DESTRUCTIVE/im.test(text.slice(0, 600));
}

/** 마이그레이션 접속 URL. DDL 이라 풀러보다 직결을 선호한다. */
export function resolveDatabaseUrl(env = process.env) {
  return (
    env.MIGRATE_DATABASE_URL ||
    env.POSTGRES_URL_NON_POOLING ||
    env.DATABASE_URL ||
    env.POSTGRES_URL ||
    null
  );
}

/**
 * 이 실행에서 마이그레이션을 돌려야 하는가.
 * - 프리뷰/개발 빌드는 건너뛴다. 프리뷰 빌드가 운영 DB 스키마를 바꾸면 안 된다.
 * - Vercel 프로덕션 빌드인데 DB 접속정보가 없으면 **실패**시킨다. 조용히 넘어가면
 *   스키마 없는 DB 위에 앱이 떠서 전 페이지가 500 이 되고, 교사는 원인을 알 수 없다.
 * - Vercel 이 아니고 접속정보도 없으면 그냥 건너뛴다(로컬 CI 보호).
 */
export function decideRun(env = process.env) {
  const url = resolveDatabaseUrl(env);
  const vercelEnv = env.VERCEL_ENV; // production | preview | development | undefined
  if (vercelEnv && vercelEnv !== "production") {
    return { run: false, reason: `Vercel ${vercelEnv} 빌드 — 운영 스키마를 건드리지 않습니다.` };
  }
  if (!url) {
    if (vercelEnv === "production") {
      return {
        run: false,
        fail: true,
        reason:
          "프로덕션 빌드인데 DB 접속 정보가 없습니다.\n" +
          "  Supabase 통합이 아직 준비되지 않았을 수 있습니다. 잠시 후 Vercel 에서 Redeploy 하세요.\n" +
          "  (확인한 변수: MIGRATE_DATABASE_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL, POSTGRES_URL)",
      };
    }
    return { run: false, reason: "DB 접속 정보가 없어 건너뜁니다(로컬/CI)." };
  }
  return { run: true, url };
}

/**
 * RLS 를 켜되 정책은 만들지 않는다 = anon/authenticated 전면 차단.
 * 이 앱은 전 테이블 RLS 가 원칙이고, PostgREST 는 public 스키마의 테이블을 anon 키로
 * 노출하므로 켜두지 않으면 스키마 버전·파일명이 밖에서 읽힌다. 러너는 테이블 소유자
 * 커넥션이라 RLS 에 막히지 않고, 앱(S5 시스템 상태)은 service role 로 읽는다.
 */
const CREATE_TABLE_SQL = `
create table if not exists schema_migrations (
  version    text primary key,
  checksum   text not null,
  applied_at timestamptz not null default now()
);
alter table schema_migrations enable row level security;`;

/** 로그 — 빌드 로그에서 눈에 띄도록 접두사를 붙인다. */
const log = (msg) => console.log(`[migrate] ${msg}`);

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const baseline = argv.includes("--baseline");
  const selfTest = argv.includes("--self-test");

  const decision = decideRun();
  if (!decision.run) {
    if (decision.fail) {
      console.error(`[migrate] 중단: ${decision.reason}`);
      process.exit(1);
    }
    log(decision.reason);
    return;
  }

  const { default: postgres } = await import("postgres");
  // prepare:false — Supabase 트랜잭션 풀러는 prepared statement 를 지원하지 않는다.
  // max:1 — 순차 적용이므로 커넥션 하나면 충분하고, 잠금 동작이 단순해진다.
  const sql = postgres(decision.url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    // NOTICE 를 그대로 두면 객체가 통째로 빌드 로그에 찍힌다. 한 줄로 줄인다.
    onnotice: (n) => log(`notice: ${n.message}`),
  });

  try {
    if (selfTest) {
      await runSelfTest(sql);
      return;
    }

    await sql.unsafe(CREATE_TABLE_SQL).simple();

    const all = listMigrations();
    const rows = await sql`select version, checksum from schema_migrations`;
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));

    // 이미 적용된 파일이 그 뒤에 수정됐는지 — 발견 시 중단.
    //
    // 다만 '줄바꿈만 다른' 경우는 변경이 아니다. 옛 방식(정규화 전)으로 계산한 값과
    // 일치하면 같은 내용이므로, 실패시키지 않고 기록만 새 방식으로 갱신한다.
    const candidates = all.filter(
      (m) => applied.has(m.version) && applied.get(m.version) !== m.checksum,
    );
    const legacyOnly = candidates.filter(
      (m) => applied.get(m.version) === legacyChecksum(m.text),
    );
    if (legacyOnly.length > 0) {
      if (dryRun) {
        // --dry-run 은 읽기 전용이라고 약속했다. 갱신 대상만 알린다.
        log(
          `체크섬 표기 방식 갱신 대상 ${legacyOnly.length}개 (줄바꿈만 다름 — 내용은 동일). --dry-run 이라 쓰지 않습니다.`,
        );
      } else {
        log(
          `체크섬 표기 방식 갱신: ${legacyOnly.length}개 (줄바꿈만 다름 — 내용은 동일)`,
        );
        for (const m of legacyOnly) {
          await sql`
            update schema_migrations set checksum = ${m.checksum}
            where version = ${m.version}`;
        }
      }
      for (const m of legacyOnly) applied.set(m.version, m.checksum);
    }

    const drifted = candidates.filter(
      (m) => applied.get(m.version) !== m.checksum,
    );
    if (drifted.length > 0) {
      console.error(
        `[migrate] 중단: 이미 적용된 마이그레이션 ${drifted.length}개의 내용이 바뀌었습니다.`,
      );
      for (const m of drifted) console.error(`  - ${m.file}`);
      console.error(
        "  적용된 SQL 과 리포의 SQL 이 다릅니다. 파일을 되돌리거나, 변경분을 새 마이그레이션으로 추가하세요.",
      );
      process.exit(1);
    }

    const pending = all.filter((m) => !applied.has(m.version));

    if (baseline) {
      if (pending.length === 0) {
        log("baseline: 기록할 것이 없습니다(이미 전부 기록됨).");
        return;
      }
      log(`baseline: ${pending.length}개를 '적용됨'으로 기록만 합니다(실행하지 않음).`);
      await sql`
        insert into schema_migrations ${sql(
          pending.map((m) => ({ version: m.version, checksum: m.checksum })),
        )}
        on conflict (version) do nothing`;
      log(`baseline 완료 — 총 ${all.length}개 기록.`);
      return;
    }

    if (pending.length === 0) {
      log(`0 applied — 최신 상태입니다 (적용됨 ${applied.size}/${all.length}).`);
      return;
    }

    log(`대기 ${pending.length}개 / 전체 ${all.length}개`);
    for (const m of pending) {
      log(`  · ${m.file}${m.destructive ? "  ⚠ DESTRUCTIVE" : ""}`);
    }
    if (dryRun) {
      log("--dry-run 이므로 아무것도 적용하지 않았습니다.");
      return;
    }

    let count = 0;
    for (const m of pending) {
      if (m.destructive) {
        log(`⚠ ${m.file} 는 파괴적 변경입니다. 데이터가 사라질 수 있습니다.`);
      }
      await applyOne(sql, m);
      count += 1;
      log(`applied ${m.file}`);
    }
    log(`${count} applied — 완료 (총 ${all.length}개).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * 파일 하나를 트랜잭션 안에서 적용한다.
 *
 * 잠금 → 재확인 → 실행 → 기록 을 한 트랜잭션에 담는다. 재확인이 잠금 안에 있으므로
 * 동시 실행되는 다른 빌드가 이미 적용했다면 여기서 조용히 빠져나간다.
 *
 * 파일 본문은 여러 statement 이므로 simple 프로토콜로 보낸다(.simple()).
 * 명시적 begin/commit 은 쓰지 않는다 — sql.begin() 이 이미 트랜잭션을 연다.
 */
export async function applyOne(sql, m) {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_KEY})`;
    const [already] = await tx`
      select 1 from schema_migrations where version = ${m.version}`;
    if (already) return; // 다른 러너가 방금 적용함
    await tx.unsafe(m.text).simple();
    await tx`
      insert into schema_migrations (version, checksum)
      values (${m.version}, ${m.checksum})`;
  });
}

/**
 * 기계장치 검증 — 실제 스키마를 건드리지 않고 러너의 핵심 경로를 확인한다.
 * (다중 statement + 트랜잭션 + advisory lock + 기록/롤백이 실제 DB 에서 도는지)
 */
async function runSelfTest(sql) {
  const V = "__selftest__";
  log("self-test 시작 — 스크래치 테이블만 사용합니다.");
  await sql.unsafe(CREATE_TABLE_SQL).simple();
  await sql`delete from schema_migrations where version = ${V}`;
  await sql.unsafe(`drop table if exists _migrate_selftest`);

  // 1) 다중 statement 파일이 트랜잭션 안에서 적용되고 기록되는가
  const fake = {
    version: V,
    file: `${V}.sql`,
    checksum: "deadbeefdeadbeef",
    text: `create table _migrate_selftest (id int primary key);
insert into _migrate_selftest values (1);
insert into _migrate_selftest values (2);`,
  };
  await applyOne(sql, fake);
  const [{ count }] = await sql`select count(*)::int as count from _migrate_selftest`;
  if (count !== 2) throw new Error(`self-test 실패: 행 수 ${count} (기대 2)`);
  const [rec] = await sql`select checksum from schema_migrations where version = ${V}`;
  if (!rec) throw new Error("self-test 실패: schema_migrations 기록 없음");
  log("  ✓ 다중 statement 적용 + 버전 기록");

  // 2) 재실행이 두 번 적용하지 않는가 (잠금 안 재확인)
  await applyOne(sql, fake);
  const [{ count: c2 }] = await sql`select count(*)::int as count from _migrate_selftest`;
  if (c2 !== 2) throw new Error(`self-test 실패: 재실행 후 행 수 ${c2} (기대 2)`);
  log("  ✓ 재실행 시 중복 적용 없음");

  // 3) 실패한 마이그레이션이 통째로 롤백되는가 (부분 적용 금지)
  const bad = {
    version: "__selftest_bad__",
    file: "__selftest_bad__.sql",
    checksum: "0000000000000000",
    text: `insert into _migrate_selftest values (3);
insert into _migrate_selftest values (1);`, // pk 충돌 — 두 번째에서 실패
  };
  let threw = false;
  try {
    await applyOne(sql, bad);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("self-test 실패: 오류가 전파되지 않음");
  const [{ count: c3 }] = await sql`select count(*)::int as count from _migrate_selftest`;
  if (c3 !== 2) throw new Error(`self-test 실패: 롤백 안 됨 — 행 수 ${c3} (기대 2)`);
  const [badRec] = await sql`
    select 1 from schema_migrations where version = '__selftest_bad__'`;
  if (badRec) throw new Error("self-test 실패: 실패한 마이그레이션이 기록됨");
  log("  ✓ 실패 시 전체 롤백 + 미기록");

  // 뒷정리
  await sql.unsafe(`drop table if exists _migrate_selftest`);
  await sql`delete from schema_migrations where version in (${V}, '__selftest_bad__')`;
  log("self-test 통과 — 스크래치 정리 완료.");
}

// 직접 실행될 때만 main(). 테스트에서 import 할 때는 돌지 않는다.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`[migrate] 실패: ${e.message}`);
    if (e.query) console.error(`  실행 중이던 SQL: ${String(e.query).slice(0, 200)}`);
    process.exit(1);
  });
}
