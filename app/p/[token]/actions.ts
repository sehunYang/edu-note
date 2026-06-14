"use server";
import { revalidatePath } from "next/cache";
import {
  saveElectiveMapping,
  reserveCounsel,
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
