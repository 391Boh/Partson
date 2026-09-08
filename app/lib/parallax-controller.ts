// One scroll listener and one requestAnimationFrame loop for every
// scroll-linked background effect on the page (hero photo, category-browser
// parts). Sharing them means a single passive `scroll` handler, a single rAF,
// and — crucially — the geometry of each section is measured only on register
// and on resize, never on the scroll path. Per frame we read `window.scrollY`
// (a layout-free property) and nothing else, so scrolling never triggers a
// forced synchronous layout no matter how many effects are active.
//
// Each registrant supplies `compute` (raw target from scrollY + cached
// geometry) and `apply` (write transforms). The controller eases every
// registrant's value toward its target with a frame-rate-independent filter,
// so 60 Hz and 120 Hz devices get the same visual smoothing, and stops the
// loop entirely once everything has settled.

type Registration = {
  el: HTMLElement;
  compute: (scrollY: number, viewportH: number, top: number, height: number) => number;
  apply: (eased: number) => void;
  // false = follow the scroll position 1:1 (for effects that must feel
  // pinned to the scrollbar). true = frame-rate-independent easing toward the
  // target, which smooths iOS momentum jumps and 120 Hz devices alike.
  ease: boolean;
  heavy: boolean;
  top: number;
  height: number;
  target: number;
  eased: number;
  applied: number; // last value actually written, to skip no-op frames
  lastHeavyApplyAt: number;
  primed: boolean;
};

const registrations = new Set<Registration>();

let viewportH = 0;
let viewportW = 0;
let running = false;
let lastFrameTime = 0;
let targetsDirty = true;
let listenersAttached = false;
let reduceHeavyMotion = false;
let constrainedHardware: boolean | null = null;

// A short half-life removes raw wheel stepping without making the artwork
// trail behind the scrollbar. The wider previous value felt floaty on a
// Windows mouse wheel and kept the rAF loop alive longer after scrollend.
const EASE_HALF_LIFE_MS = 48;
const SETTLE_EPSILON = 0.001;
// Decorative multi-plane backdrops do not gain visible quality above 60 Hz,
// while their style writes still consume main-thread/compositor bandwidth on
// 90/120/144 Hz displays. The hero photo remains uncapped; only registrations
// explicitly marked `heavy` use this cadence.
const HEAVY_FRAME_INTERVAL_MS = 15.5;

// `window.scrollY` never forces layout; `documentElement.scrollTop` can, so
// it is deliberately not used as a fallback.
const readScrollY = () => window.scrollY;

const refreshMotionBudget = () => {
  if (constrainedHardware === null) {
    const nav = navigator as Navigator & { deviceMemory?: number };
    constrainedHardware =
      (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) ||
      (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4);
  }
  reduceHeavyMotion =
    Boolean(constrainedHardware) ||
    document.documentElement.classList.contains("reduce-scroll-effects");
};

const measure = (reg: Registration) => {
  const rect = reg.el.getBoundingClientRect();
  reg.top = rect.top + readScrollY();
  reg.height = rect.height || 1;
};

const remeasureAll = (force = false) => {
  const nextWidth = window.innerWidth || 1;
  // Mobile browser chrome continuously changes innerHeight while scrolling.
  // Measuring every section for those height-only resizes forces layout on the
  // hottest path. Geometry only needs rebuilding when the layout width changes.
  if (!force && viewportW === nextWidth) return;
  viewportW = nextWidth;
  viewportH = window.innerHeight || 1;
  registrations.forEach(measure);
  targetsDirty = true;
  ensureRunning();
};

const frame = (now: number) => {
  const dt = lastFrameTime ? Math.min(64, now - lastFrameTime) : 16.67;
  lastFrameTime = now;

  const scrollY = readScrollY();
  const alpha = 1 - Math.pow(0.5, dt / EASE_HALF_LIFE_MS);
  let anyActive = false;

  registrations.forEach((reg) => {
    if (targetsDirty || !reg.primed) {
      reg.target = reg.compute(scrollY, viewportH, reg.top, reg.height);
    }

    // A slower device still gets visible parallax. Multi-plane backgrounds
    // update at a capped ~30fps cadence while native scrolling can continue at
    // 60/120fps; the previous implementation froze them for the whole tab.
    if (reduceHeavyMotion && reg.heavy) {
      reg.primed = true;
      reg.eased = reg.target;
      if (reg.target !== reg.applied) {
        if (!Number.isFinite(reg.applied) || now - reg.lastHeavyApplyAt >= 30) {
          reg.applied = reg.target;
          reg.lastHeavyApplyAt = now;
          reg.apply(reg.target);
        } else {
          anyActive = true;
        }
      }
      return;
    }

    if (!reg.primed) {
      // First paint snaps to the correct spot — no "ease in from zero" on load.
      reg.primed = true;
      reg.eased = reg.target;
    } else if (!reg.ease) {
      reg.eased = reg.target;
    } else if (Math.abs(reg.target - reg.eased) > SETTLE_EPSILON) {
      reg.eased += (reg.target - reg.eased) * alpha;
      anyActive = true;
    } else {
      reg.eased = reg.target;
    }

    // Skip the transform write (and its string building) when this layer
    // hasn't actually moved this frame.
    if (reg.eased !== reg.applied) {
      if (
        reg.heavy &&
        Number.isFinite(reg.applied) &&
        now - reg.lastHeavyApplyAt < HEAVY_FRAME_INTERVAL_MS
      ) {
        anyActive = true;
        return;
      }
      reg.applied = reg.eased;
      if (reg.heavy) reg.lastHeavyApplyAt = now;
      reg.apply(reg.eased);
    }
  });

  targetsDirty = false;

  if (anyActive) {
    requestAnimationFrame(frame);
  } else {
    running = false;
    lastFrameTime = 0;
  }
};

function ensureRunning() {
  if (running || registrations.size === 0) return;
  running = true;
  lastFrameTime = 0;
  requestAnimationFrame(frame);
}

const onScroll = () => {
  refreshMotionBudget();
  targetsDirty = true;
  ensureRunning();
};

const onViewportResize = () => remeasureAll(false);
const forceRemeasureAll = () => remeasureAll(true);

const attachListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;
  window.addEventListener("scroll", onScroll, { passive: true });
  // iOS fires `scroll` only sparsely during a momentum fling; `touchmove`
  // keeps the targets tracking the finger, and the eased loop smooths the
  // gap the fling leaves behind.
  window.addEventListener("touchmove", onScroll, { passive: true });
  window.addEventListener("resize", onViewportResize, { passive: true });
  window.addEventListener("orientationchange", forceRemeasureAll);
};

const detachListenersIfIdle = () => {
  if (registrations.size > 0 || !listenersAttached) return;
  listenersAttached = false;
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("touchmove", onScroll);
  window.removeEventListener("resize", onViewportResize);
  window.removeEventListener("orientationchange", forceRemeasureAll);
};

export type ParallaxHandle = {
  /** Re-read this section's geometry (call when layout above it may have shifted). */
  refresh: () => void;
  /** Remove the effect and, if it was the last one, tear down the listeners. */
  release: () => void;
};

export function registerParallax(opts: {
  el: HTMLElement;
  compute: Registration["compute"];
  apply: Registration["apply"];
  ease?: boolean;
  heavy?: boolean;
}): ParallaxHandle {
  // Respect the platform accessibility preference at the source. This avoids
  // starting the shared scroll listener/rAF loop at all when motion is
  // disabled, instead of merely hiding the final transform in CSS.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    opts.apply(0);
    return { refresh: () => {}, release: () => {} };
  }

  const reg: Registration = {
    el: opts.el,
    compute: opts.compute,
    apply: opts.apply,
    ease: opts.ease ?? true,
    heavy: opts.heavy ?? false,
    top: 0,
    height: 1,
    target: 0,
    eased: 0,
    applied: NaN,
    lastHeavyApplyAt: 0,
    primed: false,
  };

  if (!viewportH) viewportH = window.innerHeight || 1;
  if (!viewportW) viewportW = window.innerWidth || 1;
  measure(reg);
  registrations.add(reg);
  attachListeners();
  refreshMotionBudget();
  targetsDirty = true;
  ensureRunning();

  return {
    refresh: () => {
      measure(reg);
      targetsDirty = true;
      ensureRunning();
    },
    release: () => {
      registrations.delete(reg);
      detachListenersIfIdle();
    },
  };
}
