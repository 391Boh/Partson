// One scroll listener and one requestAnimationFrame loop for every
// scroll-linked background effect on the page (hero photo, category-browser
// parts). Sharing them means a single passive `scroll` handler, a single rAF,
// and — crucially — geometry is measured on register/resize/ResizeObserver,
// never on the scroll path. Per frame we read `window.scrollY` (a layout-free
// property) and nothing else, so scrolling never forces synchronous layout.
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
let frameId = 0;
let lastFrameTime = 0;
let targetsDirty = true;
let listenersAttached = false;
let reduceHeavyMotion = false;
let constrainedHardware: boolean | null = null;
let elementResizeObserver: ResizeObserver | null = null;
let geometryFrameId = 0;
const pendingGeometryElements = new Set<HTMLElement>();
let documentResizeObserver: ResizeObserver | null = null;
let documentRemeasureFrameId = 0;

// A short half-life removes raw wheel stepping without making the artwork
// trail behind the scrollbar. The wider previous value felt floaty on a
// Windows mouse wheel and kept the rAF loop alive longer after scrollend.
const EASE_HALF_LIFE_MS = 42;
const SETTLE_EPSILON = 0.001;
// Keep multi-plane effects fluid on 60/90 Hz screens while naturally landing
// around 60–72 updates on 120/144 Hz displays. Writing every 8 ms on a 144 Hz
// panel is imperceptibly different for these slow-moving background layers but
// costs almost twice as much compositor work.
const HEAVY_FRAME_INTERVAL_MS = 10.5;
// Registrations owned by product cards remain mounted for the lifetime of the
// page. Do not update an off-screen glow just because another visible effect
// keeps the shared frame loop alive. The small overscan primes the transform
// before the element reaches the viewport, so entry is still seamless.
const ACTIVE_OVERSCAN_PX = 240;

// `window.scrollY` never forces layout; `documentElement.scrollTop` can, so
// it is deliberately not used as a fallback.
const readScrollY = () => window.scrollY;

const smoothstep = (value: number) => value * value * (3 - 2 * value);

/** Smooth 0→1 transit from just below the viewport to just above it. */
export const getViewportParallaxProgress = (
  scrollY: number,
  viewportH: number,
  top: number,
  height: number
) => {
  const raw = (scrollY + viewportH - top) / (viewportH + height);
  return smoothstep(Math.min(Math.max(raw, 0), 1));
};

/** The same transit expressed as -1 entering, 0 centred, +1 leaving. */
export const getCenteredParallaxProgress = (
  scrollY: number,
  viewportH: number,
  top: number,
  height: number
) => getViewportParallaxProgress(scrollY, viewportH, top, height) * 2 - 1;

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

const observeGeometry = (el: HTMLElement) => {
  if (typeof ResizeObserver === "undefined") return;
  if (!elementResizeObserver) {
    elementResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        pendingGeometryElements.add(entry.target as HTMLElement);
      }
      if (geometryFrameId) return;
      geometryFrameId = requestAnimationFrame(() => {
        geometryFrameId = 0;
        if (pendingGeometryElements.size === 0) return;
        registrations.forEach((reg) => {
          if (pendingGeometryElements.has(reg.el)) measure(reg);
        });
        pendingGeometryElements.clear();
        targetsDirty = true;
        ensureRunning();
      });
    });
  }
  elementResizeObserver.observe(el);
};

const unobserveGeometry = (el: HTMLElement) => {
  if (Array.from(registrations).some((reg) => reg.el === el)) return;
  elementResizeObserver?.unobserve(el);
  pendingGeometryElements.delete(el);
};

const remeasureAll = (force = false) => {
  const nextWidth = window.innerWidth || 1;
  const nextHeight = window.innerHeight || 1;
  // Mobile browser chrome continuously changes innerHeight while scrolling.
  // Measuring every section for those height-only resizes forces layout on the
  // hottest path. Geometry only needs rebuilding when the layout width changes.
  if (!force && viewportW === nextWidth) {
    if (viewportH !== nextHeight) {
      viewportH = nextHeight;
      targetsDirty = true;
      ensureRunning();
    }
    return;
  }
  viewportW = nextWidth;
  viewportH = nextHeight;
  registrations.forEach(measure);
  targetsDirty = true;
  ensureRunning();
};

const frame = (now: number) => {
  refreshMotionBudget();
  const dt = lastFrameTime ? Math.min(64, now - lastFrameTime) : 16.67;
  lastFrameTime = now;

  const scrollY = readScrollY();
  const alpha = 1 - Math.pow(0.5, dt / EASE_HALF_LIFE_MS);
  let anyActive = false;

  registrations.forEach((reg) => {
    const isNearViewport =
      reg.top + reg.height >= scrollY - ACTIVE_OVERSCAN_PX &&
      reg.top <= scrollY + viewportH + ACTIVE_OVERSCAN_PX;
    if (!isNearViewport) {
      // Re-prime at the exact current position when it comes back. Continuing
      // to ease from an old off-screen value creates a visible catch-up sweep.
      reg.primed = false;
      reg.applied = NaN;
      return;
    }

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
    frameId = requestAnimationFrame(frame);
  } else {
    running = false;
    frameId = 0;
    lastFrameTime = 0;
  }
};

function ensureRunning() {
  if (running || registrations.size === 0 || document.hidden) return;
  running = true;
  lastFrameTime = 0;
  frameId = requestAnimationFrame(frame);
}

const onScroll = () => {
  targetsDirty = true;
  ensureRunning();
};

const onVisibilityChange = () => {
  if (document.hidden) {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    running = false;
    lastFrameTime = 0;
    return;
  }
  registrations.forEach((reg) => { reg.primed = false; });
  remeasureAll(true);
};

const onViewportResize = () => remeasureAll(false);
const forceRemeasureAll = () => remeasureAll(true);

// Homepage sections below a registered layer can grow after it registers —
// `.home-slot-auto`/`-product`/`-brands` only reserve a *minimum* skeleton
// height (see globals.css), and real catalogue content is free to exceed it
// once it mounts mid-scroll. That growth pushes every section below it down
// without the moved section itself resizing or re-entering the viewport, so
// neither `elementResizeObserver` nor the IntersectionObserver in each
// registrant fires — the moved section's cached `top` goes stale and its
// parallax transform jumps. Watching total document height catches this (and
// any other content-driven reflow: images loading in, fonts swapping) and
// re-syncs every registration's geometry against the page as it actually is.
const scheduleDocumentRemeasure = () => {
  if (documentRemeasureFrameId) return;
  documentRemeasureFrameId = requestAnimationFrame(() => {
    documentRemeasureFrameId = 0;
    remeasureAll(true);
  });
};

const attachListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("resize", onViewportResize, { passive: true });
  window.addEventListener("orientationchange", forceRemeasureAll);
  if (typeof ResizeObserver !== "undefined" && !documentResizeObserver) {
    documentResizeObserver = new ResizeObserver(scheduleDocumentRemeasure);
    documentResizeObserver.observe(document.body);
  }
};

const detachListenersIfIdle = () => {
  if (registrations.size > 0 || !listenersAttached) return;
  listenersAttached = false;
  window.removeEventListener("scroll", onScroll);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("resize", onViewportResize);
  window.removeEventListener("orientationchange", forceRemeasureAll);
  if (frameId) cancelAnimationFrame(frameId);
  if (geometryFrameId) cancelAnimationFrame(geometryFrameId);
  if (documentRemeasureFrameId) cancelAnimationFrame(documentRemeasureFrameId);
  frameId = 0;
  geometryFrameId = 0;
  documentRemeasureFrameId = 0;
  running = false;
  lastFrameTime = 0;
  pendingGeometryElements.clear();
  elementResizeObserver?.disconnect();
  elementResizeObserver = null;
  documentResizeObserver?.disconnect();
  documentResizeObserver = null;
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
    // Native scroll already interpolates homepage motion. Avoid running
    // easing tails for every decorative plane between wheel events.
    ease: opts.el.closest(".home-static") ? false : (opts.ease ?? true),
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
  observeGeometry(reg.el);
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
      unobserveGeometry(reg.el);
      detachListenersIfIdle();
    },
  };
}
