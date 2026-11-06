import { preload } from "react-dom";
import { directoryBackground, type DirectorySection } from "app/lib/directory-appearance";

/** A single photographic depth layer shared by the directory introductions. */
export default function DirectoryHeroBackdrop({ tone = "auto" }: { tone?: DirectorySection }) {
  const { src, srcSet, sizes } = directoryBackground(tone);
  preload(src, { as: "image", imageSrcSet: srcSet, imageSizes: sizes, fetchPriority: "high" });
  return (
    <div className="directory-hero-backdrop" data-tone={tone} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- static srcset served by nginx */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt=""
        fetchPriority="high"
        decoding="async"
        className="directory-hero-photo"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <span className="directory-hero-shade" />
      {/* Drafting grid and pointer light; DirectoryHeroSpotlight moves them. */}
      <span className="directory-hero-grid" />
      <span className="directory-hero-spot" />
    </div>
  );
}
