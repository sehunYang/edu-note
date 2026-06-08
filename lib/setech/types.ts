/**
 * 세특 코워크 내보내기 타입 (계획 §3.3 결정2, §3.5 /lib/setech).
 *
 * Phase 1 은 서버사이드 Claude 호출을 쓰지 않는다. 대신 지침+관찰+수행평가+활동을
 * 하나의 프롬프트 번들로 묶어 교사가 코워크(Claude Code)에 붙여넣어 생성하고,
 * 결과를 다시 붙여넣어 바이트 검수 후 저장한다(source=cowork).
 */
import type { SpecialNoteType } from "@/lib/domain/types";

/** 수행평가 한 건(세특 근거). 점수·줄글은 선택. */
export interface SetechPerformance {
  name: string;
  score?: string | null;
  prose?: string | null;
}

/** 한 학생·한 유형의 세특 생성을 위한 원천 데이터 묶음. */
export interface SetechSourceBundle {
  studentName: string;
  noteType: SpecialNoteType;
  /** 교과세특일 때 과목명. */
  subjectName?: string | null;
  /** 교과 관찰기록 / 행특 기록 본문들. */
  observations: string[];
  /** 수행평가(이름·점수·줄글). */
  performances: SetechPerformance[];
  /** 자율/진로/동아리 활동 기입 본문들. */
  activities: string[];
  /** 학생 추가메모. */
  extraNotes: string[];
  /** 교과/행특 키워드. */
  keywords: string[];
}
