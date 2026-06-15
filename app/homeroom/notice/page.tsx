import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listTeacherNotes,
  listNoticeEvents,
  listGradeClasses,
  listFixedClassSettings,
  getTeacherSettings,
  listHomeroomStudents,
  type GradeClassOffering,
} from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { fetchTimetableBySchool } from "@/lib/integrations/comcigan-client";
import { NotesManager } from "./notes-manager";
import { EventsManager } from "./events-manager";
import { FixedClassPanel } from "./fixed-class-panel";

export const dynamic = "force-dynamic";

/**
 * 공지실 (계획 §4 Phase2-I + QC v3 Part B US-B10). 학생 공개 페이지(/p/[token])에 표시되는
 * 공통 안내 관리.
 *  - 교사 한마디(다중): 공개 페이지에서 순서대로 노출
 *  - 할 일 / 공지(제목·날짜·내용): 7일 내 항목이 공개 페이지에 표시
 *  - 고정반 설정: 담임 학년 시간표 기반 원반/이동반 지정(컴시간, 비차단)
 * 공개 페이지는 allowlist DTO 만 통과하므로, 민감 정보는 입력하지 않는다.
 */
export default async function NoticePage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const year = activeSchoolYear(new Date());

  const [notes, events, settings, homeroomStudents] = await Promise.all([
    listTeacherNotes(db, ownerId),
    listNoticeEvents(db, ownerId),
    getTeacherSettings(db, ownerId),
    listHomeroomStudents(db, ownerId, year),
  ]);

  const students = homeroomStudents.map((s) => ({
    id: s.id,
    label: `${s.sid} ${s.name}`,
  }));

  const grade = settings?.homeroomGrade ?? null;
  const school = settings?.comciganSchool ?? null;

  // 고정반 패널: 담임 학년 시간표를 컴시간에서 읽어 (반,과목) 제공목록 도출(비차단).
  let offerings: GradeClassOffering[] | null = null;
  let syncError: string | null = null;
  let fixedKeys: string[] = [];
  if (grade) {
    const saved = await listFixedClassSettings(db, ownerId, grade);
    fixedKeys = saved.filter((s) => s.isFixed).map((s) => `${s.classNo}::${s.subjectName}`);
    if (school) {
      try {
        const res = await fetchTimetableBySchool(school);
        if (!res.ok) {
          syncError = res.error;
        } else {
          offerings = listGradeClasses(res.data, grade);
        }
      } catch (e) {
        syncError = e instanceof Error ? e.message : "동기화 실패";
      }
    } else {
      syncError = "컴시간 학교 설정이 없습니다.";
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-800">공지실</h2>
      <p className="mt-2 text-xs text-neutral-400">
        여기서 설정한 내용은 학생별 공개 페이지(<code>/p/…</code>)에 그대로 노출됩니다.
        민감한 개인정보는 입력하지 마세요.
      </p>

      <NotesManager notes={notes} students={students} />

      <EventsManager events={events} today={today} />

      <FixedClassPanel
        grade={grade}
        offerings={offerings}
        fixedKeys={fixedKeys}
        syncError={syncError}
      />
    </div>
  );
}
