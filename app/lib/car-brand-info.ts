// Country of origin, parent company/group, and typical model segment for
// every brand in carBrands.tsx — used to render a short factual paragraph
// on each /auto/[brand] page (see app/auto/[brand]/page.tsx). Keys match
// CarBrand.name exactly (all-caps, as shown throughout the site).
export type CarBrandInfo = {
  country: string;
  parentGroup?: string;
  segment: string;
};

export const carBrandInfo: Record<string, CarBrandInfo> = {
  AUDI: { country: "Німеччини", parentGroup: "Volkswagen Group", segment: "преміальні седани та кросовери" },
  BMW: { country: "Німеччини", parentGroup: "BMW Group", segment: "преміальні седани, купе та кросовери" },
  CHERY: { country: "Китаю", segment: "седани та кросовери" },
  CHRYSLER: { country: "США", parentGroup: "Stellantis", segment: "седани та мінівени" },
  CITROEN: { country: "Франції", parentGroup: "Stellantis", segment: "компактні автомобілі та мінівени" },
  CADILLAC: { country: "США", parentGroup: "General Motors", segment: "преміальні седани та позашляховики" },
  DACIA: { country: "Румунії", parentGroup: "Renault Group", segment: "бюджетні седани та кросовери" },
  DAEWOO: { country: "Південної Кореї", parentGroup: "General Motors (історично)", segment: "компактні та середньорозмірні автомобілі" },
  DAF: { country: "Нідерландів", parentGroup: "PACCAR", segment: "вантажівки" },
  DODGE: { country: "США", parentGroup: "Stellantis", segment: "спортивні седани та позашляховики" },
  FERRARI: { country: "Італії", segment: "спортивні автомобілі класу люкс" },
  FIAT: { country: "Італії", parentGroup: "Stellantis", segment: "компактні міські автомобілі" },
  FORD: { country: "США", segment: "седани, позашляховики та пікапи" },
  CHEVROLET: { country: "США", parentGroup: "General Motors", segment: "седани, позашляховики та пікапи" },
  GEELY: { country: "Китаю", segment: "седани та кросовери" },
  HONDA: { country: "Японії", segment: "седани, хетчбеки та кросовери" },
  HUMMER: { country: "США", parentGroup: "General Motors (історично)", segment: "позашляховики та пікапи" },
  HYUNDAI: { country: "Південної Кореї", parentGroup: "Hyundai Motor Group", segment: "седани та кросовери" },
  INFINITI: { country: "Японії", parentGroup: "Nissan Motor", segment: "преміальні седани та кросовери" },
  ISUZU: { country: "Японії", segment: "позашляховики та комерційний транспорт" },
  IVECO: { country: "Італії", parentGroup: "Iveco Group", segment: "вантажівки та комерційний транспорт" },
  JAGUAR: { country: "Великої Британії", parentGroup: "Jaguar Land Rover (Tata Motors)", segment: "преміальні седани та спорткари" },
  JEEP: { country: "США", parentGroup: "Stellantis", segment: "позашляховики" },
  KIA: { country: "Південної Кореї", parentGroup: "Hyundai Motor Group", segment: "седани та кросовери" },
  LADA: { country: "Росії", parentGroup: "АвтоВАЗ", segment: "седани та універсали" },
  LAMBORGHINI: { country: "Італії", parentGroup: "Volkswagen Group", segment: "спортивні автомобілі класу люкс" },
  LANCIA: { country: "Італії", parentGroup: "Stellantis", segment: "компактні автомобілі" },
  "LAND ROVER": { country: "Великої Британії", parentGroup: "Jaguar Land Rover (Tata Motors)", segment: "позашляховики класу люкс" },
  LEXUS: { country: "Японії", parentGroup: "Toyota Motor", segment: "преміальні седани та кросовери" },
  LINCOLN: { country: "США", parentGroup: "Ford Motor Company", segment: "преміальні позашляховики та седани" },
  LOTUS: { country: "Великої Британії", parentGroup: "Geely", segment: "спортивні автомобілі" },
  MAN: { country: "Німеччини", parentGroup: "Traton Group (Volkswagen)", segment: "вантажівки та автобуси" },
  MASERATI: { country: "Італії", parentGroup: "Stellantis", segment: "спортивні автомобілі класу люкс" },
  MAYBACH: { country: "Німеччини", parentGroup: "Mercedes-Benz Group", segment: "автомобілі класу люкс" },
  MAZDA: { country: "Японії", segment: "седани, хетчбеки та кросовери" },
  "MERCEDES-BENZ": { country: "Німеччини", parentGroup: "Mercedes-Benz Group", segment: "преміальні седани та кросовери" },
  MINI: { country: "Великої Британії", parentGroup: "BMW Group", segment: "компактні хетчбеки та кросовери" },
  MITSUBISHI: { country: "Японії", parentGroup: "Альянс Renault-Nissan-Mitsubishi", segment: "позашляховики та кросовери" },
  NISSAN: { country: "Японії", parentGroup: "Альянс Renault-Nissan-Mitsubishi", segment: "седани та кросовери" },
  OPEL: { country: "Німеччини", parentGroup: "Stellantis", segment: "компактні автомобілі та кросовери" },
  PEUGEOT: { country: "Франції", parentGroup: "Stellantis", segment: "компактні автомобілі та кросовери" },
  PONTIAC: { country: "США", parentGroup: "General Motors (історично)", segment: "спортивні седани та купе" },
  PORSCHE: { country: "Німеччини", parentGroup: "Volkswagen Group", segment: "спортивні автомобілі та кросовери" },
  RAM: { country: "США", parentGroup: "Stellantis", segment: "пікапи" },
  RENAULT: { country: "Франції", parentGroup: "Renault Group", segment: "компактні автомобілі та кросовери" },
  "ROLLS-ROYCE": { country: "Великої Британії", parentGroup: "BMW Group", segment: "автомобілі класу люкс" },
  ROVER: { country: "Великої Британії", segment: "седани та позашляховики" },
  SAAB: { country: "Швеції", parentGroup: "General Motors (історично)", segment: "седани та універсали" },
  SEAT: { country: "Іспанії", parentGroup: "Volkswagen Group", segment: "компактні автомобілі та кросовери" },
  SKODA: { country: "Чехії", parentGroup: "Volkswagen Group", segment: "седани, універсали та кросовери" },
  SMART: { country: "Німеччини", parentGroup: "Mercedes-Benz Group", segment: "компактні міські автомобілі" },
  SSANGYONG: { country: "Південної Кореї", parentGroup: "KG Mobility", segment: "позашляховики та пікапи" },
  SUBARU: { country: "Японії", segment: "повнопривідні седани та кросовери" },
  SUZUKI: { country: "Японії", segment: "компактні автомобілі та кросовери" },
  TESLA: { country: "США", segment: "електромобілі" },
  TOYOTA: { country: "Японії", parentGroup: "Toyota Motor", segment: "седани, позашляховики та кросовери" },
  VOLVO: { country: "Швеції", parentGroup: "Geely", segment: "преміальні седани та кросовери" },
  VOLKSWAGEN: { country: "Німеччини", parentGroup: "Volkswagen Group", segment: "компактні автомобілі та кросовери" },
  ACURA: { country: "Японії", parentGroup: "Honda Motor", segment: "преміальні седани та купе" },
  "ALFA ROMEO": { country: "Італії", parentGroup: "Stellantis", segment: "спортивні седани" },
  "ASTON MARTIN": { country: "Великої Британії", segment: "спортивні автомобілі класу люкс" },
  BENTLEY: { country: "Великої Британії", parentGroup: "Volkswagen Group", segment: "автомобілі класу люкс" },
};

// Natural, brand-specific paragraph combining country/parent-group facts
// with the catalog framing. Returns null for any brand not in the map above
// (keeps callers safe against future additions to carBrands.tsx).
export const buildCarBrandInfoParagraph = (brandName: string): string | null => {
  const info = carBrandInfo[brandName.trim().toUpperCase()];
  if (!info) return null;

  const groupPart = info.parentGroup ? `, входить до складу ${info.parentGroup}` : "";

  return `${brandName} — автовиробник з ${info.country}${groupPart}, відомий переважно моделями сегменту «${info.segment}». У каталозі PartsON представлені автозапчастини для автомобілів ${brandName} різних поколінь і модифікацій — від оригінальних деталей до перевірених аналогів.`;
};
