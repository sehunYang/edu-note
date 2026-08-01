"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  getOwnerClub,
  listClubActivityRecords,
  upsertClubActivityRecord,
  upsertClubStudentOverride,
  writeAudit,
} from "@/lib/db/queries";
import { COMMON_FIELD_PREFIX, OVERRIDE_FIELD_PREFIX } from "./fields";

/**
 * 활동 입력 서버액션 (QC v5 c9 D.5, AC-9.6). 차시(날짜)별 공통내용 upsert +
 * 부원별 개별 메모 upsert. 개별 메모는 먼저 해당 차시 레코드를 보장(upsert)한 뒤
 * recordId 로 오버라이드를 저장한다. getOwnerId 가드 + audit + revalidate.
 */

export async function saveCommonAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const activityDate = String(formData.get("activityDate") ?? "").trim();
  if (!activityDate) return;
  const commonBody = String(formData.get("commonBody") ?? "").trim() || null;
  const db = getDb();
  const club = await getOwnerClub(db, ownerId);
  if (!club) return;
  const { id } = await upsertClubActivityRecord(
    db,
    ownerId,
    club.id,
    activityDate,
    commonBody,
  );
  await writeAudit(db, ownerId, "club_entry_common_save", id, { activityDate });
  revalidatePath("/clubroom/entry");
}

/**
 * 활동 입력 일괄 저장 (사용성 개선 P2-11).
 *
 * 이전에는 차시마다 "공통 저장" 1개 + 부원마다 "저장" 1개가 따로 있어, 11차시·
 * 부원 1명인 실제 화면에 저장 버튼이 22개였다(부원 20명이면 11 + 220 = 231회).
 * 화면 전체를 폼 하나로 묶어 한 번에 저장한다. 값이 바뀌지 않은 항목은 DB 를
 * 건드리지 않으므로, 전량 제출해도 쓰기는 실제 변경분에만 발생한다.
 */
export async function saveAllAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const db = getDb();
  const club = await getOwnerClub(db, ownerId);
  if (!club) return;

  const commons = new Map<string, string | null>();
  const overrides = new Map<string, Map<string, string | null>>();

  for (const [key, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;
    const value = raw.trim() || null;
    if (key.startsWith(COMMON_FIELD_PREFIX)) {
      const date = key.slice(COMMON_FIELD_PREFIX.length);
      if (date) commons.set(date, value);
    } else if (key.startsWith(OVERRIDE_FIELD_PREFIX)) {
      const [date, studentYearId] = key
        .slice(OVERRIDE_FIELD_PREFIX.length)
        .split("__");
      if (!date || !studentYearId) continue;
      if (!overrides.has(date)) overrides.set(date, new Map());
      overrides.get(date)!.set(studentYearId, value);
    }
  }

  // 현재 저장값과 대조해 변경분만 쓴다.
  const existing = await listClubActivityRecords(db, ownerId, club.id);
  const existingByDate = new Map(existing.map((r) => [r.activityDate, r]));

  const dates = new Set([...commons.keys(), ...overrides.keys()]);
  let writes = 0;

  for (const date of dates) {
    const prev = existingByDate.get(date);
    const nextCommon = commons.has(date) ? commons.get(date)! : (prev?.commonBody ?? null);
    const commonChanged = commons.has(date) && nextCommon !== (prev?.commonBody ?? null);

    const memos = overrides.get(date) ?? new Map<string, string | null>();
    const prevMemos = new Map(
      (prev?.overrides ?? []).map((o) => [o.studentYearId, o.body ?? null]),
    );
    const changedMemos = [...memos.entries()].filter(
      ([sid, body]) => body !== (prevMemos.get(sid) ?? null),
    );

    if (!commonChanged && changedMemos.length === 0) continue;

    // 오버라이드를 쓰려면 차시 레코드가 있어야 하므로 먼저 확보한다.
    const { id: recordId } = await upsertClubActivityRecord(
      db,
      ownerId,
      club.id,
      date,
      nextCommon,
    );
    writes++;

    for (const [studentYearId, body] of changedMemos) {
      await upsertClubStudentOverride(db, ownerId, recordId, studentYearId, body);
      writes++;
    }
  }

  await writeAudit(db, ownerId, "club_entry_bulk_save", club.id, {
    dates: dates.size,
    writes,
  });
  revalidatePath("/clubroom/entry");
}

export async function saveOverrideAction(formData: FormData): Promise<void> {
  const ownerId = await getOwnerId();
  const activityDate = String(formData.get("activityDate") ?? "").trim();
  const studentYearId = String(formData.get("studentYearId") ?? "").trim();
  const existingRecordId = String(formData.get("recordId") ?? "").trim();
  if (!activityDate || !studentYearId) return;
  const body = String(formData.get("body") ?? "").trim() || null;
  const db = getDb();
  const club = await getOwnerClub(db, ownerId);
  if (!club) return;
  // 차시 레코드 확보. 이미 있으면 그 id 사용(공통내용 보존), 없으면 commonBody=null
  // 로 신규 생성. existingRecordId 가 비면 upsert 가 (clubId,date) 로 조회/생성한다.
  let recordId = existingRecordId;
  if (!recordId) {
    const created = await upsertClubActivityRecord(
      db,
      ownerId,
      club.id,
      activityDate,
      null,
    );
    recordId = created.id;
  }
  const { id } = await upsertClubStudentOverride(
    db,
    ownerId,
    recordId,
    studentYearId,
    body,
  );
  await writeAudit(db, ownerId, "club_entry_override_save", id, {
    activityDate,
    studentYearId,
  });
  revalidatePath("/clubroom/entry");
}
