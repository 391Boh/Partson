export const directoryBackgrounds = {
  auto: "/images/directories/auto-workshop-v1",
  groups: "/images/directories/parts-workbench-v1",
  manufacturers: "/images/directories/manufacturers-warehouse-v1",
} as const;

export type DirectorySection = keyof typeof directoryBackgrounds;

// The photograph is shaded on phones; cap the chosen source at the 960px
// copy even on high-DPR screens. Reuse exactly this choice when warming it.
export const DIRECTORY_BACKGROUND_SIZES = "(max-width: 767px) 320px, 100vw";

export function directoryBackground(section: DirectorySection) {
  const base = directoryBackgrounds[section];
  return {
    src: `${base}.webp`,
    srcSet: `${base}-960.webp 960w, ${base}.webp 1920w`,
    sizes: DIRECTORY_BACKGROUND_SIZES,
  };
}
