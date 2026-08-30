import "server-only";
import { neisApiKey, anthropicApiKey, googleOAuth } from "./env";
import { resolveNeisKey } from "./runtime-key";

/**
 * 선택 기능 스위치 (배포판 S4).
 *
 * 배포판에서 교사가 Deploy 화면에 넣는 값은 이메일과 NEIS 키 두 개뿐이고, NEIS 키조차
 * 비워둘 수 있다. 그래서 **키가 없는 상태가 정상 상태**다.
 *
 * 원칙: 키가 없으면 그 기능이 **사라질 뿐**, 화면이 깨지거나 500 이 나지 않는다.
 * 사라진 자리에는 "무엇을 등록하면 쓸 수 있는지"를 안내한다.
 *
 * ⚠ 이 모듈은 server-only 다. 클라이언트에는 **boolean 만** props 로 내려보내고
 * 키 값 자체는 절대 넘기지 않는다.
 */
export interface Features {
  /** NEIS 개방포털 — 학사일정·급식·이번주 실제 시간표 */
  neis: boolean;
  /** 구글 OAuth — 구글 로그인 + 캘린더 양방향 동기화 */
  google: boolean;
  /** Anthropic API — 서버 측 Claude 호출(세특 코워크 경로는 키 없이도 동작) */
  claude: boolean;
}

function compute(): Features {
  return {
    neis: neisApiKey() !== null,
    google: googleOAuth() !== null,
    claude: anthropicApiKey() !== null,
  };
}

/**
 * 매 접근마다 env 를 다시 읽는다. 모듈 로드 시점에 고정하면 빌드 타임에 값이 굳어
 * 런타임에 추가한 키가 반영되지 않는다(시스템 상태 화면에서 키를 넣는 흐름 때문).
 */
export const features: Features = {
  get neis() {
    return compute().neis;
  },
  get google() {
    return compute().google;
  },
  get claude() {
    return compute().claude;
  },
};

/** 클라이언트로 내려보낼 안전한 스냅샷(순수 boolean). */
export function featureSnapshot(): Features {
  return compute();
}

/**
 * NEIS 만은 env 뿐 아니라 **DB 에 저장된 키**도 인정해야 한다 — 교사가 설치 후
 * 앱 안에서 넣을 수 있는 유일한 키이기 때문(S5). DB 접근이 필요해 비동기다.
 * 구글·Claude 는 env 로만 설정되므로 동기 `features` 로 충분하다.
 */
export async function neisEnabled(): Promise<boolean> {
  return (await resolveNeisKey()) !== null;
}

/** 서버 컴포넌트용 전체 스냅샷(DB 저장 키 포함). */
export async function resolveFeatures(): Promise<Features> {
  const base = compute();
  return { ...base, neis: await neisEnabled() };
}
