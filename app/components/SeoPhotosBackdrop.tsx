const PHOTOS = [
  { src: "/storefront/photos/bg/store-1.webp", className: "home-seo-photo--west" },
  { src: "/storefront/photos/bg/store-2.webp", className: "home-seo-photo--east" },
  { src: "/storefront/photos/bg/store-6.webp", className: "home-seo-photo--south" },
] as const;

export default function SeoPhotosBackdrop() {
  return (
    <div aria-hidden="true" className="home-backdrop home-seo-photo-scene pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {PHOTOS.map(({ src, className }) => (
        // eslint-disable-next-line @next/next/no-img-element -- static images are served directly by nginx
        <img
          key={src}
          src={src}
          width="660"
          height="440"
          loading="lazy"
          decoding="async"
          alt=""
          className={`home-seo-photo ${className}`}
        />
      ))}
      <div className="home-seo-photo-wash absolute inset-0" />
    </div>
  );
}
