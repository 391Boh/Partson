'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { scheduleBackgroundTask } from 'app/lib/schedule-background-task';

export function HeroBlogCardFallback() {
  return (
    <Link href="/blog" prefetch={false} className="home-feature-card home-blog-card">
      <div className="home-feature-image home-feature-image-blog" aria-hidden="true" />
      <div className="home-feature-copy">
        <span className="home-feature-label">Блог · Поради для водіїв</span>
        <h2>Поради з вибору автозапчастин</h2>
        <span className="home-feature-action">Читати блог <ChevronRight size={14} aria-hidden="true" /></span>
      </div>
    </Link>
  );
}

type BlogTeaser = { title: string; href: string; alt: string; image: string; unoptimized: boolean };

export default function HeroBlogCard() {
  const [post, setPost] = useState<BlogTeaser | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const cancel = scheduleBackgroundTask(() => {
      void fetch('/api/home-blog', { signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then(result => { if (!controller.signal.aborted && result) setPost(result); })
        .catch(() => {});
    });
    return () => { cancel(); controller.abort(); };
  }, []);
  if (!post) return <HeroBlogCardFallback />;
  const blogImage = post.image;
  const blogTitle = post.title;
  const blogHref = post.href;
  const blogAlt = post.alt;

  return (
        <Link href={blogHref} prefetch={false} className="home-feature-card home-blog-card" title={blogTitle}>
          <div className="home-feature-image home-feature-image-blog">
            <Image
              src={blogImage}
              alt={blogAlt}
              fill
              unoptimized={post.unoptimized}
              quality={75}
              sizes="(max-width: 479px) 104px, 136px"
              className="object-contain"
            />
          </div>
          <div className="home-feature-copy">
            <span className="home-feature-label">Блог · Поради для водіїв</span>
            <h2>{blogTitle}</h2>
            <span className="home-feature-action">Читати статтю <ChevronRight size={14} aria-hidden="true" /></span>
          </div>
        </Link>
  );
}
