// Maps a 1C group/subgroup label to a schematic part icon (PartTypeIcon).
// Matching is by Ukrainian word stems, most specific first: "Перемикач
// поворотів" must read as a switch before "поворот" reads as a light, and
// "Опора амортизатора" as a mount before "амортизатор" reads as a shock.

export type PartIconKind =
  | "brake-pad"
  | "brake-disc"
  | "brake-drum"
  | "caliper"
  | "hose"
  | "cable"
  | "filter"
  | "shock"
  | "spring"
  | "mount"
  | "bearing"
  | "bushing"
  | "ball-joint"
  | "link"
  | "boot"
  | "driveshaft"
  | "clutch"
  | "gearbox"
  | "belt"
  | "pulley"
  | "gasket"
  | "spark-plug"
  | "coil"
  | "bulb"
  | "headlight"
  | "switch"
  | "sensor"
  | "electric"
  | "wiper"
  | "pump"
  | "radiator"
  | "fan"
  | "thermostat"
  | "reservoir"
  | "oil"
  | "turbo"
  | "fuel"
  | "steering"
  | "mirror"
  | "body"
  | "air-con"
  | "engine"
  | "kit"
  | "part";

const RULES: ReadonlyArray<[PartIconKind, readonly string[]]> = [
  ["switch", ["перемикач", "вмикач", "кнопк", "реле", "релле"]],
  ["kit", ["ремкомплект", "ремонтний комплект", "ремонтні комплект"]],
  ["boot", ["пильник", "пилозахисн", "відбійник"]],
  ["mount", ["подушк", "опора двигун", "опора коробк", "опора амортизатор", "опорні подушк"]],
  ["brake-pad", ["колодк"]],
  ["brake-drum", ["барабан"]],
  ["caliper", ["супорт", "гальмівний циліндр", "циліндр щеплен", "циліндр зчеплен"]],
  ["brake-disc", ["гальмівні диск", "гальмівний диск", "гальмівного диск"]],
  ["gasket", ["прокладк", "сальник", "ущільн", "кільц"]],
  ["sensor", ["датчик", "abs", "перетворювач тиску", "лямбда"]],
  ["cable", ["трос"]],
  ["filter", ["фільтр"]],
  ["spark-plug", ["свіч"]],
  ["coil", ["катушк", "котушк", "трамблер", "високовольтн", "контактні груп", "запален"]],
  ["bulb", ["лампоч", "лампа", "лампи"]],
  ["headlight", ["фар", "ліхтар", "поворот", "освітлен"]],
  ["wiper", ["склоочисн", "двірник", "омиван"]],
  ["air-con", ["кондиціонер", "компрессор кондиц", "компресор кондиц"]],
  ["fan", ["вентилятор"]],
  ["radiator", ["радіатор", "теплообмін", "пічк"]],
  ["thermostat", ["термостат"]],
  ["pump", ["насос", "помп"]],
  ["turbo", ["турб"]],
  ["hose", ["шланг", "патрубок", "патрубк", "трубк", "гофр", "фланець"]],
  ["reservoir", ["бачк", "бачок", "кришк"]],
  ["oil", ["мастил", "масло", "олив", "рідин", "піддон двигун", "масляний піддон"]],
  ["spring", ["пружин"]],
  ["shock", ["амортизатор", "амортизац", "опори багажник", "газов"]],
  ["bearing", ["підшипник", "ступиц", "вкладиш", "цапф"]],
  ["bushing", ["сайлент", "втулк", "гільз", "направляюч"]],
  ["ball-joint", ["кульов", "наконечник"]],
  ["link", ["тяга", "стійка стабілізатор", "стабілізатор", "важіль", "балк"]],
  ["driveshaft", ["привідн", "приводн", "шарнір", "гранат", "кардан", "напіввіс"]],
  ["clutch", ["щеплен", "зчеплен", "маховик", "муфт"]],
  ["gearbox", ["коробк", "кпп", "куліс", "акпп"]],
  ["belt", ["ремен", "ремін", "грм"]],
  ["pulley", ["ролик", "натяжн", "паразитн", "шків"]],
  ["electric", ["генератор", "регулятор напруги", "стартер", "акумулятор", "електро", "підйом скла", "привід замка"]],
  ["fuel", ["палив"]],
  ["steering", ["керм", "рульов", "гпк", "підсилювач"]],
  ["mirror", ["дзеркал"]],
  ["body", ["кузов", "капот", "замок", "ручк", "підкрил", "бризговик", "арка", "багажник", "двер", "закриван"]],
  ["engine", ["двигун", "картер", "змаск", "мастильн", "заглушк", "захист"]],
  ["kit", ["комплект"]],
  // Broad category stems last, so they only decide when nothing above did.
  ["brake-disc", ["гальмівн"]],
  ["filter", ["деталі для то"]],
  ["link", ["підвіск"]],
  ["radiator", ["охолоджен"]],
  ["electric", ["електронік"]],
];

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    // 1C mixes Latin look-alikes into Cyrillic labels ("AКПП").
    .replace(/[aceikmopxy]/g, (char) => ({ a: "а", c: "с", e: "е", i: "і", k: "к", m: "м", o: "о", p: "р", x: "х", y: "у" })[char] ?? char)
    .replace(/\s+/g, " ")
    .trim();

const matchLabel = (label: string): PartIconKind | null => {
  const text = normalize(label);
  if (!text) return null;
  for (const [kind, stems] of RULES) {
    if (stems.some((stem) => text.includes(normalize(stem)))) return kind;
  }
  return null;
};

/** Icon for a label, falling back to its parent labels (closest first). */
export const resolvePartIconKind = (label: string, ...parents: Array<string | null | undefined>): PartIconKind => {
  const own = matchLabel(label);
  if (own) return own;
  for (const parent of parents) {
    const kind = parent ? matchLabel(parent) : null;
    if (kind) return kind;
  }
  return "part";
};
