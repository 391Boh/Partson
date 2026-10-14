import { preload } from "react-dom";

const backgrounds = {
  auto: "/images/directories/auto-workshop-v1",
  groups: "/images/directories/parts-workbench-v1",
  manufacturers: "/images/directories/manufacturers-warehouse-v1",
};

// Phones get the 960px copy (24-30 KB instead of ~110 KB): the photo sits
// under a dark shade, so `sizes` caps them there even at 3x DPR.
const BACKDROP_SIZES = "(max-width: 767px) 320px, 100vw";

/** A single photographic depth layer shared by the directory introductions. */
export default function DirectoryHeroBackdrop({ tone = "auto" }: { tone?: keyof typeof backgrounds }) {
  const base = backgrounds[tone];
  const src = `${base}.webp`;
  const srcSet = `${base}-960.webp 960w, ${base}.webp 1920w`;
  preload(src, { as: "image", imageSrcSet: srcSet, imageSizes: BACKDROP_SIZES, fetchPriority: "high" });
  return (
    <div className="directory-hero-backdrop" data-tone={tone} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- static srcset served by nginx */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={BACKDROP_SIZES}
        alt=""
        fetchPriority="high"
        decoding="async"
        className="directory-hero-photo"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <span className="directory-hero-shade" />
    </div>
  );
}
