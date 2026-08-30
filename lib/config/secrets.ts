import "server-only";
import webpush from "web-push";
import { eq, sql as sqlTag } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { allowedEmail } from "./env";

/**
 * 앱이 스스로 만들어 쓰는 시크릿 (배포판 S2).
 *
 * 배포판에서 교사가 채우는 칸은 이메일과 NEIS 키 두 개뿐이다. VAPID 키쌍은
 * `npx web-push generate-vapid-keys` 를 돌려야 나오는 값이라 물을 수가 없다.
 * 그래서 최초 필요 시점에 앱이 직접 만들어 app_secrets(0063)에 저장한다.
 *
 * 우선순위는 **env → DB → 생성** 이다. env 를 먼저 보는 이유는 이미 VAPID env 로
 * 운영 중인 배포 때문이다(AC-9): 키쌍이 바뀌면 기존 구독이 전부 무효가 된다.
 */
type DB = PostgresJsDatabase<typeof schema>;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const VAPID_ROW_KEY = "vapid";

// 한 번 확정되면 프로세스 수명 동안 재조회하지 않는다(발송마다 DB 왕복 방지).
let cached: VapidKeys | null = null;

/**
 * 발신자 식별용 subject. web-push 는 mailto: 또는 https URL 을 요구한다.
 * 소유자 이메일이 있으면 그것을 쓰고, 없으면 규격만 맞춘 자리표시자를 쓴다
 * (푸시 서비스는 이 값으로 문제 발생 시 연락할 뿐 검증하지 않는다).
 */
function resolveSubject(): string {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit) return explicit;
  const email = allowedEmail();
  return email ? `mailto:${email}` : "mailto:edu-note@example.invalid";
}

/**
 * VAPID 키쌍을 얻는다. 없으면 만들어 저장한다.
 *
 * 동시 생성 경합: 키쌍을 **한 행에 JSON 으로** 넣고 `on conflict do nothing` →
 * 재조회한다. 두 요청이 동시에 만들어도 먼저 커밋한 쪽의 키쌍을 둘 다 쓴다.
 * (공개키/개인키를 두 행으로 나누면 서로 다른 쌍이 섞일 수 있다.)
 *
 * DB 에 접근할 수 없으면 null — 호출부는 푸시를 조용히 끈다(무해성 원칙).
 */
export async function getOrCreateVapidKeys(db: DB): Promise<VapidKeys | null> {
  if (cached) return cached;

  const subject = resolveSubject();

  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPublic && envPrivate) {
    cached = { publicKey: envPublic, privateKey: envPrivate, subject };
    return cached;
  }

  try {
    const stored = await readRow(db);
    if (stored) {
      cached = { ...stored, subject };
      return cached;
    }

    const generated = webpush.generateVAPIDKeys();
    await db
      .insert(schema.appSecrets)
      .values({
        key: VAPID_ROW_KEY,
        value: JSON.stringify({
          publicKey: generated.publicKey,
          privateKey: generated.privateKey,
        }),
      })
      .onConflictDoNothing();

    // 경합에서 졌을 수도 있으므로 반드시 다시 읽는다.
    const settled = (await readRow(db)) ?? {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
    };
    cached = { ...settled, subject };
    return cached;
  } catch {
    // DB 접근 실패는 푸시 기능만 끄면 되는 문제다. 앱을 무너뜨리지 않는다.
    return null;
  }
}

async function readRow(
  db: DB,
): Promise<{ publicKey: string; privateKey: string } | null> {
  const [row] = await db
    .select({ value: schema.appSecrets.value })
    .from(schema.appSecrets)
    .where(eq(schema.appSecrets.key, VAPID_ROW_KEY))
    .limit(1);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as { publicKey?: string; privateKey?: string };
    if (parsed.publicKey && parsed.privateKey) {
      return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
    }
  } catch {
    // 손상된 행은 없는 것으로 취급 — 아래에서 새로 만든다.
  }
  return null;
}

/** 클라이언트에 내려줄 공개키만. 개인키는 이 경로로 절대 나가지 않는다. */
export async function getVapidPublicKey(db: DB): Promise<string> {
  const keys = await getOrCreateVapidKeys(db);
  return keys?.publicKey ?? "";
}

/** 테스트 전용 — 모듈 캐시 초기화. */
export function __resetVapidCache(): void {
  cached = null;
}

/**
 * "오늘 이 작업을 처음 돌리는가"를 원자적으로 확정한다. 처음이면 true.
 *
 * 왜 필요한가: 배포판에는 CRON_SECRET 입력칸이 없어서, 시크릿 없이 도는 크론은
 * user-agent 만으로 판정한다(약한 인증, 외부에서 흉내낼 수 있음). 이 가드가 있으면
 * 흉내를 내도 **하루 한 번을 넘길 수 없어** 푸시 스팸 경로가 닫힌다.
 *
 * `where value is distinct from excluded.value` 덕분에 같은 날짜로는 UPDATE 가
 * 일어나지 않아 returning 이 비고, 두 번째 호출부터 false 가 된다. 단일 문장이라
 * 동시 호출에도 정확히 하나만 true 를 받는다.
 */
export async function claimDailyRun(
  db: DB,
  jobKey: string,
  date: string,
): Promise<boolean> {
  const key = `cron:${jobKey}:last-run`;
  const rows = await db.execute(sqlTag`
    insert into app_secrets (key, value) values (${key}, ${date})
    on conflict (key) do update set value = excluded.value
    where app_secrets.value is distinct from excluded.value
    returning key`);
  return (rows as unknown as unknown[]).length > 0;
}
