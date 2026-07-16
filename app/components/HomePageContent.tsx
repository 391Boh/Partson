import HomeBelowFoldClient from "./HomeBelowFoldClient";
import Hero from "./hero";

type InitialSyncedBrand = {
  name: string;
  logo: string | null;
  description: string;
  productCount?: number;
  groupsCount?: number;
};

export default function HomePageContent({
  initialSyncedBrands,
  initialProductTree,
}: {
  initialSyncedBrands?: InitialSyncedBrand[];
  initialProductTree?: unknown;
}) {
  return (
    <div className="home-static relative min-h-screen overflow-hidden text-white">
      <div className="section-reveal home-section-stage home-section-stage-hero">
        <Hero />
      </div>

      <HomeBelowFoldClient
        initialSyncedBrands={initialSyncedBrands}
        initialProductTree={initialProductTree}
      />
    </div>
  );
}
