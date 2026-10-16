// Blog articles talk about parts the store sells, but authors write plain text
// with no links. These topics turn the first mention of each into a link to
// the matching catalog group, and feed the "Підібрати в каталозі" block under
// the article — internal links that tie the article to the product pages.
export type BlogTopic = { href: string; label: string; pattern: RegExp };

// Word stems with a Cyrillic-aware word boundary: `\b` does not work for
// Cyrillic in JavaScript regular expressions.
const W = "[а-яіїєґa-z0-9'’-]*";
const START = "(?<![а-яіїєґa-z0-9])";

const topic = (href: string, label: string, source: string): BlogTopic => ({
  href,
  label,
  pattern: new RegExp(`${START}(?:${source})`, "iu"),
});

export const BLOG_TOPICS: BlogTopic[] = [
  topic("/groups/ridyna-ta-mastylo/motorne-mastylo-maslo", "Моторні оливи", `моторн${W} (?:олив|масл)${W}|масл${W} для двигуна`),
  topic("/groups/ridyna-ta-mastylo/mastylo-mekhanichnoyi-kpp-maslo-korobky", "Оливи для МКПП", `трансмісійн${W} олив${W}`),
  topic("/groups/ridyna-ta-mastylo/mastylo-u-hpk-hidropidsylyuvach-kerma", "Оливи для ГПК", `гідропідсилювач${W} керма`),
  topic("/groups/ridyna-ta-mastylo/okholodzhuyucha-ridyna-antyfryz-kontsentrat", "Антифриз", `антифриз${W}|охолоджувальн${W} рідин${W}`),
  topic("/groups/ridyna-ta-mastylo/halmivna-ridyna-dot4-5", "Гальмівна рідина", `гальмівн${W} рідин${W}`),
  topic("/groups/detali-dlya-to/maslyanyy-filtr", "Масляні фільтри", `маслян${W} фільтр${W}`),
  topic("/groups/detali-dlya-to/povitryanyy-filtr-povitrya", "Повітряні фільтри", `повітрян${W} фільтр${W}`),
  topic("/groups/detali-dlya-to/filtr-palyva-palyvnyy", "Паливні фільтри", `паливн${W} фільтр${W}`),
  topic("/groups/detali-dlya-to/filtr-salonu-salonnyy", "Салонні фільтри", `салонн${W} фільтр${W}|фільтр${W} салону`),
  topic("/groups/halmivna-systema/halmivni-kolodky", "Гальмівні колодки", `гальмівн${W} колодк${W}`),
  topic("/groups/halmivna-systema/halmivni-dysky", "Гальмівні диски", `гальмівн${W} диск${W}`),
  topic("/groups/amortyzatsiya/amortyzator-pidvisky", "Амортизатори", `амортизатор${W}`),
  topic("/groups/detali-dvyhuna/komplekty-remeni-hrm", "Комплекти ГРМ", `ремін${W} грм|комплект${W} грм`),
];

const MAX_INLINE_LINKS = 5;

/** Topics an article covers, in the order they first appear. */
export function findBlogTopics(text: string): BlogTopic[] {
  return BLOG_TOPICS.map((entry) => ({ entry, index: text.search(entry.pattern) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(({ entry }) => entry);
}

export type BlogTextPart = string | { text: string; href: string };

/**
 * Splits plain article text so the first mention of each topic becomes a
 * link. `linked` is shared across one article render, so each topic is linked
 * once and the article gets at most MAX_INLINE_LINKS of them.
 */
export function linkBlogTopics(text: string, linked: Set<string>): BlogTextPart[] {
  if (linked.size >= MAX_INLINE_LINKS) return [text];
  let best: { start: number; end: number; href: string } | null = null;
  for (const entry of BLOG_TOPICS) {
    if (linked.has(entry.href)) continue;
    const match = entry.pattern.exec(text);
    if (match && (!best || match.index < best.start)) {
      best = { start: match.index, end: match.index + match[0].length, href: entry.href };
    }
  }
  if (!best) return [text];
  linked.add(best.href);
  const before = text.slice(0, best.start);
  const rest = text.slice(best.end);
  return [
    ...(before ? [before] : []),
    { text: text.slice(best.start, best.end), href: best.href },
    ...linkBlogTopics(rest, linked).filter((part) => part !== ""),
  ];
}
