"use client";
import { useState, useTransition } from "react";
import {
  exportRecordSourceAction,
  importRecordResultAction,
} from "./actions";
import { downloadCsv } from "@/lib/ui/download-csv";

type Area = "autonomy" | "career" | "behavior";

const AREAS: { key: Area; label: string }[] = [
  { key: "autonomy", label: "자율활동" },
  { key: "career", label: "진로활동" },
  { key: "behavior", label: "행동발달 및 특기사항" },
];

interface StudentOpt {
  id: string;
  label: string;
}
interface DraftRow {
  id: string;
  studentYearId: string;
  area: Area;
  content: string;
  byteCount: number;
  byteLimit: number;
}

/**
 * 생기부 작성 코워크 왕복 클라이언트(AC-11.x). 세특 일괄 클라이언트를 거울처럼 따르되
 * 과목·분반 대신 3영역 탭으로 분기하고 학기 토글이 없다(연말 1회).
 */
export function RecordBulkClient({
  students,
  drafts,
}: {
  students: StudentOpt[];
  drafts: DraftRow[];
}) {
  const [area, setArea] = useState<Area>("autonomy");
  const [msg, setMsg] = useState("");
  const [skipped, setSkipped] = useState<{ sid: string; reason: string }[]>([]);
  const [pending, startTransition] = useTransition();

  const areaLabel = AREAS.find((a) => a.key === area)?.label ?? "";
  const labelById = new Map(students.map((s) => [s.id, s.label]));
  const areaDrafts = drafts.filter((d) => d.area === area);

  function onExport() {
    setMsg("");
    setSkipped([]);
    startTransition(async () => {
      const r = await exportRecordSourceAction({ area });
      if (r.ok) {
        downloadCsv(r.csv, `생기부원천_${areaLabel}.csv`);
        setMsg(
          `${r.count}명 ${areaLabel} 원천자료를 내보냈습니다. 코워크에서 생기부본문 열을 채워 다시 올리세요.`,
        );
      } else {
        setMsg(r.message);
      }
    });
  }

  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("");
    setSkipped([]);
    const reader = new FileReader();
    reader.onload = () => {
      const csv = String(reader.result ?? "");
      startTransition(async () => {
        const r = await importRecordResultAction({ area, csv });
        if (r.ok) {
          setSkipped(r.skipped);
          setMsg(`저장 ${r.saved} · 스킵 ${r.skipped.length}`);
        } else {
          setMsg(r.message);
        }
      });
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  return (
    <div className="mt-6 space-y-6">
      {/* 영역 탭 */}
      <div className="flex gap-1 border-b border-neutral-200">
        {AREAS.map((a) => (
          <button
            key={a.key}
            onClick={() => {
              setArea(a.key);
              setMsg("");
              setSkipped([]);
            }}
            className={`px-3 py-2 text-sm ${
              area === a.key
                ? "border-b-2 border-neutral-800 font-normal text-neutral-800"
                : "text-neutral-400 hover:text-neutral-600"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* 내보내기 */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-normal text-neutral-700">
          ① {areaLabel} 원천자료 내보내기
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          담임반 학생 전원의 {areaLabel} 원천자료를 한 파일로 내보냅니다.
        </p>
        <button
          onClick={onExport}
          disabled={pending}
          className="mt-3 rounded-full border border-white/25 bg-transparent px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
        >
          원천 CSV 다운로드
        </button>
      </section>

      {/* 업로드 */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-normal text-neutral-700">
          ② 코워크 결과 CSV 업로드(학번 매칭)
        </h3>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onImport}
          disabled={pending}
          className="mt-3 block text-sm"
        />
        {skipped.length > 0 && (
          <div className="mt-3 rounded border border-neutral-200 bg-neutral-50 p-2 text-xs">
            <p className="font-normal text-neutral-600">스킵 {skipped.length}</p>
            {skipped.map((s, i) => (
              <p key={i} className="text-neutral-500">
                {s.sid} — {s.reason}
              </p>
            ))}
          </div>
        )}
      </section>

      {msg && <p className="text-xs text-neutral-500">{msg}</p>}

      {/* 저장된 초안(현재 영역) */}
      <section>
        <h3 className="text-sm font-normal text-neutral-700">
          저장된 {areaLabel} 초안 {areaDrafts.length}
        </h3>
        {areaDrafts.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            아직 저장된 {areaLabel} 초안이 없습니다.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {areaDrafts.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-neutral-200 p-3 text-sm"
              >
                <div className="flex justify-between text-xs text-neutral-400">
                  <span>{labelById.get(d.studentYearId) ?? "—"}</span>
                  <span>
                    {d.byteCount}/{d.byteLimit} byte
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-neutral-700">
                  {d.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
