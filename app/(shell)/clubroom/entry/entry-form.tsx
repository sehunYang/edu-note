"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveAllAction } from "./actions";
import { COMMON_FIELD_PREFIX, OVERRIDE_FIELD_PREFIX } from "./fields";

/**
 * 활동 입력 폼 (사용성 개선 P2-11). 차시 × 부원 전체를 폼 하나로 묶고 저장 버튼을
 * 1개로 줄인다. 이전에는 차시마다 "공통 저장", 부원마다 "저장" 이 따로 있어
 * 11차시·부원 1명 화면에 저장 버튼이 22개였고, 각각이 별도 서버 왕복이었다.
 *
 * 변경 여부는 초기값 스냅샷과 현재 입력값을 비교해 클라이언트에서 세고, 저장
 * 버튼에 "변경 N건" 으로 표시한다 — 무엇이 저장될지 누르기 전에 보이게 한다.
 */

export interface EntrySession {
  id: string;
  ordinal: number;
  date: string;
  plannedActivity: string | null;
  commonBody: string;
}

export interface EntryMember {
  id: string;
  studentYearId: string;
  sid: string;
  name: string;
}

export function ClubEntryForm({
  sessions,
  members,
  memoByKey,
}: {
  sessions: EntrySession[];
  members: EntryMember[];
  /** `${date}__${studentYearId}` → 저장된 개별 메모 */
  memoByKey: Record<string, string>;
}) {
  // 초기 스냅샷(불변) 과 현재 값
  const initial: Record<string, string> = {};
  for (const s of sessions) {
    initial[`${COMMON_FIELD_PREFIX}${s.date}`] = s.commonBody;
    for (const m of members) {
      initial[`${OVERRIDE_FIELD_PREFIX}${s.date}__${m.studentYearId}`] =
        memoByKey[`${s.date}__${m.studentYearId}`] ?? "";
    }
  }
  const [values, setValues] = useState<Record<string, string>>(initial);

  const dirtyKeys = Object.keys(initial).filter(
    (k) => (values[k] ?? "") !== (initial[k] ?? ""),
  );

  function set(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  return (
    <form action={saveAllAction} className="mt-6 space-y-6 pb-44 md:pb-24">
      {sessions.map((s) => {
        const commonKey = `${COMMON_FIELD_PREFIX}${s.date}`;
        const sessionDirty =
          (values[commonKey] ?? "") !== (initial[commonKey] ?? "") ||
          members.some((m) => {
            const k = `${OVERRIDE_FIELD_PREFIX}${s.date}__${m.studentYearId}`;
            return (values[k] ?? "") !== (initial[k] ?? "");
          });

        return (
          <section key={s.id} className="rounded-lg border border-neutral-200 p-4">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span>
                {s.ordinal}차시 · {s.date}
              </span>
              {s.plannedActivity && <span>예정: {s.plannedActivity}</span>}
              {sessionDirty && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-500">
                  변경됨
                </span>
              )}
            </div>

            <div className="mt-2">
              <label
                htmlFor={commonKey}
                className="text-xs font-normal text-neutral-600"
              >
                공통 내용
              </label>
              <textarea
                id={commonKey}
                name={commonKey}
                value={values[commonKey] ?? ""}
                onChange={(e) => set(commonKey, e.target.value)}
                rows={2}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
              <p className="text-xs font-normal text-neutral-600">부원별 개별 메모</p>
              {members.map((m) => {
                const k = `${OVERRIDE_FIELD_PREFIX}${s.date}__${m.studentYearId}`;
                return (
                  <div
                    key={m.id}
                    className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
                  >
                    <label
                      htmlFor={k}
                      className="w-full text-sm text-neutral-600 sm:w-32 sm:shrink-0"
                    >
                      {m.sid} {m.name}
                    </label>
                    <input
                      id={k}
                      name={k}
                      value={values[k] ?? ""}
                      onChange={(e) => set(k, e.target.value)}
                      placeholder="개별 메모(선택)"
                      className="w-full min-w-0 rounded border border-neutral-300 px-2 py-1 text-sm sm:w-auto sm:flex-1"
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <SaveBar dirtyCount={dirtyKeys.length} />
    </form>
  );
}

/** 하단 고정 저장 바. 변경이 없으면 비활성이라 헛클릭이 없다. */
function SaveBar({ dirtyCount }: { dirtyCount: number }) {
  const { pending } = useFormStatus();
  // 저장 직후 dirtyCount 가 0 으로 떨어지는데, 문구가 "변경 사항 없음"이면
  // 저장이 됐다는 신호로 읽히지 않는다. 저장을 거친 뒤에는 '저장됨'을 보여준다.
  const [everSaved, setEverSaved] = useState(false);
  useEffect(() => {
    if (pending) setEverSaved(true);
  }, [pending]);
  const idleText =
    everSaved && dirtyCount === 0 ? "저장됨 ✓" : "변경 사항 없음";
  return (
    // 모바일에선 하단 탭바(fixed bottom, z-40, 높이 ≈4rem+safe-area) 위로 띄운다.
    // bottom-0 이면 저장 바가 탭바에 완전히 가려 탭 자체가 불가능했다.
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-white/10 bg-canvas/95 px-6 py-3 backdrop-blur md:bottom-0 md:pl-64">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <p
          role="status"
          aria-live="polite"
          className={`text-xs ${
            !pending && dirtyCount === 0 && everSaved
              ? "text-emerald-500"
              : "text-neutral-500"
          }`}
        >
          {pending
            ? "저장 중…"
            : dirtyCount > 0
              ? `변경 ${dirtyCount}건`
              : idleText}
        </p>
        <button
          type="submit"
          disabled={pending || dirtyCount === 0}
          className="inline-flex min-h-11 items-center rounded-full border border-white bg-white px-5 text-sm text-black hover:bg-white/90 disabled:opacity-40"
        >
          {pending ? "저장 중…" : "전체 저장"}
        </button>
      </div>
    </div>
  );
}
