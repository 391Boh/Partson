import Image, { type ImageProps } from "next/image";
import { getBlogEditorialImageBySrc } from "app/lib/blog-editorial-images";

export default function BlogCoverImage(props: ImageProps) {
  const editorial = typeof props.src === "string" ? getBlogEditorialImageBySrc(props.src) : undefined;
  if (!editorial) return <Image {...props} alt={props.alt} />;

  // Precompressed responsive files avoid a cold image-transform request.
  return (
    <picture>
      <source type="image/webp" srcSet={editorial.srcSet} sizes={props.sizes || "100vw"} />
      <Image {...props} alt={editorial.alt} unoptimized />
    </picture>
  );
}
