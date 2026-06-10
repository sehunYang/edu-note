import { pgEnum } from "drizzle-orm/pg-core";

/**
 * 도메인 enum (계획 §3.3). 코드 식별자는 ascii, 한글 의미는 주석.
 * 표기 매핑은 /lib/domain 의 evalMethodDisplay 등에서 처리.
 */

// year_links: 연도 전환 매핑 3종 종결상태
export const linkStatus = pgEnum("link_status", [
  "auto_linked", // 유일매칭 자동연결
  "pending", // 동명이인 보류(수동 해소 큐)
  "new_person", // 무매칭 → 신규 person
]);

// subjects.eval_method: 평가방식
export const evalMethod = pgEnum("eval_method", [
  "rel_abs", // 상대+절대
  "abs", // 절대만
  "ach3", // 성취도 3단계
]);

// creative_activity_records.area: 창체 영역(자율/동아리/진로)
export const creativeArea = pgEnum("creative_area", [
  "autonomy", // 자율
  "club", // 동아리
  "career", // 진로
]);

// student_activity_entries.tag / placement
export const activityTag = pgEnum("activity_tag", [
  "autonomy", // 자율
  "career", // 진로
  "both", // 둘 다(생성 시 placement 1곳 확정)
]);
export const activityPlacement = pgEnum("activity_placement", [
  "autonomy",
  "career",
]);

// timetable_slots.source
export const timetableSource = pgEnum("timetable_source", [
  "comcigan", // 컴시간 동기화
  "manual", // 수기
]);

// class_sessions.status: 시수
export const sessionStatus = pgEnum("session_status", [
  "planned", // 예정
  "done", // 진행됨
  "not_held", // 미진행(불이행)
]);

// special_note_drafts.type / status / source
export const specialNoteType = pgEnum("special_note_type", [
  "autonomy", // 자율
  "club", // 동아리
  "career", // 진로
  "subject", // 교과세특
  "behavior", // 행동발달
]);
export const specialNoteStatus = pgEnum("special_note_status", [
  "draft",
  "editing",
  "finalized",
]);
export const specialNoteSource = pgEnum("special_note_source", [
  "cowork", // Claude Code(코워크)에서 생성→붙여넣기 (Phase 1 기본)
  "api", // 추후 서버사이드 Claude API 경로
]);

// attendance_records: 사유 × 성격
export const attendanceReason = pgEnum("attendance_reason", [
  "illness", // 질병
  "accepted", // 인정
  "unaccepted", // 미인정
  "etc", // 기타
]);
export const attendanceKind = pgEnum("attendance_kind", [
  "late", // 지각
  "early_leave", // 조퇴
  "absent_period", // 결과(특정 교시 결석)
  "absent", // 결석
]);

// report_tracking.last_tier: 에스컬레이션 티어
export const reportTier = pgEnum("report_tier", [
  "normal", // 정상 (≤3 수업일)
  "warning", // 위험 (>3)
  "critical", // 심각 (>5)
]);

// counseling_logs.target
export const counselTarget = pgEnum("counsel_target", [
  "student", // 학생
  "parent", // 학부모
]);

// calendar_events.source / cca_area
export const calendarSource = pgEnum("calendar_source", [
  "neis", // 공공 API 학사일정
  "manual", // 교사 수동
  "personal", // 개인 일정
  "task", // 업무 데드라인
]);
export const ccaArea = pgEnum("cca_area", [
  "autonomy", // 자율
  "club", // 동아리
  "career", // 진로
  "volunteer", // 봉사
]);

// calendar_events.event_kind: 키워드 자동 분류(QC v1 C3) — 시험/방학식/개학식/동아리
export const eventKind = pgEnum("event_kind", [
  "exam", // 지필평가/고사 (examSemester·examOrdinal 동반)
  "vacation_start", // 방학식
  "vacation_end", // 개학식
  "club", // 동아리 활동
  "none", // 미분류(기본)
]);
