// Standard Ukrainian/Slavic plural-form selection: "1 товар", "2 товари",
// "5 товарів", "21 товар", "22 товари", "25 товарів", "11-14 товарів" (the
// teens are always the "many" form regardless of the last digit).
export const pluralizeUk = (count: number, one: string, few: string, many: string) => {
  const abs = Math.abs(Math.trunc(count));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

export const pluralizeProducts = (count: number) => pluralizeUk(count, "товар", "товари", "товарів");
export const pluralizePositions = (count: number) => pluralizeUk(count, "позиція", "позиції", "позицій");
export const pluralizeManufacturers = (count: number) => pluralizeUk(count, "виробник", "виробники", "виробників");
export const pluralizeBrandsWord = (count: number) => pluralizeUk(count, "бренд", "бренди", "брендів");
export const pluralizeGroups = (count: number) => pluralizeUk(count, "група", "групи", "груп");
export const pluralizeSubgroups = (count: number) => pluralizeUk(count, "підгрупа", "підгрупи", "підгруп");
export const pluralizeCategories = (count: number) => pluralizeUk(count, "категорія", "категорії", "категорій");
export const pluralizeCarBrands = (count: number) => pluralizeUk(count, "марка", "марки", "марок");
export const pluralizeModels = (count: number) => pluralizeUk(count, "модель", "моделі", "моделей");
