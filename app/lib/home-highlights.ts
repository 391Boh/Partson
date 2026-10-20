export type HomeHighlight = {
  id: string;
  kind: "article" | "service";
  title: string;
  description: string;
  href: string;
  image: string;
  imageAlt: string;
  meta: string;
  action: string;
};

export const HOME_BLOG_OVERVIEW: HomeHighlight = {
  id: "blog-overview",
  kind: "article",
  title: "Корисні поради для вашого авто",
  description: "Як вибрати запчастини та подбати про автомобіль — читайте в блозі PartsON.",
  href: "/blog",
  image: "/Car-parts-fullwidth.webp",
  imageAlt: "Автозапчастини PartsON",
  meta: "Блог PartsON",
  action: "Відкрити блог",
};
