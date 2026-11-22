import type { DirectorySection } from "app/lib/directory-appearance";

export type CatalogSectionId = DirectorySection;

/** The section switch now lives in the directory layouts' control bar
 * (DirectoryControlBar), so it survives navigation and never re-renders with
 * the page. Kept as a no-op so the heroes need no other change. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function CatalogSectionNav(_props: { current: CatalogSectionId; warmup?: boolean }) {
  return null;
}
