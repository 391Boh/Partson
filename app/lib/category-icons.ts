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
addCategoryIcon("Електроніка", "elektronika.png");
addCategoryIcon("Кузовні елементи", "kuzovni_elementy.png");
addCategoryIcon("Датчики та електроніка", "datchyky_ta_elektronika.png");
addCategoryIcon("Рідини та мастила", "ridyny_ta_mastyla.png");

export const getCategoryIconPath = (label: string) => {
  const resolved =
    categoryIconMap.get(label) ?? categoryIconMap.get(normalizeCategoryKey(label));

  return `/Katlogo/${resolved || "rul.png"}`;
};
