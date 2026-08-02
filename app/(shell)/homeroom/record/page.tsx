import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import {
  listHomeroomStudents,
  listHomeroomRecordDrafts,
} from "@/lib/db/queries";
import { activeSchoolYear } from "@/lib/domain/school-year";
import { RecordBulkClient } from "./record-bulk-client";
import { EmptyState } from "@/app/ui/empty-state";

export const metadata = { title: "생기부 작성" };

export const dynamic = "force-dynamic";

/**
 * 생기부 작성 (담임 교실, US-B12 / AC-11.x). 세특과 동일한 코워크 CSV 왕복 프레임을
 * 자율/진로/행발 3영역에 적용한다. 학기 구분 없음(연말 1회). 담임반 학생만 대상.
 * 서버에서 AI 호출 없음(코워크 외부 생성).
 */
export default async function HomeroomRecordPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = activeSchoolYear(new Date());

  const [students, drafts] = await Promise.all([
    listHomeroomStudents(db, ownerId, year),
    listHomeroomRecordDrafts(db, ownerId, year),
  ]);

  return (
    <div>
      <h2 className="text-base">생기부 작성 ({year})</h2>
      {students.length === 0 ? (
        <div className="mt-6">
          <EmptyState actions={[{ href: "/setting/students", label: "담임 학급·학생 등록" }]}>
            담임반이 지정되어 있지 않습니다.
          </EmptyState>
        </div>
      ) : (
        <RecordBulkClient
          students={students.map((s) => ({ id: s.id, label: `${s.sid} ${s.name}` }))}
          drafts={drafts.map((d) => ({
            id: d.id,
            studentYearId: d.studentYearId,
            area: d.area,
            content: d.content,
            byteCount: d.byteCount,
            byteLimit: d.byteLimit,
          }))}
        />
      )}
    </div>
  );
}
