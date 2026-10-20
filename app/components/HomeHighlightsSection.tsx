import { informationSections } from "app/inform/section-config";
import type { HomeHighlight } from "app/lib/home-highlights";
import HomeHighlightsSlider from "./HomeHighlightsSlider";

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

  return <HomeHighlightsSlider services={services} />;
}
