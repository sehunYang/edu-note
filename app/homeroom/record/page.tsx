import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * 생기부 작성 (담임 교실, US-B12에서 구현). 지금은 404 방지용 플레이스홀더.
 */
export default function HomeroomRecordPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">생기부 작성</h1>
        <Link
          href="/homeroom"
          className="text-sm text-neutral-500 hover:underline"
        >
          ← 담임 교실
        </Link>
      </div>
      <p className="mt-8 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
        준비 중(이 컴포넌트는 이어지는 단계에서 구현됩니다).
      </p>
    </main>
  );
}
