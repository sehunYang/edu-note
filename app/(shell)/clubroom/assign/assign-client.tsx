"use client";
import { useMemo, useState } from "react";
import { Button } from "@/app/ui/button";
import { Disclosure } from "@/app/ui/disclosure";

interface Candidate {
  id: string;
  label: string;
}

/**
 * 학번(5자리 GCCNN)에서 "2학년 7반" 그룹 키와 정렬값을 만든다.
 * 정렬은 문자열이 아니라 숫자로 해야 한다 — 문자열이면 "10반"이 "7반"보다
 * 앞서서 반 순서가 뒤엉킨다. 형식이 다른 학번은 기타로 모아 맨 뒤에 둔다.
 */
function classOf(label: string): { key: string; order: number } {
  const sid = label.trim().split(/\s+/)[0] ?? "";
  if (!/^\d{5}$/.test(sid)) return { key: "기타", order: Number.MAX_SAFE_INTEGER };
  const grade = Number(sid[0]);
  const classNo = Number(sid.slice(1, 3));
  return { key: `${grade}학년 ${classNo}반`, order: grade * 100 + classNo };
}

/**
 * 부원 배정 선택 클라이언트 (QC v5 c9 D.3).
 *
 * 밀도 개선 D-5: 이전에는 전교 후보 129명이 3열 체크박스로 **한 번에 평면
 * 나열**돼 이 화면 하나가 2,006px 였다. 찾을 방법은 눈으로 훑는 것뿐이었고,
 * 학년·반 경계도 보이지 않아 "2학년 7반 애들"을 고르려면 스크롤을 오르내려야
 * 했다. 밀도 칼럼의 두 지점을 함께 어긴 상태다 — 근접성으로 묶기(Gestalt),
 * 그리고 검색 같은 표준 패턴으로 사용자 멘탈모델에 맞추기.
 *
 * 고친 방식:
 *  - 학번/이름 **검색**을 최상단에 둔다(입력 시 그룹이 자동으로 펼쳐진다).
 *  - 반 단위로 **묶어 접는다**. 요약 줄에 인원과 현재 선택 수를 실어, 접힌
 *    상태에서도 어디를 몇 명 골랐는지 보인다.
 *  - 선택 수·배정 버튼은 목록 위에 고정해 스크롤 끝까지 내려가지 않아도 된다.
 */
export function AssignClient({
  candidates,
  action,
}: {
  candidates: Candidate[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const q = query.trim();
  const visible = useMemo(
    () => (q ? candidates.filter((c) => c.label.includes(q)) : candidates),
    [candidates, q],
  );

  const groups = useMemo(() => {
    const m = new Map<string, { order: number; items: Candidate[] }>();
    for (const c of visible) {
      const { key, order } = classOf(c.label);
      const g = m.get(key);
      if (g) g.items.push(c);
      else m.set(key, { order, items: [c] });
    }
    return [...m.entries()].sort((a, b) => a[1].order - b[1].order);
  }, [visible]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** 현재 보이는 후보 전체를 켜고 끈다(검색 중이면 검색 결과 한정). */
  function toggleVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = visible.every((c) => next.has(c.id));
      for (const c of visible) {
        if (allOn) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  return (
    <form action={action} className="mt-3">
      <input
        type="hidden"
        name="studentYearIds"
        value={Array.from(selected).join(",")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="학번·이름 검색"
          aria-label="후보 학생 검색"
          className="w-48 rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={toggleVisible}
          className="text-xs text-neutral-500 hover:underline"
        >
          {q ? `검색결과 ${visible.length}명 전체 선택` : "전체 선택"}
        </button>
        <Button
          type="submit"
          disabled={selected.size === 0}
          className="ml-auto px-3 py-1.5 text-sm disabled:opacity-40"
        >
          선택 {selected.size}명 배정
        </Button>
      </div>

      <div className="mt-3 space-y-1.5">
        {groups.map(([label, { items: list }]) => {
          const picked = list.filter((c) => selected.has(c.id)).length;
          return (
            <Disclosure
              key={label}
              title={label}
              count={`${list.length}명`}
              /* 검색 중에는 결과를 바로 보여준다 — 접힌 검색 결과는 "없음"과
                 구별되지 않아 검색이 무의미해진다. */
              defaultOpen={Boolean(q)}
              hint={picked > 0 ? `${picked}명 선택됨` : undefined}
            >
              <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {list.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded border border-neutral-200 px-2 py-1 text-sm hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                      />
                      <span>{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </Disclosure>
          );
        })}
        {groups.length === 0 && (
          <p className="text-sm text-neutral-400">
            «{q}» 와 일치하는 후보가 없습니다.
          </p>
        )}
      </div>
    </form>
  );
}
