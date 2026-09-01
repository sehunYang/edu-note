/**
 * 꺼진 선택 기능 자리에 놓는 안내 (배포판 S4).
 *
 * 배포판에서는 NEIS 키·구글 연동 없이 쓰는 것이 정상 상태다. 그런 배포에서
 * 눌러도 실패하는 버튼을 보여주는 대신, **무엇을 등록하면 켜지는지**를 알려준다.
 *
 * 서버 컴포넌트에서만 쓴다(키 값이 아니라 boolean 판정 결과만 다룬다).
 */
export function FeatureOff({
  title,
  description,
  howTo,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  howTo: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section className="mt-4 rounded-xl border border-hairline bg-black/20 p-4">
      <h3 className="text-sm text-neutral-700">{title}</h3>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
      <p className="mt-2 text-xs text-neutral-500">{howTo}</p>
      {href && (
        <a
          href={href}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel={href.startsWith("http") ? "noreferrer" : undefined}
          className="mt-3 inline-block text-xs text-neutral-700 underline underline-offset-2"
        >
          {linkLabel ?? "설정 방법 보기"} →
        </a>
      )}
    </section>
  );
}
