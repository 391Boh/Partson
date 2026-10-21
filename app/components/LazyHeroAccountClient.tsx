"use client";

import HeroAccountClient from "./HeroAccountClient";

type HeroAccountClientProps = {
  variant?: "actions" | "benefits" | "panel";
};

// Render public benefits on the server. Firebase and saved profile data stay
// deferred inside the account component; they do not gate the initial content.

export default function LazyHeroAccountClient(props: HeroAccountClientProps) {
  return <HeroAccountClient {...props} />;
}
