/** A hero title in two tiers: the name itself, and a trailing
 * "— каталог запчастин"-style tail set on its own quieter line. Titles
 * without such a tail render unchanged. */
export default function HeroTitleText({ title }: { title: string }) {
  const index = title.indexOf(" — ");
  if (index < 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, index)}
      <span className="directory-title-sub">{title.slice(index + 1)}</span>
    </>
  );
}
