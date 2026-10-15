import { observeNearViewport } from "./shared-intersection-observer";

// Already-visible content gets one short compositor animation on first entry.
// No hidden class, scroll listener, React update or persistent will-change.
export function observeViewportEntrance(element: HTMLElement, offset = 0): () => void {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches || typeof element.animate !== "function") return () => {};

  let animation: Animation | undefined;
  const removeMotionListener = () => motion.removeEventListener("change", onMotionChange);
  const stop = observeNearViewport(element, "0px", () => {
    if (motion.matches || !element.isConnected) return;
    const frames: Keyframe[] = offset
      ? [{ opacity: .82, transform: `translateY(${offset}px)` }, { opacity: 1, transform: "none" }]
      : [{ opacity: .82 }, { opacity: 1 }];
    animation = element.animate(frames, {
      duration: 260,
      easing: "cubic-bezier(.16,1,.3,1)",
    });
    void animation.finished.then(removeMotionListener, removeMotionListener);
  });
  const onMotionChange = () => {
    if (!motion.matches) return;
    stop();
    animation?.cancel();
    removeMotionListener();
  };
  motion.addEventListener("change", onMotionChange);
  return () => {
    stop();
    removeMotionListener();
    animation?.cancel();
  };
}
