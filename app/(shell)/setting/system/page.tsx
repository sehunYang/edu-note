import { readFile } from "node:fs/promises";
import { headers } from "next/headers";
import path from "node:path";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getSystemStatus } from "@/lib/setup/status";
import { NeisKeyForm } from "./neis-key-form";

export const metadata = { title: "시스템 상태" };
export const dynamic = "force-dynamic";

/**
 * 시스템 상태 (배포판 S5).
 *
 * v1 계획의 `--doctor` CLI 를 화면으로 옮긴 것. 교사가 여기서 확인·수정하는 것:
 *  - 어떤 기능이 켜져 있고, 꺼진 기능은 무엇을 넣어야 켜지는지
 *  - **NEIS 인증키를 여기서 직접 등록** (Vercel 대시보드에 갈 일이 없다)
 *  - DB 스키마가 최신인지, 이 배포의 주소가 무엇인지
 *  - 백업 내려받기
 */
async function readVersion(): Promise<string | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "VERSION"), "utf8");
    return raw.trim() || null;
  } catch {
    return null;
  }
}

export default async function SystemPage() {
  await getOwnerId();
  const db = getDb();
  const status = await getSystemStatus(db, await readVersion());

  // siteUrl() 은 env 기반이라 로컬에서 비어 있다. "확인 불가"를 보여주면 교사가
  // 문제로 오해하므로, 지금 접속 중인 주소로 폴백한다.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const shownUrl = status.siteUrl ?? (host ? `${proto}://${host}` : "확인 불가");

  return (
    <div>
      <h2 className="text-lg">시스템 상태</h2>
      <p className="mt-1 text-sm text-neutral-500">
        이 배포의 설정 상태입니다. 문제가 있으면 여기부터 확인하세요.
      </p>

      <section className="mt-6">
        <h3 className="text-sm text-neutral-300">기능</h3>
        <ul className="mt-3 space-y-4">
          <FeatureRow
            on={status.features.neis}
            name="나이스 연동"
            what="학사일정·급식·이번 주 실제 시간표를 자동으로 가져옵니다."
          >
            <NeisKeyForm source={status.neisSource} />
          </FeatureRow>

          <FeatureRow
            on={status.features.google}
            name="구글 캘린더 연동"
            what="오늘의 학교 일정과 구글 캘린더를 양방향으로 맞춥니다."
          >
            {!status.features.google && (
              <p className="mt-2 text-xs text-neutral-500">
                구글 클라우드에서 OAuth 클라이언트를 만들어{" "}
                <code>GOOGLE_CLIENT_ID</code>·<code>GOOGLE_CLIENT_SECRET</code> 을 Vercel
                환경변수에 등록하면 켜집니다. 선택 기능이라 없어도 나머지는 정상입니다.
              </p>
            )}
          </FeatureRow>

          <FeatureRow
            on={status.features.claude}
            name="서버 측 Claude 호출"
            what="세특 작성은 키 없이도 됩니다(코워크 내보내기 방식). 이 항목은 선택입니다."
          />
        </ul>
      </section>

      <section className="mt-8">
        <h3 className="text-sm text-neutral-300">배포 정보</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="이 앱 주소" value={shownUrl} />
          <Row label="데이터베이스" value={status.supabaseUrl || "미설정"} />
          <Row
            label="DB 스키마"
            value={
              status.migrations
                ? `${status.migrations.applied}개 적용됨 (마지막: ${status.migrations.latest ?? "-"})`
                : "확인 불가"
            }
          />
          <Row label="버전" value={status.version ?? "표시 없음"} />
          <Row
            label="설치 마무리"
            value={status.bootstrapped ? "완료" : "미완료 — /setup 에서 마무리하세요"}
          />
          <Row
            label="크론 보안키"
            value={
              status.cronSecretSet
                ? "설정됨"
                : "미설정(기본값) — 필요하면 CRON_SECRET 을 등록해 더 강하게 만들 수 있습니다"
            }
          />
        </dl>
      </section>

      <section className="mt-8">
        <h3 className="text-sm text-neutral-300">백업</h3>
        <p className="mt-1 text-sm text-neutral-500">
          업데이트 전이나 학기 말에 내려받아 두세요. 모든 기록이 JSON 한 파일로 나옵니다.
        </p>
        <a
          href="/api/backup"
          className="mt-3 inline-block rounded-lg border border-hairline px-4 py-2 text-sm hover:bg-white/5"
        >
          백업 내려받기
        </a>
      </section>
    </div>
  );
}

function FeatureRow({
  on,
  name,
  what,
  children,
}: {
  on: boolean;
  name: string;
  what: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="rounded-xl border border-hairline bg-black/20 p-4">
      <div className="flex items-baseline gap-2">
        <span
          className={`text-xs ${on ? "text-emerald-400" : "text-neutral-500"}`}
          aria-label={on ? "켜짐" : "꺼짐"}
        >
          {on ? "● 켜짐" : "○ 꺼짐"}
        </span>
        <span className="text-sm text-neutral-200">{name}</span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">{what}</p>
      {children}
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 break-all text-neutral-300">{value}</dd>
    </div>
  );
}
