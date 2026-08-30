// SQL 파일 하나를 DB 에 직접 적용한다. 버전 추적 없음.
//
// ⚠ 마이그레이션 적용의 정석은 이제 `npm run db:migrate`(scripts/migrate.mjs) 다.
//   그쪽은 schema_migrations 에 기록하고, 빌드 단계에서 자동 실행되며, 중복 적용을
//   막는다. 이 스크립트로 적용하면 **기록이 남지 않아** 다음 자동 실행이 같은 파일을
//   다시 적용하려 한다. 임시 SQL 을 한 번 던질 때만 쓴다.
//
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
