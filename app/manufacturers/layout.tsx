import type { ReactNode } from "react";
import CatalogCriticalStyles from "app/components/CatalogCriticalStyles";

export default function DirectoryLayout({ children }: { children: ReactNode }) {
  return <><CatalogCriticalStyles />{children}</>;
}
