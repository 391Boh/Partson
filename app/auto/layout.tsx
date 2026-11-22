import type { ReactNode } from "react";
import DirectoryHeroSpotlight from "app/components/DirectoryHeroSpotlight";
import CatalogCriticalStyles from "app/components/CatalogCriticalStyles";
import DirectoryControlBar from "app/components/DirectoryControlBar";

export default function DirectoryLayout({ children }: { children: ReactNode }) {
  return <><CatalogCriticalStyles target="directory" /><DirectoryHeroSpotlight /><DirectoryControlBar section="auto" />{children}</>;
}
