import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  listTodayLessons,
  collectNudges,
  listPendingReportTiers,
  getEventsInRange,
  listUnsubmittedAttendance,
} from "@/lib/db/queries";
import { activeSemester } from "@/lib/domain/school-year";
import { kstToday } from "@/app/(shell)/today/today-lib";
import { sendToTeacher, sendToStudents } from "@/lib/push/send";
import { filterActiveStudentTargets } from "@/lib/push/targeting";
import {
  authorizeCron,
  composeBriefingBody,
  distinctTeacherBriefingOwners,
  distinctStudentS3Owners,
} from "@/lib/push/cron-brief";

/**
 * 일일 아침 브리핑 크론 (합의 계획 push-notifications, US-8).
 * 교사 브리핑(T3)과 학생 서류 리마인드(S3)를 KST 오늘 기준으로 발송한다.
 * Vercel Cron(vercel.json)이 매일 07:30 KST(=22:30 UTC 전날)에 1회 호출.
 *
 * 크론 요청엔 세션이 없으므로 getOwnerId 를 절대 쓰지 않고, 구독 테이블에서
 * 오너 집합을 직접 도출한다. T3/S3 오너 집합은 서로 독립(briefing 토글이 s3 에
 * 커플링되지 않음). 각 오너의 수업일 게이트를 통과한 경우에만 발송한다.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DB = ReturnType<typeof getDb>;

/**
 * 오너의 오늘 수업일 여부. schoolDayCalendar 행이 없으면(NEIS 미동기) 수업일 아님으로
 * 간주해 조용히 스킵 — 오발송 회피. is_school_day===false 도 스킵.
 */
async function isSchoolDayFor(
  db: DB,
  ownerId: string,
  today: string,
): Promise<boolean> {
  const rows = await db
    .select({ isSchoolDay: schema.schoolDayCalendar.isSchoolDay })
    .from(schema.schoolDayCalendar)
    .where(
      and(
        eq(schema.schoolDayCalendar.ownerId, ownerId),
        eq(schema.schoolDayCalendar.date, today),
      ),
    )
    .limit(1);
  return rows[0]?.isSchoolDay === true;
}

export async function GET(request: NextRequest) {
  if (!authorizeCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  const year = now.getFullYear();
  const semester = activeSemester(now);
  const { date: today, weekday } = kstToday();

  const skipped = { teacherNotSchoolDay: 0, teacherEmpty: 0, studentNotSchoolDay: 0 };

  // ── T3: 교사 아침 브리핑 ──
  const teacherSubs = await db
    .select({
      ownerId: schema.pushSubscriptions.ownerId,
      prefs: schema.pushSubscriptions.prefs,
    })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.audience, "teacher"));
  const teacherOwners = distinctTeacherBriefingOwners(teacherSubs);

  let teacherBriefings = 0;
  for (const ownerId of teacherOwners) {
    if (!(await isSchoolDayFor(db, ownerId, today))) {
      skipped.teacherNotSchoolDay += 1;
      continue;
    }
    const [lessons, nudges, tiers, events] = await Promise.all([
      listTodayLessons(db, ownerId, today, weekday, year, semester),
      collectNudges(db, ownerId, year),
      listPendingReportTiers(db, ownerId),
      getEventsInRange(db, ownerId, today, today),
    ]);
    const nudgeCount =
      nudges.unrecordedObservations.length +
      (nudges.behaviorNotes?.pendingCount ?? 0) +
      nudges.pendingCounselLogs.length;
    const body = composeBriefingBody({
      lessons: lessons.length,
      nudges: nudgeCount,
      reports: tiers.length,
      events: events.length,
    });
    if (body === null) {
      skipped.teacherEmpty += 1;
      continue;
    }
    await sendToTeacher(db, ownerId, "briefing", {
      title: "오늘의 학교 브리핑",
      body,
      url: "/today",
    });
    teacherBriefings += 1;
  }

  // ── S3: 학생 서류 리마인드 (T3 와 독립적인 오너 집합) ──
  const studentSubs = await db
    .select({
      ownerId: schema.publicPages.ownerId,
      prefs: schema.pushSubscriptions.prefs,
    })
    .from(schema.pushSubscriptions)
    .innerJoin(
      schema.publicPages,
      eq(schema.pushSubscriptions.publicPageId, schema.publicPages.id),
    )
    .where(eq(schema.pushSubscriptions.audience, "student"));
  const studentOwners = distinctStudentS3Owners(studentSubs);

  let studentReminders = 0;
  for (const ownerId of studentOwners) {
    if (!(await isSchoolDayFor(db, ownerId, today))) {
      skipped.studentNotSchoolDay += 1;
      continue;
    }
    const unsubmitted = await listUnsubmittedAttendance(db, ownerId, year);
    const studentYearIds = [...new Set(unsubmitted.map((r) => r.studentYearId))];
    if (studentYearIds.length === 0) continue;

    const pages = await db
      .select({
        id: schema.publicPages.id,
        token: schema.publicPages.token,
        revokedAt: schema.publicPages.revokedAt,
        expiresAt: schema.publicPages.expiresAt,
      })
      .from(schema.publicPages)
      .where(
        and(
          eq(schema.publicPages.ownerId, ownerId),
          inArray(schema.publicPages.studentYearId, studentYearIds),
        ),
      );
    const active = filterActiveStudentTargets(pages);

    // 학생마다 자기 token 딥링크가 맞아야 하므로 개별 호출(prefs.s3 필터는 sendToStudents 내부 처리).
    for (const page of active) {
      await sendToStudents(db, [{ publicPageId: page.id }], "s3", {
        title: "제출할 서류가 있어요",
        body: "미제출 서류를 확인해 주세요.",
        url: `/p/${page.token}`,
      });
      studentReminders += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    teacherBriefings,
    studentReminders,
    skipped,
  });
}
