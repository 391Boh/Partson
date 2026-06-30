import HomeBelowFoldClient from "./HomeBelowFoldClient";
import Hero from "./hero";

export default function HomePageContent() {
  return (
    <div className="home-static relative min-h-screen overflow-hidden text-white">
      <div className="section-reveal home-section-stage home-section-stage-hero">
        <Hero />
      </div>

      <HomeBelowFoldClient />
    </div>
  );
}
