// A product grid can mount 50-150+ ProductCardImage instances at once, and
// each used to create its own IntersectionObserver. Chromium's per-frame
// intersection computation cost scales with the number of *observer
// instances*, not just observed targets — on a fast scroll through a catalog
// grid, dozens of separately-instantiated observers crossing threshold in the
// same frame showed up as a single ~60ms+ blocking task (IntersectionObserverCallback
// in a LoAF trace). One shared observer per rootMargin, watching many targets,
// collapses that back down to the cost of a single observer.
type SharedObserverEntry = {
  observer: IntersectionObserver;
  callbacks: Map<Element, () => void>;
  queue: Element[];
  rafId: number;
};

const sharedObservers = new Map<string, SharedObserverEntry>();

// A fast flick can cross dozens of cards' thresholds within the same
// IntersectionObserver callback invocation. Each crossing flips a card from
// skeleton to <img>, and calling all of those onIntersect callbacks
// synchronously lets React queue 50+ component updates for the same commit.
// Render work is interruptible, but React's commit phase (the part that
// actually mounts the new <img> elements) is not — a LoAF trace showed that
// single commit as one ~600ms blocking task during a fast scroll. Draining
// the queue in small batches across animation frames caps how many cards can
// land in any one commit, regardless of how many crossed at once.
const DRAIN_BATCH_SIZE = 6;

const drainQueue = (rootMargin: string) => {
  const entry = sharedObservers.get(rootMargin);
  if (!entry) return;
  entry.rafId = 0;

  const batch = entry.queue.splice(0, DRAIN_BATCH_SIZE);
  for (const element of batch) {
    const callback = entry.callbacks.get(element);
    entry.callbacks.delete(element);
    callback?.();
  }

  if (entry.queue.length > 0) {
    entry.rafId = requestAnimationFrame(() => drainQueue(rootMargin));
  }
};

export const observeNearViewport = (
  element: Element,
  rootMargin: string,
  onIntersect: () => void
): (() => void) => {
  let entry = sharedObservers.get(rootMargin);
  if (!entry) {
    const callbacks = new Map<Element, () => void>();
    const observer = new IntersectionObserver(
      (observerEntries) => {
        const current = sharedObservers.get(rootMargin);
        if (!current) return;

        for (const observerEntry of observerEntries) {
          if (!observerEntry.isIntersecting) continue;
          if (!current.callbacks.has(observerEntry.target)) continue;
          current.observer.unobserve(observerEntry.target);
          current.queue.push(observerEntry.target);
        }

        if (current.queue.length > 0 && !current.rafId) {
          current.rafId = requestAnimationFrame(() => drainQueue(rootMargin));
        }
      },
      { rootMargin }
    );
    entry = { observer, callbacks, queue: [], rafId: 0 };
    sharedObservers.set(rootMargin, entry);
  }

  entry.callbacks.set(element, onIntersect);
  entry.observer.observe(element);

  return () => {
    entry!.callbacks.delete(element);
    entry!.observer.unobserve(element);
    const queueIndex = entry!.queue.indexOf(element);
    if (queueIndex !== -1) entry!.queue.splice(queueIndex, 1);
  };
};
