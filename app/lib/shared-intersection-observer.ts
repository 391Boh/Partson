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
};

const sharedObservers = new Map<string, SharedObserverEntry>();

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
        for (const observerEntry of observerEntries) {
          if (!observerEntry.isIntersecting) continue;
          const callback = callbacks.get(observerEntry.target);
          if (!callback) continue;
          callbacks.delete(observerEntry.target);
          observer.unobserve(observerEntry.target);
          callback();
        }
      },
      { rootMargin }
    );
    entry = { observer, callbacks };
    sharedObservers.set(rootMargin, entry);
  }

  entry.callbacks.set(element, onIntersect);
  entry.observer.observe(element);

  return () => {
    entry!.callbacks.delete(element);
    entry!.observer.unobserve(element);
  };
};
