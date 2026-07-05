import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { publicPages } from "../schema/misc";

/**
 * 공개 토큰 페이지 발급/폐기/재발급 쿼리 계층 (계획 §3.2, AC-I).
 *
 * 토큰은 DB 기본값 `encode(gen_random_bytes(16),'hex')`(128bit)로 생성된다(앱이
 * 토큰 문자열을 만들지 않음). 폐기는 revoked_at 마커, 만료는 expires_at — 기본 만료는
 * 발급일 + 1년(보안점검 2026-07 ④, 0047 DB 기본값과 동일). 공개 읽기는
 * get_public_page(SECURITY DEFINER)만 사용하며 이 계층은 발급/관리(소유자 전용)만 담당.
 */
type DB = PostgresJsDatabase<typeof schema>;

/** 기본 만료 = 발급 시점 + 1년. 링크 유출 시 피해 기간을 한 학년도 수준으로 제한. */
function defaultExpiry(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

export interface IssuedPage {
  id: string;
  token: string;
}

export interface IssueOptions {
  teacherMessage?: string | null;
  expiresAt?: Date | null;
}

/**
 * 학생에게 새 공개 페이지(토큰)를 발급. 토큰은 DB 가 생성해 반환.
 * expiresAt 미지정 시 발급일 + 1년(명시적 null 전달 시에만 무기한).
 */
export async function issuePublicPage(
  db: DB,
  ownerId: string,
  studentYearId: string,
  opts: IssueOptions = {},
): Promise<IssuedPage> {
  const [row] = await db
    .insert(publicPages)
    .values({
      ownerId,
      studentYearId,
      teacherMessage: opts.teacherMessage ?? null,
      expiresAt: opts.expiresAt !== undefined ? opts.expiresAt : defaultExpiry(),
    })
    .returning({ id: publicPages.id, token: publicPages.token });
  return row;
}

/** 토큰 폐기(소유자 본인 행만). */
export async function revokePublicPage(
  db: DB,
  ownerId: string,
  id: string,
): Promise<void> {
  await db
    .update(publicPages)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(publicPages.id, id), eq(publicPages.ownerId, ownerId)));
}

/** 재발급 = 기존 활성 토큰 전부 폐기 후 새 토큰 발급(CSV 재배포 용). */
export async function reissuePublicPage(
  db: DB,
  ownerId: string,
  studentYearId: string,
  opts: IssueOptions = {},
): Promise<IssuedPage> {
  await db
    .update(publicPages)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(publicPages.ownerId, ownerId),
        eq(publicPages.studentYearId, studentYearId),
      ),
    );
  return issuePublicPage(db, ownerId, studentYearId, opts);
}

export interface PublicPageRow {
  id: string;
  studentYearId: string;
  token: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/** 소유자의 (학생별) 발급 이력 목록. 최신순. */
export async function listPublicPages(
  db: DB,
  ownerId: string,
  studentYearId?: string,
): Promise<PublicPageRow[]> {
  const where = studentYearId
    ? and(
        eq(publicPages.ownerId, ownerId),
        eq(publicPages.studentYearId, studentYearId),
      )
    : eq(publicPages.ownerId, ownerId);
  return db
    .select({
      id: publicPages.id,
      studentYearId: publicPages.studentYearId,
      token: publicPages.token,
      revokedAt: publicPages.revokedAt,
      expiresAt: publicPages.expiresAt,
      createdAt: publicPages.createdAt,
    })
    .from(publicPages)
    .where(where)
    .orderBy(desc(publicPages.createdAt));
}
