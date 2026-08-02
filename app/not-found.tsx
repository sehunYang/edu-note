import Link from "next/link";
import { CoveLight } from "@/app/ui/cove-light";

/**
 * 전역 404 (사용성 개선 P0-3). 이 파일이 없으면 Next 기본 404 가 뜬다 — 흰 배경
 * 영문 한 줄에 앱 셸도 복귀 링크도 없어, 다크 테마 앱에서 화면이 번쩍이고
 * 사용자가 갇힌다(H9 오류 복구). 여기서는 테마를 유지한 채 한국어 설명과
 * 복귀 경로 2개(홈·오늘의 학교)를 준다.
 */
export default function NotFound() {
  return (
    <>
      <CoveLight />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl" aria-hidden="true">
          🧭
        </p>
        <h1 className="mt-4 text-2xl tracking-tight">
          찾을 수 없는 페이지입니다
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          주소가 바뀌었거나 삭제된 화면일 수 있습니다.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full border border-white bg-white px-5 text-sm text-black hover:bg-white/90"
          >
            홈으로
          </Link>
          <Link
            href="/today"
            className="inline-flex min-h-11 items-center rounded-full border border-white/25 px-5 text-sm text-white hover:bg-white/10"
          >
            오늘의 학교
          </Link>
        </div>
      </main>
    </>
  );
}
