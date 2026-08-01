import Link from "next/link";
import { getOwnerId } from "@/lib/auth/owner";
import { getDb } from "@/lib/db";
import { listStudents, listStudentActivities } from "@/lib/db/queries";
import { createActivityAction, deleteActivityAction } from "./actions";
import { SubmitButton } from "./submit-button";
import { ConfirmButton } from "@/app/ui/confirm-button";

export const metadata = { title: "활동 기입" };

export const dynamic = "force-dynamic";

const TAG_LABEL: Record<string, string> = {
  autonomy: "자율",
  career: "진로",
  both: "자율+진로",
};
const PLACEMENT_LABEL: Record<string, string> = {
  autonomy: "자율 배치",
  career: "진로 배치",
};

/**
 * 학생 활동 기입 화면 (계획 §4 C, AC-E). 자율/진로/both 입력 → both 는 한 곳으로
 * 배치 확정(중복 투입 방지). 세특 묶음 내보내기의 '활동' 근거가 된다.
 */
export default async function ActivitiesPage() {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();

  const [students, activities] = await Promise.all([
    listStudents(db, ownerId, year),
    listStudentActivities(db, ownerId),
  ]);
  const nameById = new Map(students.map((s) => [s.id, s]));

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-normal tracking-tight">활동 기입 ({year})</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← 홈
        </Link>
      </div>

      <section className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-normal text-neutral-700">새 활동 기입</h2>
        <p className="mt-1 text-xs text-neutral-400">
          자율·진로 모두 해당하는 활동은 <strong>자율+진로</strong>로 선택하면 한 곳(기본:
          자율)으로 자동 배치되어 세특에 중복 들어가지 않습니다.
        </p>
        {students.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            먼저{" "}
            <Link href="/students" className="underline">
              학생 명단
            </Link>
            을 임포트하세요.
          </p>
        ) : (
          <form action={createActivityAction} className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-3">
              <select aria-label="학생"
                name="studentYearId"
                required
                className="rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sid} {s.name}
                  </option>
                ))}
              </select>
              <select aria-label="활동 구분"
                name="tag"
                defaultValue="autonomy"
                className="rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                <option value="autonomy">자율</option>
                <option value="career">진로</option>
                <option value="both">자율+진로</option>
              </select>
            </div>
            <textarea aria-label="활동 내용(관찰 사실 위주)"
              name="body"
              required
              rows={3}
              placeholder="활동 내용(관찰 사실 위주)"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <SubmitButton>기입 저장</SubmitButton>
          </form>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-normal text-neutral-700">
          기입 {activities.length}건
        </h2>
        {activities.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">아직 활동 기입이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {activities.map((a) => {
              const st = nameById.get(a.studentYearId);
              return (
                <li
                  key={a.id}
                  className="rounded-lg border border-neutral-200 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-normal">
                      {st ? `${st.sid} ${st.name}` : "(이전 연도 학생)"}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-neutral-400">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                        {TAG_LABEL[a.tag]}
                      </span>
                      <span>→ {PLACEMENT_LABEL[a.placement]}</span>
                      <form action={deleteActivityAction} className="inline">
                        <input type="hidden" name="id" value={a.id} />
                        <ConfirmButton
                          message="이 활동 기입을 삭제할까요? 되돌릴 수 없습니다."
                          className="text-red-500 hover:underline"
                        >
                          삭제
                        </ConfirmButton>
                      </form>
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-neutral-700">{a.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
