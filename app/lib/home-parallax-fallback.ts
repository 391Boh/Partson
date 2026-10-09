// Homepage parallax for browsers without CSS scroll timelines (Safari before
// scroll-driven animations, Firefox). Mirrors the compositor version in
// globals.css ("Homepage parallax and block drift"): each visible section
// backdrop moves as one layer, its depth planes ([data-plx-drift], amplitude
// in --plx-drift) travel further, and the hero photo drifts as the hero
// leaves. Same budget as /partnership's drift: one passive scroll listener,
// one rAF, geometry read from the (untranslated) section boxes first, then
// `translate` writes on a handful of elements in visible sections only.

const BACKDROP_SHIFT_DESKTOP = 60;
const BACKDROP_SHIFT_MOBILE = 30;
const HERO_SHIFT_DESKTOP = 0.09;
const HERO_SHIFT_MOBILE = 0.05;

type Backdrop = { el: HTMLElement; box: HTMLElement; planes: HTMLElement[] };

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

export function installHomeParallaxFallback(home: HTMLElement): () => void {
  if (typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()")) {
    return () => {};
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotion.matches) return () => {};

  const root = document.documentElement;
  const backdrops = new Map<HTMLElement, Backdrop>(); // by .home-backdrop
  const byBox = new Map<HTMLElement, Backdrop>(); // by observed section box
  const visible = new Set<Backdrop>();
  const hero = home.querySelector<HTMLElement>(".hero-section-smooth");
  const heroPhoto = hero?.querySelector<HTMLElement>(".hero-photo") ?? null;
  let heroVisible = Boolean(hero);
  let frame = 0;

  const reset = () => {
    for (const b of backdrops.values()) {
      b.el.style.translate = "";
      for (const plane of b.planes) plane.style.translate = "";
    }
    if (heroPhoto) heroPhoto.style.translate = "";
  };

  const update = () => {
    frame = 0;
    if (root.classList.contains("reduce-scroll-effects")) {
      reset();
      return;
    }
    const vh = window.innerHeight || 1;
    const mobile = window.innerWidth < 768;
    const shift = mobile ? BACKDROP_SHIFT_MOBILE : BACKDROP_SHIFT_DESKTOP;

    // Reads first (section boxes are never translated themselves).
    const progress = Array.from(visible, (b) => {
      const r = b.box.getBoundingClientRect();
      const t = clamp((vh - r.top) / (vh + r.height), 0, 1);
      return { b, p: t * 2 - 1 };
    });
    let heroP = 0;
    if (hero && heroPhoto && heroVisible) {
      const r = hero.getBoundingClientRect();
      heroP = clamp(-r.top / (r.height || 1), 0, 1);
    }

    // Then writes.
    for (const { b, p } of progress) {
      b.el.style.translate = `0 ${(p * shift).toFixed(1)}px`;
      for (const plane of b.planes) {
        const drift = parseFloat(plane.style.getPropertyValue("--plx-drift")) || 0;
        plane.style.translate = `0 ${(p * drift).toFixed(1)}px`;
      }
    }
    if (heroPhoto && heroVisible) {
      const k = mobile ? HERO_SHIFT_MOBILE : HERO_SHIFT_DESKTOP;
      heroPhoto.style.translate = `0 ${(heroP * k * 100).toFixed(2)}%`;
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target === hero) {
          heroVisible = entry.isIntersecting;
          continue;
        }
        const b = byBox.get(entry.target as HTMLElement);
        if (!b) continue;
        if (entry.isIntersecting) visible.add(b);
        else visible.delete(b);
      }
      schedule();
    },
    { rootMargin: "120px 0px" }
  );
  if (hero) io.observe(hero);

  // Sections (and their backdrops and depth planes) mount after load.
  const scan = () => {
    for (const el of home.querySelectorAll<HTMLElement>(".home-backdrop")) {
      const planes = Array.from(el.querySelectorAll<HTMLElement>("[data-plx-drift]"));
      const existing = backdrops.get(el);
      if (existing) {
        existing.planes = planes;
        continue;
      }
      const box = el.parentElement ?? el;
      const b = { el, box, planes };
      backdrops.set(el, b);
      byBox.set(box, b);
      io.observe(box);
    }
    schedule();
  };
  let scanTimer = 0;
  const mo = new MutationObserver(() => {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 150);
  });
  mo.observe(home, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-plx-drift"] });
  scan();

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  return () => {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    window.clearTimeout(scanTimer);
    if (frame) cancelAnimationFrame(frame);
    io.disconnect();
    mo.disconnect();
    reset();
  };
}
