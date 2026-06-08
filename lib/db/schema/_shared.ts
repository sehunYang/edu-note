import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * 공통 컬럼 헬퍼 (계획 §3.3: 모든 테이블 owner_id·created_at·updated_at).
 *
 * 각 호출은 새 컬럼 빌더를 반환한다(빌더 인스턴스를 여러 테이블에서 공유하면
 * 안 되므로 함수로 감싼다).
 */

/** 기본 키: uuid, gen_random_uuid() 기본값. */
export const pk = () => uuid("id").primaryKey().defaultRandom();

/** 소유자 = auth.uid() (RLS 범위). 단일 교사이지만 모든 행에 부여. */
export const ownerId = () => uuid("owner_id").notNull();

/** created_at / updated_at (timestamptz, now() 기본값). */
export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
