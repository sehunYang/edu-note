"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/owner";
import {
  deriveGoogleEventId,
  validateMemoTime,
  buildGoogleEventPayload,
  isAccessTokenFresh,
  mapGoogleEventToDisplay,
  filterExternalGoogleEvents,
  type GoogleEventDisplayItem,
} from "@/lib/domain/google-event";
import {
  encryptToken,
  decryptToken,
  refreshAccessToken,
  insertEvent,
  deleteEvent,
  listEvents,
  GoogleAuthExpiredError,
} from "@/lib/integrations/google-calendar";
import {
  listTodayMemos,
  listTodayMemosInRange,
  createTodayMemo,
  updateTodayMemo,
  deleteTodayMemo,
  getEventsInRange,
  listHomeroomReservationsInRange,
  writeAudit,
  getGoogleConnection,
  cacheAccessToken,
  setGoogleSyncError,
  type TodayMemoRow,
  type GoogleConnectionRow,
} from "@/lib/db/queries";

/**
 * 오늘의 학교 서버액션 (QC v5 c7 B.3/B.4). 패턴: getOwnerId → 쿼리 → writeAudit →
 * revalidatePath (homeroom/activities/actions.ts 동형). 메모는 오늘의학교 전용이라
 * 공개 페이지/타 캘린더에는 노출하지 않는다.
 *
 * 구글 캘린더 동기화(계획 v4 5단계): 교사가 추가한 메모만 단방향 push. 실패해도
 * 로컬 저장은 항상 성공한다(원칙 3) — pushMemoToGoogle은 절대 throw하지 않는다.
 */

type DB = ReturnType<typeof getDb>;

/** access token 확보: 캐시가 신선하면 재사용, 아니면 refresh 후 캐시 갱신(AC-12). */
async function getFreshAccessToken(
  db: DB,
  ownerId: string,
  connection: GoogleConnectionRow,
): Promise<string> {
  if (isAccessTokenFresh(connection.accessTokenExpiresAt, new Date())) {
    return decryptToken(connection.accessTokenEnc!);
  }
  const refreshToken = decryptToken(connection.refreshTokenEnc);
  const refreshed = await refreshAccessToken(refreshToken);
  await cacheAccessToken(
    db,
    ownerId,
    encryptToken(refreshed.accessToken),
    refreshed.expiresAt,
  );
  return refreshed.accessToken;
}

/** 구글 push 실패 시 last_error + audit만 기록하고 절대 다시 throw하지 않는다. */
async function recordGoogleSyncFailure(
  db: DB,
  ownerId: string,
  memoId: string,
  err: unknown,
): Promise<void> {
  const message =
    err instanceof GoogleAuthExpiredError
      ? "구글 재연결 필요"
      : err instanceof Error
        ? err.message
        : String(err);
  await setGoogleSyncError(db, ownerId, message);
  await writeAudit(db, ownerId, "gcal_sync_fail", memoId, { reason: message });
}

/** 메모 생성/수정을 구글 캘린더로 push(best-effort, 원칙 3). */
async function pushMemoToGoogle(
  db: DB,
  ownerId: string,
  memo: {
    id: string;
    date: string;
    content: string;
    startTime: string | null;
    endTime: string | null;
  },
): Promise<void> {
  const connection = await getGoogleConnection(db, ownerId);
  if (!connection || !connection.syncEnabled) return;
  try {
    const accessToken = await getFreshAccessToken(db, ownerId, connection);
    const eventId = deriveGoogleEventId(memo.id);
    const payload = buildGoogleEventPayload({
      date: memo.date,
      startTime: memo.startTime,
      endTime: memo.endTime,
      content: memo.content,
    });
    await insertEvent(accessToken, connection.calendarId, eventId, payload);
    await setGoogleSyncError(db, ownerId, null);
  } catch (err) {
    await recordGoogleSyncFailure(db, ownerId, memo.id, err);
  }
}

/**
 * 구글 캘린더 → 오늘의 학교 읽기(읽기 전용, 쓰기 없음). 연결 없음/조회 실패는
 * 조용히 빈 배열(원칙 3과 동일한 정신 — 실패해도 페이지는 정상 렌더). 우리가
 * 직접 push한 이벤트(같은 기간 로컬 메모에서 파생된 id)는 중복 표시 방지를 위해
 * 제외한다.
 */
export async function fetchGoogleEventsInRange(
  from: string,
  to: string,
): Promise<GoogleEventDisplayItem[]> {
  const ownerId = await getOwnerId();
  const db = getDb();
  const connection = await getGoogleConnection(db, ownerId);
  if (!connection || !connection.syncEnabled) return [];
  try {
    const accessToken = await getFreshAccessToken(db, ownerId, connection);
    const timeMin = `${from}T00:00:00+09:00`;
    const timeMax = `${to}T23:59:59+09:00`;
    const [rawEvents, localMemos] = await Promise.all([
      listEvents(accessToken, connection.calendarId, timeMin, timeMax),
      listTodayMemosInRange(db, ownerId, from, to),
    ]);
    const external = filterExternalGoogleEvents(
      rawEvents,
      localMemos.map((m) => m.id),
    );
    return external
      .map(mapGoogleEventToDisplay)
      .filter((x): x is GoogleEventDisplayItem => x !== null);
  } catch {
    return [];
  }
}

export interface CalendarRangeData {
  events: { date: string; title: string }[];
  counsel: { date: string; studentLabel: string }[];
  memos: TodayMemoRow[];
  googleEvents: GoogleEventDisplayItem[];
}

/** 월 네비게이션 시 해당 월 범위([from, to])의 학사일정·상담·메모·구글일정을 재조회(B.3/B.4). */
export async function fetchCalendarRange(
  from: string,
  to: string,
): Promise<CalendarRangeData> {
  const ownerId = await getOwnerId();
  const db = getDb();
  const year = new Date().getFullYear();
  const [events, reservations, memos, googleEvents] = await Promise.all([
    getEventsInRange(db, ownerId, from, to),
    listHomeroomReservationsInRange(db, ownerId, year, from, to),
    listTodayMemosInRange(db, ownerId, from, to),
    fetchGoogleEventsInRange(from, to),
  ]);
  return {
    events: events.map((e) => ({ date: e.date, title: e.title })),
    counsel: reservations.map((c) => ({
      date: c.date,
      studentLabel: c.studentLabel,
    })),
    memos,
    googleEvents,
  };
}

/** 특정 날짜의 메모 목록 조회(날짜 클릭 모달, B.4). */
export async function listMemosForDate(date: string): Promise<TodayMemoRow[]> {
  const ownerId = await getOwnerId();
  const db = getDb();
  return listTodayMemos(db, ownerId, date);
}

/** 메모 추가("일정 추가하기", B.4). startTime/endTime 은 선택(미입력=종일). */
export async function createMemoAction(
  date: string,
  content: string,
  startTime?: string,
  endTime?: string,
): Promise<TodayMemoRow[]> {
  const ownerId = await getOwnerId();
  const trimmed = content.trim();
  if (!date || !trimmed) return [];
  const normalizedStart = startTime ?? null;
  const normalizedEnd = endTime ?? null;
  if (!validateMemoTime(normalizedStart, normalizedEnd).ok) return [];
  const db = getDb();
  const { id } = await createTodayMemo(
    db,
    ownerId,
    date,
    trimmed,
    normalizedStart,
    normalizedEnd,
  );
  await writeAudit(db, ownerId, "today_memo_create", id, { date });
  await pushMemoToGoogle(db, ownerId, {
    id,
    date,
    content: trimmed,
    startTime: normalizedStart,
    endTime: normalizedEnd,
  });
  revalidatePath("/today");
  return listTodayMemos(db, ownerId, date);
}

/** 메모 수정(B.4). startTime/endTime 은 선택(미입력=종일). */
export async function updateMemoAction(
  id: string,
  date: string,
  content: string,
  startTime?: string,
  endTime?: string,
): Promise<TodayMemoRow[]> {
  const ownerId = await getOwnerId();
  const trimmed = content.trim();
  if (!id || !trimmed) return listMemosForDate(date);
  const normalizedStart = startTime ?? null;
  const normalizedEnd = endTime ?? null;
  if (!validateMemoTime(normalizedStart, normalizedEnd).ok) return listMemosForDate(date);
  const db = getDb();
  await updateTodayMemo(db, ownerId, id, trimmed, normalizedStart, normalizedEnd);
  await writeAudit(db, ownerId, "today_memo_update", id, null);
  await pushMemoToGoogle(db, ownerId, {
    id,
    date,
    content: trimmed,
    startTime: normalizedStart,
    endTime: normalizedEnd,
  });
  revalidatePath("/today");
  return listTodayMemos(db, ownerId, date);
}

/** 메모 삭제(B.4). 구글 delete 실패해도 로컬 삭제는 항상 진행(AC-13). */
export async function deleteMemoAction(
  id: string,
  date: string,
): Promise<TodayMemoRow[]> {
  const ownerId = await getOwnerId();
  if (!id) return listMemosForDate(date);
  const db = getDb();

  const connection = await getGoogleConnection(db, ownerId);
  if (connection && connection.syncEnabled) {
    try {
      const accessToken = await getFreshAccessToken(db, ownerId, connection);
      await deleteEvent(accessToken, connection.calendarId, deriveGoogleEventId(id));
      await setGoogleSyncError(db, ownerId, null);
    } catch (err) {
      await recordGoogleSyncFailure(db, ownerId, id, err);
    }
  }

  await deleteTodayMemo(db, ownerId, id);
  await writeAudit(db, ownerId, "today_memo_delete", id, null);
  revalidatePath("/today");
  return listTodayMemos(db, ownerId, date);
}
