import { redirect } from "next/navigation";

/**
 * 레거시 관찰/행특 경로 (교실 2-2 단계5). 교과 관찰은 교실 허브
 * `/classroom/observations` 로 격상, 행동특성은 담임 영역 `/homeroom/behavior` 로
 * 분리됨. 본 경로는 교과 관찰 홈으로 리다이렉트한다.
 */
export default function ObservationsRedirect() {
  redirect("/classroom/observations");
}
