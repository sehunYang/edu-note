"use client";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 학생 분석 보고서 셀렉터 (교실 2-2 단계6). 분반·학생 선택을 URL 쿼리
 * (?semester 보존 + ?section + ?student)로 반영해 서버 페이지가 보고서를 재조회한다.
 * 분반을 바꾸면 학생 선택은 초기화(분반 코호트가 달라짐). neutral Tailwind.
 */
export interface SectionOption {
  sectionId: string;
  label: string;
  subjectName: string;
}

export interface StudentOption {
  id: string;
  sid: string;
  name: string;
}

export function ReportSelector({
  sections,
  students,
  selectedSection,
  selectedStudent,
}: {
  sections: SectionOption[];
  students: StudentOption[];
  selectedSection: string;
  selectedStudent: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function pushWith(next: { section?: string; student?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.section !== undefined) {
      if (next.section) params.set("section", next.section);
      else params.delete("section");
      // 분반 변경 시 학생 초기화.
      params.delete("student");
    }
    if (next.student !== undefined) {
      if (next.student) params.set("student", next.student);
      else params.delete("student");
    }
    router.push(`/classroom/report?${params.toString()}`);
  }

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div>
        <label className="text-xs font-normal text-neutral-600">분반</label>
        <select aria-label="분반"
          value={selectedSection}
          onChange={(e) => pushWith({ section: e.target.value })}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">분반 선택</option>
          {sections.map((s) => (
            <option key={s.sectionId} value={s.sectionId}>
              {s.subjectName} {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-normal text-neutral-600">학생</label>
        <select aria-label="학생"
          value={selectedStudent}
          onChange={(e) => pushWith({ student: e.target.value })}
          disabled={!selectedSection}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm disabled:bg-neutral-50 disabled:text-neutral-400"
        >
          <option value="">
            {selectedSection ? "학생 선택" : "먼저 분반을 선택하세요"}
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sid} {s.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
