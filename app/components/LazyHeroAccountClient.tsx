"use client";

import dynamic from "next/dynamic";

type HeroAccountClientProps = {
  variant?: "actions" | "benefits" | "panel";
};

// Render public benefits on the server. Firebase and saved profile data stay
// deferred inside the account component; they do not gate the initial content.
const HeroAccountClient = dynamic(() => import("./HeroAccountClient"));

export default function LazyHeroAccountClient(props: HeroAccountClientProps) {
  return <HeroAccountClient {...props} />;
}
