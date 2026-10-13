// Ukrainian spellings shoppers actually type ("запчастини шкода", "рено
// запчастини") for the brands in app/components/carBrands.tsx. Search engines
// only partly connect a Latin brand with its Cyrillic spelling, so brand and
// model pages mention both. Brands without a settled Ukrainian spelling are
// left out on purpose rather than guessed.
const CAR_BRAND_CYRILLIC: Record<string, string> = {
  ACURA: "Акура",
  "ALFA ROMEO": "Альфа Ромео",
  AUDI: "Ауді",
  BMW: "БМВ",
  CADILLAC: "Кадилак",
  CHERY: "Чері",
  CHEVROLET: "Шевроле",
  CHRYSLER: "Крайслер",
  CITROEN: "Сітроен",
  DACIA: "Дачія",
  DAEWOO: "Деу",
  DODGE: "Додж",
  FIAT: "Фіат",
  FORD: "Форд",
  GEELY: "Джилі",
  HONDA: "Хонда",
  HYUNDAI: "Хюндай",
  INFINITI: "Інфініті",
  ISUZU: "Ісузу",
  IVECO: "Івеко",
  JAGUAR: "Ягуар",
  JEEP: "Джип",
  KIA: "Кіа",
  LADA: "Лада",
  "LAND ROVER": "Ленд Ровер",
  LEXUS: "Лексус",
  MAN: "МАН",
  MAZDA: "Мазда",
  "MERCEDES-BENZ": "Мерседес",
  MINI: "Міні",
  MITSUBISHI: "Міцубісі",
  NISSAN: "Ніссан",
  OPEL: "Опель",
  PEUGEOT: "Пежо",
  PORSCHE: "Порше",
  RENAULT: "Рено",
  ROVER: "Ровер",
  SAAB: "Сааб",
  SEAT: "Сеат",
  SKODA: "Шкода",
  SMART: "Смарт",
  SSANGYONG: "Санг Йонг",
  SUBARU: "Субару",
  SUZUKI: "Сузукі",
  TESLA: "Тесла",
  TOYOTA: "Тойота",
  VOLKSWAGEN: "Фольксваген",
  VOLVO: "Вольво",
};

export const getCarBrandCyrillicName = (brandName: string) =>
  CAR_BRAND_CYRILLIC[brandName.trim().toUpperCase()] ?? null;

// "SKODA (Шкода)" when a Ukrainian spelling is known, otherwise the name as is.
export const formatCarBrandWithCyrillic = (brandName: string) => {
  const cyrillic = getCarBrandCyrillicName(brandName);
  return cyrillic ? `${brandName} (${cyrillic})` : brandName;
};
