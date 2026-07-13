"use client";

import HeroAccountClientDirect from "./HeroAccountClient";

type HeroAccountClientProps = {
  cardGradientBase: string;
  cardGradientHover: string;
  cardInteractionStatic: string;
  variant?: "actions" | "benefits";
};

export default function LazyHeroAccountClient(props: HeroAccountClientProps) {
  return <HeroAccountClientDirect {...props} />;
}
