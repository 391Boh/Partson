// Data behind the homepage "popular sections" links (HomeSeoLinks), shared with
// scripts/generate-home-popular-icons.ts, which pre-renders their icons.
import { getCategoryIconPath } from "app/lib/category-icons";
import { carBrands } from "app/components/carBrands";
import { brands } from "app/components/brandsData";

export const GROUPS = [
  "Деталі для ТО",
  "Гальмівна система",
  "Деталі підвіски",
  "Амортизація",
  "Деталі двигуна",
  "Рульова система",
  "Система охолодження",
  "Освітлення",
  "Паливна система",
  "Привід та коробка передач",
  "Датчики та електроніка",
  "Кузовні елементи",
];

export const CAR_BRANDS = [
  ["VOLKSWAGEN", "Volkswagen"],
  ["SKODA", "Škoda"],
  ["RENAULT", "Renault"],
  ["TOYOTA", "Toyota"],
  ["OPEL", "Opel"],
  ["AUDI", "Audi"],
  ["BMW", "BMW"],
  ["MERCEDES-BENZ", "Mercedes-Benz"],
  ["FORD", "Ford"],
  ["HYUNDAI", "Hyundai"],
  ["KIA", "Kia"],
  ["NISSAN", "Nissan"],
  ["PEUGEOT", "Peugeot"],
  ["CITROEN", "Citroën"],
  ["MITSUBISHI", "Mitsubishi"],
  ["CHEVROLET", "Chevrolet"],
] as const;

export const PRODUCERS = [
  ["BOSCH", "Bosch"],
  ["FEBI", "Febi"],
  ["TRW", "TRW"],
  ["LEMFORDER", "Lemförder"],
  ["SACHS", "Sachs"],
  ["SKF", "SKF"],
  ["KYB", "KYB"],
  ["ELRING", "Elring"],
  ["CORTECO", "Corteco"],
  ["DELPHI", "Delphi"],
  ["KNECHT", "Knecht"],
  ["MAGNETI MARELLI", "Magneti Marelli"],
] as const;

export const carLogos = new Map(carBrands.map(({ name, logo }) => [name.toUpperCase(), logo]));
export const producerLogos = new Map(brands.map(({ name, logo }) => [name.toUpperCase(), logo]));
// The shared KNECHT entry currently points to MANN-FILTER; use its own asset here.
producerLogos.set("KNECHT", "/Brands/MahleKnecht.png");

/** Every icon the block shows, in its original (full-size) form. */
export const getHomePopularIconSources = () =>
  [
    ...GROUPS.map((label) => getCategoryIconPath(label)),
    ...CAR_BRANDS.map(([name]) => carLogos.get(name)),
    ...PRODUCERS.map(([name]) => producerLogos.get(name)),
  ].filter((src): src is string => Boolean(src));
