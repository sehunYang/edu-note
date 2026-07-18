"use server";
import { revalidatePath } from "next/cache";
import {
  saveElectiveMapping,
  reserveCounsel,
  requestCounselCancel,
  saveStudentMemo,
  deleteStudentMemo,
  markNoticeRead,
  registerStudentPush,
  updateStudentPushPrefs,
  sendStudentTestPush,
  type StudentWriteResult,
} from "@/lib/public/student-write";

/**
 * 공개 학생 페이지(미인증) 토큰 스코프 서버액션 (QC v3 Part B, US-B13, AC-12.4/12.8).
 *
 * 클라이언트는 토큰만 보유 — 인증 세션 없음. 실제 권한 해석/쓰기는
 * lib/public/student-write(service-role, server-only)가 토큰→본인 학적으로만 수행한다.
 * 이 래퍼는 입력 정규화 + revalidate 만 담당한다.
 */

export async function saveElectiveAction(
  token: string,
  weekday: number,
  period: number,
  mappedSubject: string,
): Promise<StudentWriteResult> {
  const res = await saveElectiveMapping(token, weekday, period, mappedSubject);
  if (res.ok) revalidatePath(`/p/${token}`);
  return res;
}

export async function reserveCounselAction(
  token: string,
  date: string,
): Promise<StudentWriteResult> {
  const res = await reserveCounsel(token, date);
  if (res.ok) revalidatePath(`/p/${token}`);
  return res;
}

export async function requestCounselCancelAction(
  token: string,
  date: string,
): Promise<StudentWriteResult> {
  const res = await requestCounselCancel(token, date);
  if (res.ok) revalidatePath(`/p/${token}`);
  return res;
}

/** 학생 개인 메모 저장(신규/수정). QC v6 ⑤. id 미지정=신규. */
export async function saveStudentMemoAction(
  token: string,
  date: string,
  body: string,
  id?: string | null,
): Promise<StudentWriteResult> {
  const res = await saveStudentMemo(token, date, body, id);
  if (res.ok) revalidatePath(`/p/${token}`);
  return res;
}

/**
 * 공지 읽음 처리(v12). 학생이 공지를 열람하면 호출해 New 배지를 끈다.
 * revalidate 하지 않는다 — 스와이프 중 조회마다 fire-and-forget 로 호출되므로
 * 재렌더로 카드가 리셋되면 안 된다(효과는 다음 방문 시 반영).
 */
export async function markNoticeReadAction(
  token: string,
  noteId: string,
): Promise<StudentWriteResult> {
  return markNoticeRead(token, noteId);
}

/** 학생 개인 메모 삭제. QC v6 ⑤. */
export async function deleteStudentMemoAction(
  token: string,
  id: string,
): Promise<StudentWriteResult> {
  const res = await deleteStudentMemo(token, id);
  if (res.ok) revalidatePath(`/p/${token}`);
  return res;
}

/** 학생 웹푸시 구독 등록(push-notifications, US-6). revalidate 불필요(클라 상태로만 반영). */
export async function registerStudentPushAction(
  token: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<StudentWriteResult> {
  return registerStudentPush(token, subscription);
}

/** 학생 알림 설정 토글(S1/S2/S3). */
export async function updateStudentPushPrefAction(
  token: string,
  key: "s1" | "s2" | "s3",
  value: boolean,
): Promise<StudentWriteResult> {
  return updateStudentPushPrefs(token, key, value);
}

/** 학생 테스트 알림 발송(확정 publicPageId 1건만). */
export async function sendStudentTestPushAction(
  token: string,
): Promise<StudentWriteResult> {
  return sendStudentTestPush(token);
}
