# Open Questions

## QC v5 Consensus Plan - 2026-06-16 (rev2, Architect+Critic 반영)
- [x] ~~급식 메뉴 join 구분자가 실제 `\n`인지~~ — **해결(M1)**: 0036:172-174 `string_agg(item, ', ')`로 `\n` 아님 확정. v5(0040)에서 `E'\n'`으로 변경 결정.
- [x] ~~여유차시 빈셀을 c2 도출이 무시하는 방식~~ — **해결(M2)**: `isSlackCell(plan)=(unitId==null && content==null)` predicate를 lib/domain/lesson-plan.ts에 1곳 정의·공용.
- [ ] 레거시 `app/club` 라우트: /clubroom 이관 후 제거 vs redirect 정책 — 외부 링크/북마크 영향.
- [ ] 영양(NTR_INFO) 재동기화 범위: 전체 meal_cache 재페치 vs 0035 마이그 이전 행만 — 운영 비용/NEIS rate.
- [ ] prod 마이그(0038/0039/0040) 적용 타이밍 — 사용자 승인 게이트(과거 v3/v4 관행).
- [ ] club_activity_sessions unique: `(club_id, date)` 단일 vs `(club_id, ordinal)` 병행 — Step 0.1 권장안=단일 `(club_id, date)`(M3 reconcile 정합).
- [ ] c4 dedupe: `reportTrackingId`가 null인 경로 존재 여부 — 폴백 사건식별자 `(studentYearId, source, recordId)` 필요성.
- [ ] c1 시프트 메커니즘: 택1 내림차순 +1 vs 택2 +1000 오프셋 2단계 — 비-deferrable unique 회피 최종 선택.
