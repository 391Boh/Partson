import type { ReactNode } from "react";
import DirectoryAssist from "app/components/DirectoryAssist";
import DirectoryHeroSpotlight from "app/components/DirectoryHeroSpotlight";
import CatalogCriticalStyles from "app/components/CatalogCriticalStyles";

export default function DirectoryLayout({ children }: { children: ReactNode }) {
  return <><CatalogCriticalStyles target="directory" /><DirectoryHeroSpotlight />{children}<DirectoryAssist section="manufacturers" /></>;
}
