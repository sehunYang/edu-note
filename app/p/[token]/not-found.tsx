/**
 * 학생 공개 페이지 전용 404 (사용성 개선 P0-3). 전역 not-found 는 "홈으로"·
 * "오늘의 학교" 로 안내하는데 이 둘은 교사 전용 경로라 학생이 누르면 로그인
 * 화면으로 떨어진다. 잘못된/만료된 링크를 연 학생에게는 이동 링크 대신
 * 담임에게 문의하라는 안내가 유일하게 실행 가능한 다음 행동이다.
 */
export default function PublicNotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl" aria-hidden="true">
        🔗
      </p>
      <h1 className="mt-4 text-xl tracking-tight">
        사용할 수 없는 링크입니다
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-500">
        링크가 만료되었거나 주소가 잘못되었습니다.
        <br />
        담임 선생님께 새 링크를 요청해 주세요.
      </p>
    </main>
  );
}
