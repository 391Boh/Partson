import { carBrands } from "app/components/carBrands";
import DirectoryControlBarClient, { type ControlBarItem } from "app/components/DirectoryControlBarClient";
import { buildAutoBrandPath, buildGroupPath, buildManufacturerPath } from "app/lib/catalog-links";
import { getCategoryIconPath } from "app/lib/category-icons";
import { categoryHue } from "app/lib/category-hue";
import { buildVisibleCatalogGroupName } from "app/lib/catalog-group-label";
import type { DirectorySection } from "app/lib/directory-appearance";
import { getFullGroupsDirectoryData } from "app/lib/groups-directory-data";
import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";

// Producers shown as logos in the bar: the best-stocked ones, the rest are on
// the directory page.
const PRODUCERS_IN_BAR = 40;

const loadItems = async (section: DirectorySection): Promise<ControlBarItem[]> => {
  if (section === "groups") {
    const { clientGroups } = await getFullGroupsDirectoryData();
    return clientGroups.map((group) => {
      const label = buildVisibleCatalogGroupName(group.label);
      return {
        key: group.slug,
        href: buildGroupPath(group.slug),
        label,
        image: getCategoryIconPath(label),
        hue: categoryHue(group.label),
      };
    });
  }
  if (section === "auto") {
    return carBrands.map((brand) => ({
      key: brand.name,
      href: buildAutoBrandPath(brand.name) || "/auto",
      label: brand.name,
      image: brand.logo,
      logo: true,
    }));
  }
  const { clientProducers } = await getFullManufacturersDirectoryData();
  return clientProducers
    .filter((producer) => producer.logoPath && producer.slug)
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, PRODUCERS_IN_BAR)
    .map((producer) => ({
      key: producer.slug,
      href: buildManufacturerPath(producer.slug),
      label: producer.label,
      image: producer.logoPath as string,
      logo: true,
    }));
};

/** One control panel for the catalogue directories, rendered by each
 * section's layout so it survives navigation within the section: the
 * section switch (Авто / Категорії / Виробники) and that section's own row
 * of icons — car systems, car brands or parts brands. */
export default async function DirectoryControlBar({ section }: { section: DirectorySection }) {
  const items = await loadItems(section).catch(() => [] as ControlBarItem[]);
  return <DirectoryControlBarClient section={section} items={items} />;
}
