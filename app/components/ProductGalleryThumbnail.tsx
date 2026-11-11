'use client';

import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { useState } from 'react';

export default function ProductGalleryThumbnail({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = useState<'preview' | 'original' | 'missing'>('preview');
  const isProductImage = src.startsWith('/product-image/');
  let previewSrc = src;
  // A stable /product-image/<code>/photo/… URL is the main photo the page
  // already loaded; reusing it costs nothing and keeps one URL per photo.
  if (isProductImage && !src.includes('/photo/')) {
    const url = new URL(src, 'http://localhost');
    url.searchParams.set('catalog', '1');
    previewSrc = `${url.pathname}${url.search}`;
  }
  if (attempt === 'missing') {
    return <span className="product-gallery-unavailable" role="img" aria-label={`${alt}: мініатюра недоступна`}><ImageOff size={19} strokeWidth={1.5} aria-hidden="true" /></span>;
  }
  return (
    <Image
      key={attempt}
      src={attempt === 'original' ? src : previewSrc}
      alt={alt}
      fill
      sizes="(max-width: 767px) 64px, 52px"
      loading="lazy"
      // The product-image endpoint already serves a small catalog preview.
      // Remote uploads keep Next's resizing, with one direct retry on failure.
      unoptimized={isProductImage || attempt === 'original'}
      onError={() => setAttempt(current => current === 'preview' ? 'original' : 'missing')}
      className="product-gallery-thumbnail-image"
    />
  );
}
