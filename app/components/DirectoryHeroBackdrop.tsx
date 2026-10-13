import Image from "next/image";

const backgrounds = {
  auto: "/images/directories/auto-workshop-v1.webp",
  groups: "/images/directories/parts-workbench-v1.webp",
  manufacturers: "/images/directories/manufacturers-warehouse-v1.webp",
};

/** A single photographic depth layer shared by the directory introductions. */
export default function DirectoryHeroBackdrop({ tone = "auto" }: { tone?: keyof typeof backgrounds }) {
  return (
    <div className="directory-hero-backdrop" data-tone={tone} aria-hidden="true">
      <Image src={backgrounds[tone]} alt="" fill className="directory-hero-photo" preload unoptimized />
      <span className="directory-hero-shade" />
    </div>
  );
}
