"use server";
import { revalidatePath } from "next/cache";
import {
  saveElectiveMapping,
  reserveCounsel,
  requestCounselCancel,
  saveStudentMemo,
  deleteStudentMemo,
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

/** 학생 개인 메모 삭제. QC v6 ⑤. */
export async function deleteStudentMemoAction(
  token: string,
  id: string,
): Promise<StudentWriteResult> {
  const res = await deleteStudentMemo(token, id);
  if (res.ok) revalidatePath(`/p/${token}`);
  return res;
}
