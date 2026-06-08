import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicPage } from "@/lib/public/get-public-page";
import type {
  PublicPagePayload,
  PublicAttendanceSummary,
  PublicGradeStatus,
} from "@/lib/public";
import { GoneNotice } from "./gone";

/**
 * 공개 학생 페이지 `/p/[token]` (계획 §3.2/§3.5, AC-I).
 *
 * 단일 `get_public_page(token)` 어댑터만 사용한다. 응답은 allowlist DTO 로
 * 사전집계된 값뿐(사유텍스트·원점수·타 학생 데이터 없음). 폐기=410, 만료=410,
 * 없음=404. 검색엔진 비색인(noindex) 강제.
 */

// 토큰 페이지는 항상 동적(캐시 금지) + 비색인.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicStudentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getPublicPage(token);

  if (result.status === "not_found") notFound();
  if (result.status === "revoked") return <GoneNotice reason="revoked" />;
  if (result.status === "expired") return <GoneNotice reason="expired" />;

  return <PublicPageView payload={result.payload} />;
}

function PublicPageView({ payload }: { payload: PublicPagePayload }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">학생 안내 페이지</h1>
        <p className="mt-1 text-xs text-neutral-400">
          이 페이지의 링크는 외부에 공유하지 마세요.
        </p>
      </header>

      {payload.commonNotice && (
        <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <h2 className="text-sm font-semibold text-neutral-500">교사 한마디</h2>
          <p className="mt-1 whitespace-pre-line text-sm">{payload.commonNotice}</p>
        </section>
      )}

      <WeekTodos todos={payload.weekTodos} />
      <Timetable slots={payload.timetable} />
      <Meals meals={payload.meals} />
      <Attendance summary={payload.attendanceSummary} />
      <Grades grades={payload.grades} />

      {payload.personalMessage && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-600">개별 메시지</h2>
          <p className="mt-1 whitespace-pre-line text-sm">
            {payload.personalMessage}
          </p>
        </section>
      )}
    </main>
  );
}

const WEEKDAYS = ["", "월", "화", "수", "목", "금", "토", "일"];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function WeekTodos({ todos }: { todos: PublicPagePayload["weekTodos"] }) {
  return (
    <Card title="이번 주 할 일">
      {todos.length === 0 ? (
        <p className="text-sm text-neutral-400">등록된 항목이 없습니다.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {todos.map((t, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>{t.title}</span>
              <span className="text-neutral-400">{t.at}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Timetable({ slots }: { slots: PublicPagePayload["timetable"] }) {
  return (
    <Card title="시간표">
      {slots.length === 0 ? (
        <p className="text-sm text-neutral-400">등록된 시간표가 없습니다.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-1 text-sm">
          {slots.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-neutral-400">
                {WEEKDAYS[s.weekday] ?? "?"}
                {s.period}교시
              </span>
              <span>{s.subjectName}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Meals({ meals }: { meals: PublicPagePayload["meals"] }) {
  return (
    <Card title="급식">
      {meals.length === 0 ? (
        <p className="text-sm text-neutral-400">등록된 급식 정보가 없습니다.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {meals.map((m, i) => (
            <li key={i}>
              <span className="text-neutral-400">{m.date}</span> · {m.menu}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Attendance({ summary }: { summary: PublicAttendanceSummary }) {
  const items: [string, number][] = [
    ["지각", summary.late],
    ["조퇴", summary.earlyLeave],
    ["결과", summary.absentPeriod],
    ["결석", summary.absent],
  ];
  return (
    <Card title="출결 요약">
      <ul className="flex gap-4 text-sm">
        {items.map(([label, n]) => (
          <li key={label}>
            <span className="text-neutral-400">{label}</span>{" "}
            <span className="font-semibold">{n}</span>
          </li>
        ))}
      </ul>
      {summary.hasUnsubmittedReport && (
        <p className="mt-2 text-sm text-amber-600">⚠ 미제출 신고서가 있습니다.</p>
      )}
    </Card>
  );
}

function Grades({ grades }: { grades: PublicGradeStatus }) {
  return (
    <Card title="성적 요약">
      {grades.status === "preparing" ? (
        <p className="text-sm text-neutral-400">준비중</p>
      ) : grades.items.length === 0 ? (
        <p className="text-sm text-neutral-400">등록된 성적이 없습니다.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-neutral-400">
            <tr className="text-left">
              <th className="font-medium">과목</th>
              <th className="font-medium">석차</th>
              <th className="font-medium">등급</th>
              <th className="font-medium">성취도</th>
            </tr>
          </thead>
          <tbody>
            {grades.items.map((g, i) => (
              <tr key={i} className="border-t border-neutral-100">
                <td>{g.subjectName}</td>
                <td>{g.rank ?? "-"}</td>
                <td>{g.grade5 ?? "-"}</td>
                <td>{g.achievement ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
