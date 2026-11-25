
import type { RelatedProductCardItem } from "app/lib/product-related";
import type { RegisterAnalog } from "app/lib/product-register-analogs";

// People search parts by number: the maker's article, a cross-reference code,
// or another brand's equivalent. Search Console showed product pages already
// listed for such numbers but rarely clicked, and the numbers themselves were
// scattered (chips by the title, cards rendered on the client). This block
// states them as plain, server-rendered text in one place.

const MAX_ANALOGS = 10;
// Supplier catalogs list dozens of equivalents; past this the list stops
// helping anyone pick a part.
const MAX_NUMBERS = 40;

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
  // Analog numbers from the 1C register (ор_ГруппыАналогов), with the brand.
  registerAnalogs?: RegisterAnalog[];
  analogs: RelatedProductCardItem[];
};

export default function ProductCrossReferences({
  article,
  producer,
  crossReferenceCodes,
  registerAnalogs = [],
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

  if (!article && crossReferenceCodes.length === 0 && analogItems.length === 0 && registerAnalogs.length === 0) {
    return null;
  }

  // One entry per number: the register's brand wins over a bare code from
  // the name or a related card.
  const numbers: Array<{ number: string; brand: string }> = [];
  const indexByKey = new Map<string, number>();
  const addNumber = (number: string, brand: string) => {
    const key = compactCode(number).toLowerCase();
    if (!key || key === ownKey) return;
    const index = indexByKey.get(key);
    if (index !== undefined) {
      if (!numbers[index].brand && brand) numbers[index].brand = brand;
      return;
    }
    indexByKey.set(key, numbers.length);
    numbers.push({ number, brand });
  };
  for (const item of registerAnalogs) addNumber(item.article, item.brand);
  for (const code of crossReferenceCodes) addNumber(code, "");
  for (const item of analogItems) addNumber(item.article, item.producer || "");
  const shownNumbers = numbers.slice(0, MAX_NUMBERS);
  if (shownNumbers.length === 0 && spellings.length === 0) return null;

  // Search pages are noindex,follow; nofollow keeps crawlers on product URLs.
  return (
    <div className="product-analog-numbers">
      {shownNumbers.length ? (
        <div className="product-analog-numbers-row">
          <p className="product-analog-numbers-label">Аналоги та крос-номери</p>
          <ul className="product-analog-code-list">
            {shownNumbers.map(({ number, brand }) => (
              <li key={number}>
                <a
                  href={`/katalog?search=${encodeURIComponent(number)}&filter=all`}
                  rel="nofollow"
                  title={`Шукати ${number} у каталозі`}
                >
                  {brand ? <span className="product-analog-code-brand">{brand}</span> : null}
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
