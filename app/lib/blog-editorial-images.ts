// Generated editorial compositions, based on the catalog/shop references
// documented beside the assets. These are article illustrations, not SKU photos.
const imageSet = (name: string, alt: string) => {
  const base = `/images/blog/editorial-v1/${name}`;
  return {
    src: `${base}-1200.webp`,
    preview: `${base}-960.webp`,
    alt,
    srcSet: `${base}-640.webp 640w, ${base}-960.webp 960w, ${base}-1200.webp 1200w`,
    crops: {
      "16x9": `${base}-1200.webp`,
      "4x3": `${base}-4x3.webp`,
      "1x1": `${base}-1x1.webp`,
    },
  };
};

export const BLOG_OVERVIEW_IMAGE = imageSet(
  "maintenance",
  "Гальмівний диск, оливний фільтр, щітки склоочисника та інструменти на темному фоні",
);

const editorialCovers: Record<string, ReturnType<typeof imageSet>> = {
  "pidhotovka-avto-do-zymy-shcho-pereviryty-i-zaminyty": imageSet(
    "winter",
    "Щітки склоочисника, автомобільні лампи та каністра на зимовому темному фоні",
  ),
  "halmivni-kolodky-i-dysky-koly-minyaty-ta-yak-vybraty": imageSet(
    "brakes",
    "Гальмівний диск і комплект гальмівних колодок на темному студійному фоні",
  ),
  "filtry-na-to-maslyanyy-povitryanyy-salonnyy-palyvnyy-koly-minyaty": imageSet(
    "filters",
    "Повітряний, оливний, салонні та паливний фільтри на темному фоні",
  ),
  "remin-hrm-koly-minyaty-i-chomu-krashche-braty-komplekt": imageSet(
    "timing",
    "Комплект ГРМ із зубчастим ременем, роликами та водяною помпою",
  ),
  "yak-pidibraty-zapchastynu-za-vin-kodom-oryhinal-chy-analoh": imageSet(
    "vin",
    "Гальмівний диск, оливний фільтр, котушка запалювання та інструменти для підбору деталей",
  ),
  "to-volkswagen-golf-iv-i-skoda-octavia-shcho-minyaty": imageSet(
    "golf-service",
    "Фільтри, гальмівний диск і ремінь ГРМ на тлі компактного автомобіля",
  ),
  "amortyzatory-oznaky-znosu-i-shcho-minyaty-razom-iz-nymy": imageSet(
    "shock-absorbers",
    "Пара амортизаторів, верхня опора, пильник і відбійник на темному фоні",
  ),
  "motorna-olyva-yak-pravylno-vybraty-maslo-dlya-dvyhuna-avtomobilya-xkptmq": imageSet(
    "motor-oil",
    "Три каністри моторної оливи та оливний фільтр на темному студійному фоні без написів",
  ),
};

export const getBlogEditorialCover = (post: { slug: string; imageDataUrl?: string }) => {
  // New uploads and explicit image removal take precedence over this replacement
  // for the legacy article covers. The original remains available in the editor.
  if (!post.imageDataUrl?.startsWith("data:image/")) return undefined;
  return Object.hasOwn(editorialCovers, post.slug) ? editorialCovers[post.slug] : undefined;
};

export const getBlogEditorialImageBySrc = (src: string) =>
  [BLOG_OVERVIEW_IMAGE, ...Object.values(editorialCovers)]
    .find(image => image.src === src || image.preview === src);
