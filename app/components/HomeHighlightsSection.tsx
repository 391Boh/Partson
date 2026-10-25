import { Suspense } from "react";
import { getHomeBlogHighlights } from "app/lib/home-blog-preview-cache";
import { informationSections } from "app/inform/section-config";
import type { HomeHighlight } from "app/lib/home-highlights";
import HomeHighlightsSlider from "./HomeHighlightsSlider";

async function InitialHighlights({ services }: { services: HomeHighlight[] }) {
  // Suspense already lets the hero stream immediately. Do not abandon the
  // server result after 600ms and restart the same query after hydration.
  const articles = await getHomeBlogHighlights().catch(() => []);
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
