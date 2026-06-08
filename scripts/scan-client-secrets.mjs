#!/usr/bin/env node
/**
 * 클라이언트 번들 시크릿 정적 스캔 (계획 §3.2 CI 게이트, AC).
 *
 * `.next/static`(브라우저로 전송되는 청크)에서 서버 전용 비밀키 값/위험 패턴이
 * 노출됐는지 검사한다. 발견 시 비0 종료(빌드 게이트). 서버 번들(.next/server)은
 * 서버에서만 실행되므로 검사 대상이 아니다.
 *
 * 사용: npm run build && npm run scan:secrets
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_DIR = path.join(root, ".next", "static");

// 서버 전용 env 키(이 값들이 클라 번들에 있으면 유출). NEXT_PUBLIC_* 은 공개 의도라 제외.
const SERVER_ONLY_KEYS = [
  "ANTHROPIC_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "NEIS_API_KEY",
];

// env 값과 무관하게 위험한 리터럴 패턴(키가 비어 있어도 방어).
const RISKY_PATTERNS = [
  { label: "Anthropic 키 접두사", re: /sk-ant-[A-Za-z0-9_-]{8,}/ },
  { label: "Postgres 접속 문자열", re: /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/ },
  { label: "service_role JWT(role 클레임)", re: /"role"\s*:\s*"service_role"/ },
];

/** .env.local 을 단순 파싱(이미 process.env 에 있으면 그쪽 우선). */
function loadEnvLocal() {
  const out = {};
  const file = path.join(root, ".env.local");
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // 따옴표·줄끝 주석 제거(값에 # 가 포함될 수 있으니 따옴표 우선).
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) files.push(...walk(p));
    else if (/\.(js|mjs|css|map|json)$/.test(entry)) files.push(p);
  }
  return files;
}

function main() {
  if (!existsSync(STATIC_DIR)) {
    console.warn(
      "⚠ .next/static 이 없습니다. 먼저 `npm run build` 후 실행하세요. (스캔 스킵)",
    );
    process.exit(0);
  }

  const env = { ...loadEnvLocal(), ...process.env };
  const secretValues = SERVER_ONLY_KEYS.map((k) => ({ key: k, value: env[k] }))
    .filter((x) => x.value && x.value.length >= 8); // 너무 짧은 값은 오탐 방지

  if (secretValues.length === 0) {
    console.warn("⚠ 검사할 서버 시크릿 값이 env 에 없습니다(값 기반 검사 스킵).");
  }

  const files = walk(STATIC_DIR);
  const findings = [];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = path.relative(root, file);
    for (const { key, value } of secretValues) {
      if (text.includes(value)) {
        findings.push(`${rel}: 서버 시크릿 '${key}' 값이 클라 번들에 노출됨`);
      }
    }
    for (const { label, re } of RISKY_PATTERNS) {
      const m = text.match(re);
      if (m) findings.push(`${rel}: 위험 패턴(${label}) — ${m[0].slice(0, 24)}…`);
    }
  }

  console.log(`스캔 완료: ${files.length}개 클라 청크 검사.`);
  if (findings.length > 0) {
    console.error(`\n❌ 시크릿 노출 ${findings.length}건:`);
    for (const f of findings) console.error("  - " + f);
    process.exit(1);
  }
  console.log("✅ 서버 시크릿/위험 패턴 노출 0건.");
  process.exit(0);
}

main();
