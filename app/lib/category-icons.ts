const normalizeLabel = (value: string) => value.trim();

const LATIN_TO_CYR: Record<string, string> = {
  A: "А",
  a: "а",
  B: "В",
  b: "в",
  C: "С",
  c: "с",
  E: "Е",
  e: "е",
  H: "Н",
  h: "н",
  I: "І",
  i: "і",
  K: "К",
  k: "к",
  M: "М",
  m: "м",
  O: "О",
  o: "о",
  P: "Р",
  p: "р",
  T: "Т",
  t: "т",
  X: "Х",
  x: "х",
  Y: "У",
  y: "у",
};

const normalizeCategoryKey = (value: string) => {
  const converted = normalizeLabel(value).replace(
    /[ABCEHIKMOPTXYabcehikmoptxy]/g,
    (char) => LATIN_TO_CYR[char] || char
  );

  return converted.toLowerCase().replace(/\s+/g, " ");
};

const categoryIconMap = new Map<string, string>();

const addCategoryIcon = (label: string, icon: string) => {
  const safeLabel = label.replace(
    /[\u0456\u0457\u0454\u0491\u0406\u0407\u0404\u0490]/g,
    "?"
  );

  categoryIconMap.set(label, icon);
  categoryIconMap.set(safeLabel, icon);
  categoryIconMap.set(normalizeCategoryKey(label), icon);
  categoryIconMap.set(normalizeCategoryKey(safeLabel), icon);
};

addCategoryIcon("Паливна система", "palivna_systema.png");
addCategoryIcon("Гальмівна система", "halmivna_systema.png");
addCategoryIcon("Деталі двигуна", "detali_dvyhuna.png");
addCategoryIcon("Деталі підвіски", "detali_pidvisky.png");
addCategoryIcon("Амортизація", "amort.png");
addCategoryIcon("Деталі для ТО", "detali_dlia_to.png");
addCategoryIcon("Привід та коробка передач", "pryvid_ta_korobka_peredach.png");
addCategoryIcon("Система охолодження", "systema_okholodzhennia.png");
addCategoryIcon("Освітлення", "osvitlennia.png");
addCategoryIcon("Інше", "inshe.png");
addCategoryIcon("Електроніка", "datchyky_ta_elektronika.png");
addCategoryIcon("Кузовні елементи", "kuzovni_elementy.png");
addCategoryIcon("Датчики та електроніка", "datchyky_ta_elektronika.png");
addCategoryIcon("Рідини та мастила", "ridyny_ta_mastyla.png");
addCategoryIcon("Рідина та мастило", "ridyny_ta_mastyla.png");

export const getCategoryIconPath = (label: string) => {
  const resolved =
    categoryIconMap.get(label) ?? categoryIconMap.get(normalizeCategoryKey(label));

  return `/Katlogo/${resolved || "rul.png"}`;
};

// Best-effort keyword classifier for groups that have no real "Категорія" in
// 1C (only Група/Підгруппа) — used so the /auto/[brand]/[model] and
// manufacturer category breakdowns can place a recognizable group like
// "Гальмівні колодки" under a real category instead of dumping it in "Інше"
// just because 1C never tagged it. Keywords and category assignments are
// grounded in the official per-category descriptions in app/lib/seo-copy.ts
// (GROUP_COPY_MAP highlights) rather than guessed from scratch. Order matters:
// earlier rules win on overlap (e.g. "фільтр" always means "Деталі для ТО",
// even for "Фільтр палива", which also contains "паливн").
const CATEGORY_INFERENCE_RULES: Array<{ category: string; keywords: string[] }> = [
  { category: "Рідини та мастила", keywords: ["олив", "антифриз", "мастил", "рідина"] },
  { category: "Гальмівна система", keywords: ["гальм"] },
  {
    category: "Система охолодження",
    keywords: ["охолодж", "радіатор", "термостат", "помпа", "патрубок", "вентилятор", "фланець"],
  },
  { category: "Деталі для ТО", keywords: ["фільтр"] },
  {
    category: "Амортизація",
    keywords: ["амортизат", "опорний підшипник", "опорні підшипники", "пилозахисн", "відбійник", "пружин"],
  },
  {
    category: "Привід та коробка передач",
    keywords: [
      "коробка передач",
      "кпп",
      "привідн",
      "шрус",
      "піввісь",
      "куліс",
      "маховик",
      "зчеплен",
      "щеплен",
      "підвісний підшипник",
      "трос кпп",
    ],
  },
  {
    category: "Деталі підвіски",
    keywords: [
      "підвіск",
      "сайлентблок",
      "важіль",
      "кульов",
      "рульов",
      "кермов",
      "стабілізатор",
      "ступиц",
      "маточин",
      "підшипник",
    ],
  },
  {
    category: "Кузовні елементи",
    keywords: ["кузов", "багажник", "капот", "замок", "ручка", "дзеркал", "бризговик", "підкрильник"],
  },
  { category: "Освітлення", keywords: ["фара", "ліхтар", "освітлен", "поворотник", "повороту"] },
  { category: "Паливна система", keywords: ["паливн", "бензонасос", "форсунк", "інжектор"] },
  {
    category: "Датчики та електроніка",
    keywords: ["датчик", "реле", "модуль", "вимикач", "електрон", "лямбда"],
  },
  {
    category: "Деталі двигуна",
    keywords: [
      "двигун",
      "прокладк",
      "сальник",
      "грм",
      "ролик",
      "свічк",
      "котушк",
      "запалення",
      "клапан",
      "поршень",
      "колінвал",
      "ремінь",
    ],
  },
];

// Returns a canonical category label (matching getCategoryIconPath's known
// set) inferred from the group's own display name, or "" when nothing
// matches — callers should treat "" exactly like "no category" (i.e. still
// fall back to "Інше"), never invent a category from an empty guess.
export const inferCategoryForGroupLabel = (label: string): string => {
  const normalized = normalizeCategoryKey(label);
  if (!normalized) return "";

  for (const rule of CATEGORY_INFERENCE_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.category;
    }
  }

  return "";
};
