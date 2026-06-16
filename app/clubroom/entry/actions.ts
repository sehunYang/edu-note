"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  getOwnerClub,
  upsertClubActivityRecord,
  upsertClubStudentOverride,
  writeAudit,
} from "@/lib/db/queries";

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
