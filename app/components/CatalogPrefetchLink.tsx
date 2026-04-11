"use client";

import { useCallback, useEffect, useRef, type FocusEvent, type MouseEvent, type TouchEvent } from "react";

import SmartLink from "app/components/SmartLink";
import { prefetchCatalogListing } from "app/lib/catalog-page-prefetch";

type CatalogPrefetchLinkProps = React.ComponentProps<typeof SmartLink> & {
  href: string;
  prefetchCatalogOnViewport?: boolean;
};

export default function CatalogPrefetchLink({
  href,
  onMouseEnter,
  onFocus,
  onTouchStart,
  prefetchCatalogOnViewport = false,
  prefetchOnIntent = true,
  prefetchOnViewport = false,
  ...props
}: CatalogPrefetchLinkProps) {
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const viewportWarmedRef = useRef(false);

  const warmCatalog = useCallback(() => {
    void prefetchCatalogListing(href);
  }, [href]);

  useEffect(() => {
    if (!prefetchCatalogOnViewport) return;
    if (typeof window === "undefined") return;
    if (viewportWarmedRef.current) return;

    const anchor = anchorRef.current;
    if (!anchor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;

        viewportWarmedRef.current = true;
        observer.disconnect();
        warmCatalog();
      },
      {
        root: null,
        rootMargin: "0px 0px 280px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, [prefetchCatalogOnViewport, warmCatalog]);

  const handleMouseEnter = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      warmCatalog();
      onMouseEnter?.(event);
    },
    [onMouseEnter, warmCatalog]
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLAnchorElement>) => {
      warmCatalog();
      onFocus?.(event);
    },
    [onFocus, warmCatalog]
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLAnchorElement>) => {
      warmCatalog();
      onTouchStart?.(event);
    },
    [onTouchStart, warmCatalog]
  );

  return (
    <SmartLink
      ref={anchorRef}
      href={href}
      prefetchOnIntent={prefetchOnIntent}
      prefetchOnViewport={prefetchOnViewport}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      onTouchStart={handleTouchStart}
      {...props}
    />
  );
}
