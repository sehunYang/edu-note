/**
 * 디바이스 판별 (QC v4 #9). 서버 User-Agent 기반 모바일 감지.
 *
 * 루트(/) 진입 시 모바일이면 /today 로 리다이렉트하는 데 사용한다.
 * 순수 함수이므로 단위 테스트한다.
 */

/** 모바일 단말 User-Agent 패턴(태블릿 포함). */
const MOBILE_UA_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i;

/**
 * User-Agent 문자열이 모바일 단말인지 판별한다.
 * null/빈 문자열(헤더 없음)은 데스크톱으로 간주한다.
 */
export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return MOBILE_UA_PATTERN.test(userAgent);
}

/**
 * 루트(/) 진입 시 모바일을 /today 로 보낼지 결정한다(QC v6 ⑥ AC-6.2).
 * "세션당 1회": today_seen 쿠키가 있으면(=이미 한 번 봤으면) 리다이렉트하지 않아
 * 메인에 머물 수 있다. 순수 함수 — 미들웨어에서 분기에 사용하고 단위 테스트한다.
 */
export function shouldRedirectMobileToToday(params: {
  pathname: string;
  userAgent: string | null | undefined;
  hasTodaySeenCookie: boolean;
}): boolean {
  return (
    params.pathname === "/" &&
    isMobileUserAgent(params.userAgent) &&
    !params.hasTodaySeenCookie
  );
}
