/**
 * 활동 입력 일괄 저장 폼의 필드 이름 규칙 (사용성 개선 P2-11).
 *
 * `"use server"` 파일은 async 함수만 export 할 수 있어 actions.ts 에 상수를 둘 수
 * 없다. 서버액션과 클라이언트 폼이 같은 키 규칙을 공유해야 하므로 별도 모듈로 뺀다.
 *
 *  - 공통 내용:   `common__<날짜>`
 *  - 개별 메모:   `ovr__<날짜>__<studentYearId>`
 */
export const COMMON_FIELD_PREFIX = "common__";
export const OVERRIDE_FIELD_PREFIX = "ovr__";
