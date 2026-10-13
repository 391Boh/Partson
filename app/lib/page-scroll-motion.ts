import { canUseTimelineParallax, registerParallax, type ParallaxHandle } from "./parallax-controller";

const BACKGROUNDS = ".directory-hero-backdrop, .home-popular-photo, .home-backdrop [data-plx-drift], .hero-photo, .info-hero-art-frame";
const BLOCKS = ".home-auto-grid > .reveal-head, .home-category-grid > :first-child, .home-brands-grid > .reveal-head, .home-story-grid > .reveal-adv-copy, .directory-intro-copy, .directory-intro-facts, .directory-detail-hero > .relative.grid > aside, .directory-detail-identity, .directory-guide-copy, .directory-guide-notes, .info-content-card, .info-step-card, .info-cta, .catalog-seo-title, .catalog-seo-copy-primary, .catalog-seo-copy-secondary";
const SELECTOR = `${BACKGROUNDS}, ${BLOCKS}`;
type Effect = { el: HTMLElement; scene: HTMLElement; amplitude: number; axis: "x" | "y"; hero: boolean; lastShift?: number };

/** One viewport observer; native timelines when available, otherwise the shared
 * cached-geometry controller. No React updates or layout reads on scroll. */
export function installPageScrollMotion(root: HTMLElement) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const native = canUseTimelineParallax();
  const effects = new Map<HTMLElement, Effect>();
  const scenes = new Set<HTMLElement>();
  const fallbackScenes = new Map<HTMLElement, { active: Set<Effect>; handle?: ParallaxHandle; progress?: number }>();
  let timer = 0;
  let stopped = false;

  const paint = (item: Effect, progress: number) => {
    const gain = (window.innerWidth < 768 ? .45 : 1) * (document.documentElement.classList.contains("reduce-scroll-effects") ? .5 : 1);
    const shift = Math.round(progress * item.amplitude * gain * 10) / 10;
    if (shift === item.lastShift) return;
    item.lastShift = shift;
    item.el.style.translate = item.axis === "x" ? `${shift}px 0` : `0 ${shift}px`;
  };
  const deactivate = (effect: Effect) => {
    const group = fallbackScenes.get(effect.scene);
    group?.active.delete(effect);
    if (group && group.active.size === 0) {
      group.handle?.release();
      fallbackScenes.delete(effect.scene);
    }
    effect.lastShift = undefined;
    delete effect.el.dataset.pageMotionActive;
    effect.el.style.removeProperty("translate");
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const effect = effects.get(entry.target as HTMLElement);
      if (!effect) continue;
      if (!entry.isIntersecting || motion.matches) { deactivate(effect); continue; }
      effect.el.dataset.pageMotionActive = "";
      if (native) continue;
      let group = fallbackScenes.get(effect.scene);
      if (!group) {
        group = { active: new Set<Effect>() };
        fallbackScenes.set(effect.scene, group);
      }
      group.active.add(effect);
      if (group.handle) {
        if (group.progress !== undefined) paint(effect, group.progress);
        continue;
      }
      const sceneMotion = group;
      group.handle = registerParallax({
        el: effect.scene,
        ease: false,
        heavy: false,
        compute: (scrollY, viewportH, top, height) => effect.hero
          ? Math.max(0, Math.min(1, (scrollY - top) / height))
          : Math.max(-1, Math.min(1, (scrollY + viewportH / 2 - top - height / 2) / ((viewportH + height) / 2))),
        apply: progress => {
          sceneMotion.progress = progress;
          for (const item of sceneMotion.active) paint(item, progress);
        },
      });
    }
  }, { rootMargin: "160px 0px" });

  const scan = () => {
    timer = 0;
    if (stopped) return;
    for (const [el, effect] of effects) {
      if (root.contains(el)) continue;
      deactivate(effect);
      observer.unobserve(el);
      delete el.dataset.pageMotion;
      delete el.dataset.pageMotionNative;
      effects.delete(el);
    }
    // One small depth anchor per homepage backdrop. Moving the entire section
    // field promoted a large transparent texture containing all of its masks;
    // one compact plane keeps the depth cue without that raster/memory cost.
    const allowed = new Set<HTMLElement>();
    const homeBackdrops = new Set<Element>();
    for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) {
      const backdrop = el.closest(".home-backdrop");
      if (backdrop) {
        if (homeBackdrops.has(backdrop)) continue;
        homeBackdrops.add(backdrop);
      }
      allowed.add(el);
    }
    for (const [el, effect] of effects) {
      if (allowed.has(el)) continue;
      deactivate(effect);
      observer.unobserve(el);
      delete el.dataset.pageMotion;
      delete el.dataset.pageMotionNative;
      effects.delete(el);
    }
    for (const el of allowed) {
      if (effects.has(el) || el.closest(".partner-page")) continue;
      const background = el.matches(BACKGROUNDS);
      const hero = el.matches(".hero-photo");
      const scene = el.matches(".home-popular-photo") ? el.closest<HTMLElement>(".home-popular-nav") : el.parentElement?.closest<HTMLElement>("section") ?? el.parentElement;
      if (!scene || scene === el) continue;
      const drift = Number.parseFloat(el.style.getPropertyValue("--plx-drift"));
      const amplitude = hero ? 56 : el.matches(".directory-hero-backdrop") ? -72 : el.matches(".directory-intro-facts,.directory-detail-hero aside") ? -14 : background ? (Number.isFinite(drift) ? Math.sign(drift) * Math.min(48, Math.max(24, Math.abs(drift))) : -32) : (el.matches(".directory-guide-notes,.info-step-card:nth-child(even),.catalog-seo-copy-secondary") ? -20 : 20);
      const axis = !background && el.matches(".home-auto-grid > .reveal-head,.directory-intro-copy,.directory-detail-identity,.directory-guide-copy,.catalog-seo-title") ? "x" : "y";
      const effect: Effect = { el, scene, amplitude, axis, hero };
      effects.set(el, effect);
      scenes.add(scene);
      scene.dataset.pageMotionScene = "";
      el.dataset.pageMotion = hero ? "hero" : "drift";
      if (native) el.dataset.pageMotionNative = "";
      el.style.setProperty("--page-motion-from-x", `${axis === "x" ? -amplitude : 0}px`);
      el.style.setProperty("--page-motion-to-x", `${axis === "x" ? amplitude : 0}px`);
      el.style.setProperty("--page-motion-from-y", `${axis === "y" && !hero ? -amplitude : 0}px`);
      el.style.setProperty("--page-motion-to-y", `${axis === "y" ? amplitude : 0}px`);
      observer.observe(el);
    }
  };
  const changes = new MutationObserver(records => {
    // Prices, counters, model years and loader text do not add motion targets.
    // Inspect only the changed subtrees instead of rescanning the entire page
    // after every asynchronous text/card update.
    const relevant = records.some(record => {
      if (record.type === "attributes") return true;
      for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches(SELECTOR) || node.querySelector(SELECTOR))) return true;
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) continue;
        for (const el of effects.keys()) if (node === el || node.contains(el)) return true;
      }
      return false;
    });
    if (!relevant) return;
    if (!timer) timer = window.setTimeout(scan, 100);
  });
  changes.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-plx-drift"] });
  let viewportWidth = window.innerWidth;
  const resize = () => {
    if (viewportWidth === window.innerWidth) return;
    viewportWidth = window.innerWidth;
    if (!timer) timer = window.setTimeout(scan, 100);
  };
  window.addEventListener("resize", resize, { passive: true });
  const refreshMotion = () => {
    for (const effect of effects.values()) {
      deactivate(effect);
      observer.unobserve(effect.el);
      observer.observe(effect.el);
    }
  };
  motion.addEventListener("change", refreshMotion);
  scan();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    changes.disconnect();
    window.removeEventListener("resize", resize);
    observer.disconnect();
    motion.removeEventListener("change", refreshMotion);
    for (const effect of effects.values()) {
      deactivate(effect);
      delete effect.el.dataset.pageMotion;
      delete effect.el.dataset.pageMotionNative;
      for (const suffix of ["from-x", "to-x", "from-y", "to-y"]) effect.el.style.removeProperty(`--page-motion-${suffix}`);
    }
    for (const scene of scenes) delete scene.dataset.pageMotionScene;
  };
}
