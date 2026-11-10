export const formatCatalogCount = (count: number) => count.toLocaleString("uk-UA");

export const getCatalogProductWord = (count: number) => {
  const abs = Math.abs(count);
  const lastTwo = abs % 100;
  const last = abs % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return "товарів";
  if (last === 1) return "товар";
  if (last >= 2 && last <= 4) return "товари";
  return "товарів";
};

// Hook-free so the page's Suspense fallback renders the same tiles as the
// client counter and nothing shifts when the live value hydrates in.
export default function CatalogCountDigits({
  count,
  exact = true,
  previousCount = null,
}: {
  count: number;
  exact?: boolean;
  previousCount?: number | null;
}) {
  const safeCount = Math.max(0, count);
  const word = getCatalogProductWord(safeCount);
  const formatted = formatCatalogCount(safeCount);
  const groups = formatted.split(/\s/u);
  const previousDigits = previousCount === null ? null : String(Math.max(0, previousCount));
  const rolls = (digit: string, place: number) =>
    previousDigits !== null && previousDigits[previousDigits.length - 1 - place] !== digit;

  return (
    <span className="catalog-count">
      <span className="sr-only">{`${exact ? "" : "понад "}${formatted} ${word}`}</span>
      {!exact && <span className="catalog-count-unit" aria-hidden>понад</span>}
      <span className="catalog-count-digits" aria-hidden>
        {groups.map((group, groupIndex) => {
          const placesAfterGroup = groups.slice(groupIndex + 1).join("").length;
          return (
            <span className="catalog-count-group" key={groups.length - groupIndex}>
              {Array.from(group).map((digit, digitIndex) => {
                const place = placesAfterGroup + group.length - 1 - digitIndex;
                return (
                  // Keyed by place and value: a changed digit remounts with
                  // the roll, an unchanged one keeps its node and stays still.
                  <span
                    className={`catalog-count-digit${rolls(digit, place) ? " catalog-count-digit--roll" : ""}`}
                    key={`${place}-${digit}`}
                  >
                    {digit}
                  </span>
                );
              })}
            </span>
          );
        })}
      </span>
      <span className="catalog-count-unit" aria-hidden>{word}</span>
    </span>
  );
}
