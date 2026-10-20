
import type { RelatedProductCardItem } from "app/lib/product-related";

// People search parts by number: the maker's article, a cross-reference code,
// or another brand's equivalent. Search Console showed product pages already
// listed for such numbers but rarely clicked, and the numbers themselves were
// scattered (chips by the title, cards rendered on the client). This block
// states them as plain, server-rendered text in one place.

const MAX_ANALOGS = 10;

const compactCode = (value: string) => value.replace(/[\s.\-/]+/g, "");

// Bosch prints its 10-character numbers grouped "1 987 945 328", and buyers
// type them either way.
const boschSpaced = (value: string) =>
  /^[0-9A-Z]{10}$/i.test(value)
    ? `${value.slice(0, 1)} ${value.slice(1, 4)} ${value.slice(4, 7)} ${value.slice(7)}`
    : "";

const articleSpellings = (article: string, producer: string) => {
  const spellings = new Set<string>();
  const compact = compactCode(article);
  if (compact && compact !== article) spellings.add(compact);
  if (/^bosch$/i.test(producer.trim())) {
    const spaced = boschSpaced(compact);
    if (spaced) spellings.add(spaced);
  }
  spellings.delete(article);
  return Array.from(spellings);
};

type ProductCrossReferencesProps = {
  article: string;
  producer: string;
  crossReferenceCodes: string[];
  analogs: RelatedProductCardItem[];
};

export default function ProductCrossReferences({
  article,
  producer,
  crossReferenceCodes,
  analogs,
}: ProductCrossReferencesProps) {
  const ownKey = compactCode(article).toLowerCase();
  const analogItems = analogs
    .filter((item) => item.article && compactCode(item.article).toLowerCase() !== ownKey)
    .filter(
      (item, index, list) =>
        list.findIndex(
          (other) =>
            compactCode(other.article).toLowerCase() === compactCode(item.article).toLowerCase() &&
            other.producer === item.producer
        ) === index
    )
    .slice(0, MAX_ANALOGS);
  const spellings = article ? articleSpellings(article, producer) : [];

  if (!article && crossReferenceCodes.length === 0 && analogItems.length === 0) return null;


  const numbers = Array.from(new Set([...crossReferenceCodes, ...analogItems.map((item) => item.article)]))
    .filter((number) => compactCode(number).toLowerCase() !== ownKey);
  if (numbers.length === 0 && spellings.length === 0) return null;

  // Search pages are noindex,follow; nofollow keeps crawlers on product URLs.
  return (
    <div className="product-analog-numbers">
      {numbers.length ? (
        <div className="product-analog-numbers-row">
          <p className="product-analog-numbers-label">Крос-номери</p>
          <ul className="product-analog-code-list">
            {numbers.map((number) => (
              <li key={number}>
                <a
                  href={`/katalog?search=${encodeURIComponent(number)}&filter=all`}
                  rel="nofollow"
                  title={`Шукати ${number} у каталозі`}
                >
                  {number}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {spellings.length ? (
        <p className="product-analog-spellings">
          {article}{producer ? ` ${producer}` : ""} також шукають як: {spellings.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
