import { Suspense } from "react";
import { getPublishedBlogPosts } from "app/lib/blog";
import { buildHomeBlogHighlights } from "app/lib/home-blog-highlights";
import { informationSections } from "app/inform/section-config";
import type { HomeHighlight } from "app/lib/home-highlights";
import HomeHighlightsSlider from "./HomeHighlightsSlider";

async function loadInitialArticles() {
  // Stream independently of the hero; a cold/unavailable database must not
  // hold the page open. The client API retries if this small budget expires.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const posts = await Promise.race([
    getPublishedBlogPosts(),
    new Promise<[]>(resolve => { timer = setTimeout(() => resolve([]), 600); }),
  ]).finally(() => clearTimeout(timer));
  return buildHomeBlogHighlights(posts);
}

async function InitialHighlights({ services }: { services: HomeHighlight[] }) {
  const articles = await loadInitialArticles();
  return <HomeHighlightsSlider services={services} initialArticles={articles} serverResolved />;
}

export default function HomeHighlightsSection() {
  const services: HomeHighlight[] = informationSections.flatMap((section) =>
    section.homeFeature ? [{
      id: `service-${section.key}`,
      kind: "service" as const,
      title: section.pageHeading,
      description: section.contentLead,
      href: `/inform/${section.key}`,
      image: section.homeFeature.image,
      imageAlt: section.homeFeature.imageAlt,
      meta: section.subtitle,
      action: "Дізнатися про послугу",
    }] : []
  );

  return (
    <Suspense fallback={<HomeHighlightsSlider services={services} />}>
      <InitialHighlights services={services} />
    </Suspense>
  );
}
