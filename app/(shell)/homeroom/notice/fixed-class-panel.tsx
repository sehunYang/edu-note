"use client";
import { useActionState } from "react";
import { saveFixedClassesAction, type FixedClassState } from "./actions";
import type { GradeClassOffering } from "@/lib/db/queries";
import { Button } from "@/app/ui/button";
import { Disclosure } from "@/app/ui/disclosure";
import { EmptyState } from "@/app/ui/empty-state";

/**
 * 고정반 설정 패널 (QC v3 Part B AC-10.3). 담임 학년의 (반,과목) 제공목록을 체크박스로
 * 보여 주고, 체크=고정반(원반)·미체크=선택과목(이동반)으로 일괄 저장한다.
 * 컴시간 파싱 실패 시 page 가 offerings=null·syncError 를 내려보내 수기 안내를 표시한다.
 */
export function FixedClassPanel({
  grade,
  offerings,
  fixedKeys,
  syncError,
}: {
  grade: number | null;
  offerings: GradeClassOffering[] | null;
  fixedKeys: string[];
  syncError: string | null;
}) {
  const [state, save, saving] = useActionState<FixedClassState, FormData>(
    saveFixedClassesAction,
    null,
  );
  const fixedSet = new Set(fixedKeys);

  return (
    /* 밀도 개선 D-6: (반 × 과목) 체크박스 68개가 상시 펼쳐져 공지실 하단
       700px 를 먹고 있었다. 이건 학기 초에 한 번 맞추고 끝나는 설정이지,
       공지를 쓰러 들어올 때마다 볼 것이 아니다 — 접고, 요약 줄에 현재 고정반
       개수를 실어 접힌 채로도 설정 상태를 알 수 있게 한다. */
    <section className="mt-5">
      <Disclosure
        title={`고정반 설정 ${grade ? `(${grade}학년)` : ""}`}
        count={offerings ? `${fixedKeys.length}/${offerings.length}` : undefined}
        hint="체크=고정반(원반) · 미체크=선택과목(이동반)"
      >
      {!grade ? (
        <EmptyState actions={[{ href: "/setting/profile", label: "담임 정보 설정" }]}>
          담임 학년이 설정되어 있지 않습니다.
        </EmptyState>
      ) : syncError || !offerings ? (
        <p className="text-sm text-amber-600">
          시간표 동기화 실패
          {syncError ? <span className="block text-xs text-neutral-400">{syncError}</span> : null}
        </p>
      ) : (
        <form action={save} className="space-y-3">
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {offerings.map((o) => {
              const key = `${o.classNo}::${o.subjectName}`;
              return (
                <li key={key} className="text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="fixed"
                      value={key}
                      defaultChecked={fixedSet.has(key)}
                    />
                    <span className="text-neutral-400">{o.classNo}반</span>
                    <span>{o.subjectName}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Button
            disabled={saving}
            className="px-3 py-1.5 text-sm"
          >
            {saving ? "저장 중…" : "고정반 저장"}
          </Button>
          {state?.ok ? (
            <p className="text-xs text-green-600">{state.saved}개 과목을 저장했습니다.</p>
          ) : state && !state.ok ? (
            <p className="text-xs text-amber-600">{state.message}</p>
          ) : null}
        </form>
      )}
      </Disclosure>
    </section>
  );
}
