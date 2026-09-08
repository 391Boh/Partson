import type { ReactNode } from "react";
import Hero from "./hero";
import ScrollPerformanceGuard from "./ScrollPerformanceGuard";

export default function HomePageContent({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="home-static relative min-h-screen overflow-x-clip text-white">
      <ScrollPerformanceGuard />
      <div className="section-reveal home-section-stage home-section-stage-hero">
        <Hero />
      </div>

      {children}
    </div>
  );
}
