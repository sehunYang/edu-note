"use client";
import { useActionState, useState } from "react";
import {
  saveProfileAction,
  resolveSchoolAction,
  type SaveProfileState,
  type ResolveSchoolState,
} from "../actions";
import type { TeacherSettings } from "@/lib/db/queries";
import type { NeisSchoolInfo } from "@/lib/integrations/neis";
import type { SchoolSearchRow } from "@/lib/integrations/comcigan";
import { Button } from "@/app/ui/button";

/**
 * C2 교사 기본 설정 폼 (AC-2.1~2.3). 이름·학교명·담임여부·담임반 + 학교명 1회 입력으로
 * NEIS/comcigan 동시 해석. 담임여부 false 면 담임반 입력 숨김(저장 시 서버가 null 강제).
 * 학교 해석은 비차단: 0건/다건이면 수동입력·picker fallback 으로 게이트를 막지 않는다.
 */
export function ProfileForm({ initial }: { initial: TeacherSettings | null }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [schoolName, setSchoolName] = useState(initial?.schoolName ?? "");
  const [isHomeroom, setIsHomeroom] = useState(initial?.isHomeroom ?? false);

  // 선택된 학교 식별자(해석 결과 또는 기존 저장값)
  const [neis, setNeis] = useState<NeisSchoolInfo | null>(
    initial?.neisOfficeCode && initial?.neisSchoolCode
      ? {
          officeCode: initial.neisOfficeCode,
          schoolCode: initial.neisSchoolCode,
          name: initial.neisSchoolName ?? schoolName,
        }
      : null,
  );
  const [comcigan, setComcigan] = useState<SchoolSearchRow | null>(
    initial?.comciganSchool
      ? { regionCode: 0, region: "", name: initial.comciganSchool, code: 0 }
      : null,
  );

  const [resolveState, resolve, resolving] = useActionState<
    ResolveSchoolState,
    FormData
  >((prev, fd) => {
    fd.set("schoolName", schoolName);
    return resolveSchoolAction(prev, fd);
  }, null);

  const [saveState, save, saving] = useActionState<SaveProfileState, FormData>(
    saveProfileAction,
    null,
  );

  return (
    <div className="mt-5 space-y-6">
      {/* 학교 해석 */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-normal text-neutral-700">학교 코드 해석</h3>
        <p className="mt-1 text-xs text-neutral-400">
          학교명을 한 번만 입력하면 NEIS(학사일정)와 컴시간(시간표) 식별자를 함께
          찾습니다. 못 찾아도 수동 입력으로 진행할 수 있습니다.
        </p>
        <form action={resolve} className="mt-3 flex gap-2">
          <input
            name="schoolName"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="예: 인천해송고등학교"
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <Button
            type="submit"
            disabled={resolving || schoolName.trim().length === 0}
            className="px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {resolving ? "검색 중…" : "검색"}
          </Button>
        </form>

        {resolveState && !resolveState.ok && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {resolveState.message}
          </p>
        )}
        {resolveState && resolveState.ok && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ProviderPicker
              label="NEIS (학사일정·급식)"
              status={resolveState.resolution.neis.status}
              error={resolveState.resolution.neis.error}
              options={resolveState.resolution.neis.candidates.map((c) => ({
                key: `${c.officeCode}-${c.schoolCode}`,
                label: `${c.name} (${c.officeCode}/${c.schoolCode})`,
                selected:
                  neis?.officeCode === c.officeCode &&
                  neis?.schoolCode === c.schoolCode,
                onSelect: () => setNeis(c),
              }))}
            />
            <ProviderPicker
              label="컴시간 (시간표)"
              status={resolveState.resolution.comcigan.status}
              error={resolveState.resolution.comcigan.error}
              options={resolveState.resolution.comcigan.candidates.map((c) => ({
                key: String(c.code),
                label: `${c.name} (${c.region})`,
                selected: comcigan?.code === c.code && comcigan?.name === c.name,
                onSelect: () => setComcigan(c),
              }))}
            />
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-500">
          <span>
            NEIS:{" "}
            {neis ? (
              <strong className="text-neutral-700">
                {neis.officeCode}/{neis.schoolCode}
              </strong>
            ) : (
              "미해결"
            )}
          </span>
          <span>
            컴시간:{" "}
            {comcigan ? (
              <strong className="text-neutral-700">{comcigan.name}</strong>
            ) : (
              "미해결"
            )}
          </span>
        </div>
      </section>

      {/* 기본 설정 저장 */}
      <form action={save} className="space-y-4">
        <Field label="이름">
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </Field>
        <Field label="학교명">
          <input
            name="schoolName"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isHomeroom"
            checked={isHomeroom}
            onChange={(e) => setIsHomeroom(e.target.checked)}
            className="h-4 w-4"
          />
          담임 교사입니다
        </label>

        {isHomeroom && (
          <div className="flex gap-3">
            <Field label="담임 학년">
              <input
                name="homeroomGrade"
                type="number"
                defaultValue={initial?.homeroomGrade ?? ""}
                className="w-24 rounded border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </Field>
            <Field label="담임 반">
              <input
                name="homeroomClassNo"
                type="number"
                defaultValue={initial?.homeroomClassNo ?? ""}
                className="w-24 rounded border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </Field>
          </div>
        )}

        {/* 해석된 학교 식별자(숨김 — 저장 시 전달) */}
        <input type="hidden" name="neisOfficeCode" value={neis?.officeCode ?? ""} />
        <input type="hidden" name="neisSchoolCode" value={neis?.schoolCode ?? ""} />
        <input type="hidden" name="neisSchoolName" value={neis?.name ?? ""} />
        <input type="hidden" name="comciganSchool" value={comcigan?.name ?? ""} />
        <input type="hidden" name="comciganTeacher" value={name} />

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md border border-green-600 bg-green-600 px-4 py-1.5 text-sm font-normal text-white hover:bg-green-500 disabled:opacity-40"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
          {saveState && saveState.ok && (
            <span className="text-sm text-green-700">✅ 저장되었습니다.</span>
          )}
          {saveState && !saveState.ok && (
            <span className="text-sm text-red-700">{saveState.message}</span>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-normal text-neutral-600">
        {label}
      </span>
      {children}
    </label>
  );
}

interface PickerOption {
  key: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}

function ProviderPicker({
  label,
  status,
  error,
  options,
}: {
  label: string;
  status: "none" | "single" | "multiple";
  error?: string;
  options: PickerOption[];
}) {
  return (
    <div className="rounded border border-neutral-200 p-3">
      <div className="text-xs font-normal text-neutral-700">{label}</div>
      {status === "none" && (
        <p className="mt-1 text-xs text-neutral-400">
          {error ? `검색 실패(${error}) — 수동 입력 유지` : "검색 결과 없음 — 수동 입력 유지"}
        </p>
      )}
      {status !== "none" && (
        <div className="mt-2 space-y-1">
          {status === "multiple" && (
            <p className="text-[11px] text-amber-600">여러 건 — 하나를 선택하세요.</p>
          )}
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={o.onSelect}
              className={`block w-full rounded border px-2 py-1 text-left text-xs ${
                o.selected
                  ? "border-green-500 bg-green-50 text-green-800"
                  : "border-neutral-200 hover:bg-white/5"
              }`}
            >
              {o.selected ? "✓ " : ""}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
