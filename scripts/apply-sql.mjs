// 커스텀 SQL 마이그레이션(드리즐 저널 외)을 DB 에 직접 적용한다.
// 사용: node --env-file=.env.local scripts/apply-sql.mjs lib/db/migrations/0009_teacher_homeroom.sql
import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = process.argv[2];
if (!file) {
  console.error("usage: apply-sql.mjs <path-to-sql>");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  const text = readFileSync(file, "utf8");
  await sql.unsafe(text);
  console.log(`applied: ${file}`);
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
