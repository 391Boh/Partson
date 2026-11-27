/** Fade only a newly arrived photo. Cached/SSR photos must never dim again
 * when React hydrates or the complete stylesheet becomes available. */
export function revealHomeImage(image: HTMLImageElement, hydratedAt: number | null) {
  if (hydratedAt === null || !image.animate || image.dataset.homeImageRevealed) return;
  image.dataset.homeImageRevealed = "true";
  if (image.classList.contains("is-materializing")) return;

  const resource = performance.getEntriesByName(image.currentSrc).at(-1) as PerformanceResourceTiming | undefined;
  if (!resource || resource.responseEnd <= hydratedAt) return;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches) return;

  const opacity = Number(getComputedStyle(image).opacity);
  const animation = image.animate([{ opacity: opacity * .35 }, { opacity }], {
    duration: 480,
    easing: "cubic-bezier(.16,1,.3,1)",
  });
  const stop = () => { if (motion.matches) animation.cancel(); };
  motion.addEventListener("change", stop);
  void animation.finished.catch(() => {}).finally(() => motion.removeEventListener("change", stop));
}
