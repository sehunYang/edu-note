import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { getTeacherSettings } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const TABS: { href: string; label: string }[] = [
  { href: "/homeroom/activities", label: "자율·진로활동" },
  { href: "/homeroom/attendance", label: "출결 관리" },
  { href: "/homeroom/behavior", label: "행동특성 기록" },
  { href: "/homeroom/counsel", label: "상담실" },
  { href: "/homeroom/notice", label: "공지실" },
  { href: "/homeroom/record", label: "생기부 작성" },
];

/**
 * 담임 교실 셸 (QC v4 US-8, AC-3.1/3.2). 교실 셸을 참고한 **공유 탭 바 허브**다.
 * 6개 컴포넌트 탭을 항상 노출해 하위 페이지 네비를 통일한다(하위의 ← 홈 제거).
 * 담임 미설정 게이팅을 보존: 담임이 아니면 탭 대신 세팅실 안내만 렌더한다.
 * 담임 교실은 학기 구분 없이 사용한다.
 */
export default async function HomeroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ownerId = await getOwnerId();
  const db = getDb();
  const settings = await getTeacherSettings(db, ownerId);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
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
        <>
          <nav className="mt-6 flex flex-wrap gap-2" aria-label="담임 교실 탭">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:border-neutral-500 hover:bg-neutral-50"
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <section className="mt-8">{children}</section>
        </>
      )}
    </div>
  );
}
