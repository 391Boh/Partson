"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, ViewTransition, type CSSProperties, type MouseEvent } from "react";
import { ArrowLeft, CarFront, Factory, LayoutGrid, Layers3 } from "lucide-react";

import SmartLink from "app/components/SmartLink";
import DirectoryNavigationWarmup from "app/components/DirectoryNavigationWarmup";
import type { DirectorySection } from "app/lib/directory-appearance";

export type ControlBarItem = {
  key: string;
  href: string;
  label: string;
  image: string;
  hue?: number;
  logo?: boolean;
};

const SECTIONS: Array<{ id: DirectorySection; href: string; label: string; icon: typeof CarFront }> = [
  { id: "auto", href: "/auto", label: "Авто", icon: CarFront },
  { id: "groups", href: "/groups", label: "Категорії", icon: Layers3 },
  { id: "manufacturers", href: "/manufacturers", label: "Виробники", icon: Factory },
];

const ALL_LABEL: Record<DirectorySection, string> = {
  auto: "Усі марки",
  groups: "Усі системи",
  manufacturers: "Усі бренди",
};

// Switching sections keeps the bar in place: the pill slides, the page below
// cross-fades (see ::view-transition rules for "dir-nav").
const NAV_TRANSITION = ["dir-nav"];

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

// Before paint on the client, nothing on the server.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function DirectoryControlBarClient({
  section,
  items,
}: {
  section: DirectorySection;
  items: ControlBarItem[];
}) {
  const pathname = usePathname() || "";
  const hubPath = `/${section}`;
  const onHub = pathname === hubPath;
  // /groups opens a system in place; the directory reports which one.
  const [hubCategory, setHubCategory] = useState<string | null>(null);
  const [light, setLight] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (section !== "groups") return;
    const read = () => setHubCategory(new URLSearchParams(window.location.search).get("category"));
    const onActive = (event: Event) => setHubCategory((event as CustomEvent<string | null>).detail ?? null);
    read();
    window.addEventListener("popstate", read);
    window.addEventListener("groups:active", onActive);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener("groups:active", onActive);
    };
  }, [section, pathname]);

  const activeKey = (() => {
    if (onHub) return section === "groups" ? hubCategory : null;
    const match = items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.key ?? null;
  })();

  // Light look once the hero has slid out from under the bar (the veil under
  // the bar follows); the veil's height tracks the bar. One rAF-throttled
  // scroll listener.
  useIsoLayoutEffect(() => {
    const bar = barRef.current;
    const fade = fadeRef.current;
    if (!bar || !fade) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const barBottom = bar.getBoundingClientRect().bottom;
      const hero = document.querySelector<HTMLElement>(".directory-intro, .directory-detail-hero");
      const heroBottom = hero ? hero.getBoundingClientRect().bottom : -1;
      setLight(heroBottom < barBottom + 150);
      fade.style.setProperty("--fade-h", `${Math.round(barBottom + 30)}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // The page below streams in after navigation; measure again once it has.
    const late = window.setTimeout(measure, 400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(late);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [pathname]);

  // Keep the current icon centred in the rail without moving the page.
  useEffect(() => {
    const rail = railRef.current;
    const current = rail?.querySelector<HTMLElement>(".gdir-dock__item[data-on='true']");
    if (!rail) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const left = current ? current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2 : 0;
    rail.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
  }, [activeKey]);

  const allOn = onHub && !(section === "groups" && hubCategory);

  return (
    <>
      <div ref={fadeRef} className="dir-bar-fade" aria-hidden="true" />
      <ViewTransition name="dir-bar" share="dir-bar" default="none">
        <nav ref={barRef} className="dir-bar" data-tone={light ? "light" : "dark"} aria-label="Навігація каталогом">
          <DirectoryNavigationWarmup current={section} />
          <div className="dir-bar__inner">
            <div className="dir-bar__sections" role="list" aria-label="Розділи каталогу">
              {SECTIONS.map(({ id, href, label, icon: Icon }) => (
                <SmartLink
                  key={id}
                  role="listitem"
                  href={href}
                  transitionTypes={NAV_TRANSITION}
                  prefetchOnViewport
                  className="dir-bar__section"
                  aria-current={id === section ? (onHub ? "page" : "true") : undefined}
                >
                  {id === section ? (
                    <ViewTransition name="dir-nav-pill" share="dir-pill" default="none">
                      <span className="dir-bar__pill" aria-hidden="true" />
                    </ViewTransition>
                  ) : null}
                  <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
                  <span>{label}</span>
                </SmartLink>
              ))}
            </div>

            {items.length > 0 ? (
              <div className="dir-bar__rail" ref={railRef}>
                <SmartLink
                  href={hubPath}
                  className="gdir-dock__all"
                  data-on={allOn ? "true" : "false"}
                  aria-current={allOn ? "page" : undefined}
                  onClick={(event) => {
                    if (section === "groups" && onHub && hubCategory && isPlainClick(event)) {
                      event.preventDefault();
                      window.dispatchEvent(new CustomEvent("groups:close"));
                    }
                  }}
                >
                  {section === "groups" && onHub && hubCategory ? (
                    <ArrowLeft size={18} strokeWidth={2.4} aria-hidden="true" />
                  ) : (
                    <LayoutGrid size={18} strokeWidth={2.2} aria-hidden="true" />
                  )}
                  <span>{ALL_LABEL[section]}</span>
                </SmartLink>
                <span className="gdir-dock__sep" aria-hidden="true" />
                {items.map((item) => {
                  const on = item.key === activeKey;
                  return (
                    <SmartLink
                      key={item.key}
                      href={item.href}
                      className="gdir-dock__item"
                      // The 14 systems are few and always on screen: have them
                      // ready before the click. Brand logos load on intent.
                      prefetchOnViewport={section === "groups"}
                      data-on={on ? "true" : "false"}
                      data-logo={item.logo ? "true" : undefined}
                      style={item.hue !== undefined ? ({ "--cat-h": item.hue } as CSSProperties) : undefined}
                      aria-current={on ? "page" : undefined}
                      aria-label={item.label}
                      title={item.label}
                      onClick={(event) => {
                        if (section === "groups" && onHub && isPlainClick(event)) {
                          event.preventDefault();
                          if (!on) window.dispatchEvent(new CustomEvent("groups:open", { detail: item.key }));
                        }
                      }}
                    >
                      <Image
                        src={item.image}
                        alt=""
                        width={item.logo ? 40 : 30}
                        height={30}
                        sizes="40px"
                        unoptimized={item.image.endsWith(".svg")}
                      />
                      <span className="gdir-dock__label" aria-hidden="true">{item.label}</span>
                    </SmartLink>
                  );
                })}
              </div>
            ) : null}
          </div>
        </nav>
      </ViewTransition>
    </>
  );
}
