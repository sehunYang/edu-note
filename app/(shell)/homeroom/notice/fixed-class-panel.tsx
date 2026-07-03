"use client";
import { useActionState } from "react";
import { saveFixedClassesAction, type FixedClassState } from "./actions";
import type { GradeClassOffering } from "@/lib/db/queries";
import { Button } from "@/app/ui/button";

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
    <section className="mt-8 rounded-lg border border-neutral-200 p-5">
      <h2 className="text-sm font-normal text-neutral-700">
        고정반 설정 {grade ? `(${grade}학년)` : ""}
      </h2>
      <p className="mt-1 text-xs text-neutral-400">
        체크한 과목은 고정반(원반), 미체크는 선택과목(이동반)으로 저장됩니다.
      </p>

      {!grade ? (
        <p className="mt-3 text-sm text-amber-600">
          담임 학년이 설정되어 있지 않습니다. 세팅실에서 담임 정보를 먼저 입력하세요.
        </p>
      ) : syncError || !offerings ? (
        <p className="mt-3 text-sm text-amber-600">
          동기화 실패, 수기로 시간표를 확인하세요.
          {syncError ? <span className="block text-xs text-neutral-400">{syncError}</span> : null}
        </p>
      ) : (
        <form action={save} className="mt-3 space-y-3">
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
    </section>
  );
}
