import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getTeacherSettings } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * 담임 교실 허브 (QC v3 US-B6). 담임 영역(자율·진로활동·출결·행특·상담·공지·생기부)
 * 진입점. 담임 교사로 설정되지 않은 경우 카드를 숨기고 세팅실로 안내한다.
 * 담임 교실은 학기 구분 없이 사용한다.
 */
export default async function HomeroomPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const settings = await getTeacherSettings(db, ownerId);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🏠 담임 교실</h1>
          <p className="mt-1 text-sm text-neutral-500">
            담임반 학생의 자율·진로활동·출결·행특·상담·공지·생기부를 한곳에서 관리합니다.
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            담임 교실은 학기 구분 없이 사용합니다.
          </p>
        </div>
        <Link href="/" className="shrink-0 text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      {!settings?.isHomeroom ? (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p>
            담임 교사로 설정되어 있지 않습니다. 세팅실-교사 기본설정에서 담임 학년/반을
            설정하세요.
          </p>
          <Link
            href="/setting/profile"
            className="mt-2 inline-block underline hover:no-underline"
          >
            세팅실 → 교사 기본설정으로 이동
          </Link>
        </div>
      ) : (
        <section className="mt-8 grid gap-3">
          <HubCard
            href="/homeroom/activities"
            title="자율·진로활동"
            desc="담임반 학생의 자율활동·진로활동을 기입합니다."
          />
          <HubCard
            href="/homeroom/attendance"
            title="출결 관리"
            desc="사유×성격으로 출결을 기록하고 신고서 필요/제출을 관리합니다."
          />
          <HubCard
            href="/homeroom/behavior"
            title="행동특성 기록"
            desc="담임반 학생의 행동발달 및 특기사항을 누가기록합니다."
          />
          <HubCard
            href="/homeroom/counsel"
            title="상담실"
            desc="학생·학부모 상담일지를 기록합니다."
          />
          <HubCard
            href="/homeroom/notice"
            title="공지실"
            desc="공개 페이지의 교사 한마디·이번 주 할 일을 설정합니다."
          />
          <HubCard
            href="/homeroom/record"
            title="생기부 작성"
            desc="담임반 학생의 학교생활기록부를 작성합니다."
          />
        </section>
      )}
    </main>
  );
}

function HubCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-neutral-200 p-5 transition hover:border-neutral-400 hover:shadow-sm"
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-neutral-500">{desc}</p>
    </Link>
  );
}
