'use client';

import type { ComponentType, ReactNode } from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import Header from "./Header";
import NavigationProgress from "./NavigationProgress";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronUp, MessageCircle, Plus, Shield } from "lucide-react";
import {
  CATALOG_PAGE_CACHE_VERSION,
  CATALOG_PRODUCTS_CACHE_KEY,
  CATALOG_PRODUCTS_CACHE_TTL_MS,
} from "app/lib/catalog-client-cache";
import { GOOGLE_REDIRECT_PENDING_KEY } from "app/lib/auth-storage";

const ProductCreateModal = dynamic(() => import("./ProductCreateModal"), {
  ssr: false,
});

interface LayoutHostProps {
  children: ReactNode;
}


type AdminChatPanelComponentProps = {
  isOpen: boolean;
  isPinned?: boolean;
  onClose: () => void;
  onPinnedChange?: (isPinned: boolean) => void;
  onNotificationCountChange?: (count: number) => void;
};

type TelegramChatComponentProps = {
  isOpen: boolean;
  onClose: () => void;
  prefillMessage?: string | null;
  onPrefillSent?: () => void;
};

type ChatButtonComponentProps = {
  onClick: () => void;
  unreadCount: number;
};

type RouteViewState = {
  isEmbeddedProductView: boolean;
};

type LayoutFirebaseDeps = {
  auth: Auth;
  db: Firestore;
  collection: typeof import("firebase/firestore").collection;
  doc: typeof import("firebase/firestore").doc;
  getDoc: typeof import("firebase/firestore").getDoc;
  onAuthStateChanged: typeof import("firebase/auth").onAuthStateChanged;
  onSnapshot: typeof import("firebase/firestore").onSnapshot;
  query: typeof import("firebase/firestore").query;
  setDoc: typeof import("firebase/firestore").setDoc;
  where: typeof import("firebase/firestore").where;
};

let layoutFirebaseDepsPromise: Promise<LayoutFirebaseDeps> | null = null;

const loadLayoutFirebaseDeps = () => {
  layoutFirebaseDepsPromise ??= Promise.all([
    import("../../firebase"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]).then(([firebaseModule, authModule, firestoreModule]) => ({
    auth: firebaseModule.auth,
    db: firebaseModule.db,
    collection: firestoreModule.collection,
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    onAuthStateChanged: authModule.onAuthStateChanged,
    onSnapshot: firestoreModule.onSnapshot,
    query: firestoreModule.query,
    setDoc: firestoreModule.setDoc,
    where: firestoreModule.where,
  }));

  return layoutFirebaseDepsPromise;
};

const normalizeStoredId = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const createGuestChatId = () => {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `user_${cryptoObj.randomUUID()}`;
  }

  return `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const readUserChatId = (data?: Record<string, unknown>) =>
  normalizeStoredId(data?.chatUserId) ??
  normalizeStoredId(data?.chat_user_id) ??
  normalizeStoredId(data?.chatId);

const isPermissionDeniedError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "permission-denied";
};

const ADMIN_ROLE_VALUES = new Set([
  "admin",
  "administrator",
  "manager",
  "superadmin",
  "owner",
]);

const normalizeAdminToken = (value: string) =>
  value.trim().toLowerCase().replace(/[\s_-]+/g, "");

const normalizeAdminValue = (value: unknown) =>
  typeof value === "string" ? normalizeAdminToken(value) : "";

const getAdminStorageKey = (uid: string) => `partson:isAdmin:${uid}`;

// Used to be a client-side Set built from NEXT_PUBLIC_ADMIN_EMAILS compared
// directly against the signed-in user's email. Being a "use client"
// component meant that env var's actual value — the real admin email(s) —
// got inlined into the shipped JS bundle for anyone to read out of the
// page source, a targeted-phishing risk. The allowlist itself now only
// lives server-side (see app/api/is-admin/route.ts); this just asks it.
const checkIsAdminOnServer = async (idToken: string): Promise<boolean> => {
  try {
    const response = await fetch("/api/is-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { isAdmin?: unknown };
    return data.isAdmin === true;
  } catch {
    return false;
  }
};

const readRememberedAdminAccess = (uid: string) => {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(getAdminStorageKey(uid)) === "1";
  } catch {
    return false;
  }
};

const isTruthyAdminFlag = (value: unknown) => {
  if (value === true || value === 1) return true;
  const normalized = normalizeAdminValue(value);
  return ["1", "true", "yes", "admin", "manager", "superadmin"].includes(
    normalized
  );
};

const hasAdminRole = (value: unknown): boolean => {
  if (!value) return false;
  if (typeof value === "string") {
    return ADMIN_ROLE_VALUES.has(normalizeAdminToken(value));
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasAdminRole(entry));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) =>
      hasAdminRole(entry)
    );
  }
  return false;
};

const hasAdminAccess = (
  source?: Record<string, unknown>,
  visited?: WeakSet<Record<string, unknown>>
): boolean => {
  if (!source) return false;

  const seen = visited ?? new WeakSet<Record<string, unknown>>();
  if (seen.has(source)) return false;
  seen.add(source);

  return (
    hasAdminRole(source.role) ||
    hasAdminRole(source.roles) ||
    hasAdminRole(source.userRole) ||
    hasAdminRole(source.user_role) ||
    hasAdminRole(source.permission) ||
    hasAdminRole(source.permissions) ||
    hasAdminRole(source.access) ||
    hasAdminRole(source.accessLevel) ||
    hasAdminRole(source.access_level) ||
    isTruthyAdminFlag(source.isAdmin) ||
    isTruthyAdminFlag(source.admin) ||
    isTruthyAdminFlag(source.is_admin) ||
    isTruthyAdminFlag(source.isManager) ||
    isTruthyAdminFlag(source.manager) ||
    isTruthyAdminFlag(source.is_manager) ||
    isTruthyAdminFlag(source.isSuperAdmin) ||
    isTruthyAdminFlag(source.superadmin) ||
    isTruthyAdminFlag(source.is_superadmin) ||
    Object.values(source).some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (Array.isArray(entry)) {
        return entry.some(
          (item) =>
            item &&
            typeof item === "object" &&
            hasAdminAccess(item as Record<string, unknown>, seen)
        );
      }
      return hasAdminAccess(entry as Record<string, unknown>, seen);
    })
  );
};

const PRIMARY_WARMUP_ROUTES = [
  "/",
  "/katalog",
  "/groups",
  "/manufacturers",
  "/auto",
  "/katalog?tab=auto",
  "/katalog?tab=category",
  "/inform/delivery",
  "/inform/payment",
  "/inform/about",
  "/inform/location",
  "/inform/warranty",
  "/inform/returns",
  "/inform/diagnostics",
  "/inform/privacy",
] as const;

const shouldUseLightNetworkWarmup = () => {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  const isSlowConnection =
    Boolean(connection?.saveData) ||
    (typeof connection?.effectiveType === "string" &&
      connection.effectiveType.includes("2g"));
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const isLowMemoryDevice =
    typeof deviceMemory === "number" && deviceMemory > 0 && deviceMemory <= 4;
  return isSlowConnection || isLowMemoryDevice;
};

const isNavigationClick = (event: Event) => {
  const target = event.target;
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  const anchor = element?.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.target === "_blank") return false;

  const href = anchor.getAttribute("href") || "";
  if (
    !href ||
    href.startsWith("#") ||
    href.startsWith("javascript:") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  ) {
    return false;
  }

  try {
    const url = new URL(anchor.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
};

function RouteViewStateSync({
  pathname,
  onChange,
}: {
  pathname: string;
  onChange: (state: RouteViewState) => void;
}) {
  const searchParams = useSearchParams();
  const viewParam = searchParams?.get("view") ?? null;

  useEffect(() => {
    onChange({
      isEmbeddedProductView:
        pathname.startsWith("/product/") && viewParam === "modal",
    });
  }, [onChange, pathname, viewParam]);

  return null;
}

export default function LayoutHost({ children }: LayoutHostProps) {
  const [AdminChatPanelComponent, setAdminChatPanelComponent] =
    useState<ComponentType<AdminChatPanelComponentProps> | null>(null);
  const [TelegramChatComponent, setTelegramChatComponent] =
    useState<ComponentType<TelegramChatComponentProps> | null>(null);
  const [ChatButtonComponent, setChatButtonComponent] =
    useState<ComponentType<ChatButtonComponentProps> | null>(null);
  const [firebaseDeps, setFirebaseDeps] = useState<LayoutFirebaseDeps | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isAdminPanelPinned, setIsAdminPanelPinned] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckReady, setAdminCheckReady] = useState(false);
  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userUnreadCount, setUserUnreadCount] = useState(0);
  const [totalNotifications, setTotalNotifications] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [routeViewState, setRouteViewState] = useState<RouteViewState>({
    isEmbeddedProductView: false,
  });
  const [showScrollTop, setShowScrollTop] = useState(false);

  const router = useRouter();
  const pathnameValue = usePathname();
  const pathname = pathnameValue ?? "";
  const isAdminEmailRef = useRef(false);
  const warmupStartedRef = useRef(false);
  const primaryRoutePrefetchStartedRef = useRef(false);
  const previousPathnameRef = useRef(pathname);
  const adminPanelPathnameRef = useRef(pathname);
  const scrollTopSentinelRef = useRef<HTMLSpanElement | null>(null);
  const isDevelopment = process.env.NODE_ENV !== "production";
  const enableAggressiveWarmup =
    process.env.NEXT_PUBLIC_ENABLE_AGGRESSIVE_WARMUP === "1";
  const enableIdleFirebase =
    process.env.NEXT_PUBLIC_ENABLE_IDLE_FIREBASE === "1";
  const { isEmbeddedProductView } = routeViewState;
  const openChat = useCallback(() => {
    setIsChatOpen(true);
  }, []);
  const closeChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sentinel = scrollTopSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setShowScrollTop(!entry?.isIntersecting),
      { rootMargin: "300px 0px 0px 0px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Large homepage sections have decorative hover gradients and shadows. As
  // the page moves underneath a stationary pointer, those hovers can fire in
  // sequence and trigger expensive full-width paints during the wheel/touch
  // gesture. Expose a short-lived scrolling state so CSS can suspend only the
  // decorative effects while native scrolling remains entirely compositor-led.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    let endTimer: number | null = null;
    let scrolling = false;

    const handleScroll = () => {
      if (!scrolling) {
        scrolling = true;
        root.classList.add("is-scrolling");
      }
      if (endTimer !== null) window.clearTimeout(endTimer);
      endTimer = window.setTimeout(() => {
        scrolling = false;
        root.classList.remove("is-scrolling");
        endTimer = null;
      }, 140);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (endTimer !== null) window.clearTimeout(endTimer);
      root.classList.remove("is-scrolling");
    };
  }, []);

  useEffect(() => {
    try {
      const uid = localStorage.getItem("user_id");
      if (uid) {
        setAuthUserUid(uid);
        if (localStorage.getItem(`partson:isAdmin:${uid}`) === "1") {
          setIsAdmin(true);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const storedId = normalizeStoredId(localStorage.getItem("chat_user_id"));
      if (storedId) {
        setUserId(storedId);
        setLoading(false);
      } else {
        const guestId = createGuestChatId();
        localStorage.setItem("chat_user_id", guestId);
        setUserId(guestId);
        setLoading(false);
      }
    } catch {}
  }, []);

  const syncRouteViewState = useCallback((nextState: RouteViewState) => {
    setRouteViewState((currentState) => {
      if (
        currentState.isEmbeddedProductView === nextState.isEmbeddedProductView
      ) {
        return currentState;
      }

      return nextState;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || firebaseDeps) return;

    let cancelled = false;
    const loadDeps = () => {
      void loadLayoutFirebaseDeps()
        .then((deps) => {
          if (!cancelled) {
            setFirebaseDeps(deps);
          }
        })
        .catch((error) => {
          console.error("Failed to load layout Firebase deps:", error);
        });
    };

    let timeoutId: number | null = null;
    const idleId: number | null = null;
    const triggerDepsLoad = (event?: Event) => {
      if (event?.type === "click" && isNavigationClick(event)) {
        return;
      }
      window.removeEventListener("click", triggerDepsLoad);
      window.removeEventListener("keydown", triggerDepsLoad);
      if (timeoutId != null) window.clearTimeout(timeoutId);
      if (idleId != null && "cancelIdleCallback" in window) {
        (window as Window & { cancelIdleCallback?: (id: number) => void })
          .cancelIdleCallback?.(idleId);
      }
      loadDeps();
    };

    window.addEventListener("click", triggerDepsLoad, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", triggerDepsLoad, { once: true });

    // Guests (no user_id in localStorage) get no proactive timer — Firebase loads
    // only on first interaction. This removes auth/iframe.js from the LCP critical
    // path for anonymous visitors. Logged-in users keep the original short delay.
    const isLikelyLoggedIn = (() => {
      try {
        return Boolean(
          localStorage.getItem("user_id") ||
            sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === "1"
        );
      } catch {
        return false;
      }
    })();
    if (isLikelyLoggedIn) {
      const delayMs = enableIdleFirebase ? 3500 : 1800;
      timeoutId = window.setTimeout(triggerDepsLoad, delayMs);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("click", triggerDepsLoad);
      window.removeEventListener("keydown", triggerDepsLoad);
      if (timeoutId != null) window.clearTimeout(timeoutId);
      if (idleId != null && "cancelIdleCallback" in window) {
        (window as Window & { cancelIdleCallback?: (id: number) => void })
          .cancelIdleCallback?.(idleId);
      }
    };
  }, [enableIdleFirebase, firebaseDeps]);

  useEffect(() => {
    if (typeof window === "undefined" || ChatButtonComponent) return;

    let cancelled = false;
    const loadChatButton = () => {
      void import("./ChatButton")
        .then((module) => {
          if (!cancelled) {
            setChatButtonComponent(() => module.default);
          }
        })
        .catch((error) => {
          console.error("Failed to load chat button chunk:", error);
        });
    };

    let timeoutId: number | null = null;
    const triggerChatButtonLoad = (event?: Event) => {
      if (event?.type === "click" && isNavigationClick(event)) {
        return;
      }
      window.removeEventListener("click", triggerChatButtonLoad);
      window.removeEventListener("keydown", triggerChatButtonLoad);
      if (timeoutId != null) window.clearTimeout(timeoutId);
      loadChatButton();
    };

    window.addEventListener("click", triggerChatButtonLoad, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", triggerChatButtonLoad, { once: true });

    // The lightweight fallback button is already interactive. On the home
    // page keep the decorative chat-button chunk out of the initial loading
    // window unless the visitor interacts first.
    timeoutId = window.setTimeout(
      triggerChatButtonLoad,
      pathname === "/" ? 15000 : 5000
    );

    return () => {
      cancelled = true;
      window.removeEventListener("click", triggerChatButtonLoad);
      window.removeEventListener("keydown", triggerChatButtonLoad);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [ChatButtonComponent, pathname]);

  useEffect(() => {
    syncRouteViewState({
      isEmbeddedProductView: false,
    });
  }, [pathname, syncRouteViewState]);

  // Always land at the top on a real page-to-page navigation, regardless of
  // which route it's to/from. Previously this only fired for "/" and for
  // product-to-product navigation, so every other transition (e.g. groups ->
  // group, auto -> brand, manufacturers -> producer, anything -> katalog)
  // relied on the browser's/Next's own scroll restoration, which doesn't
  // reliably reset to top after every streamed route update. Same-page
  // updates (router.replace with only searchParams changing, e.g. filter
  // selection) correctly leave scroll position alone since pathname itself
  // doesn't change for those. The double rAF guards against a layout shift
  // (e.g. an image finishing layout) undoing the first scroll.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    if (previousPathname === pathname) return;

    let secondFrameId: number | null = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });

      secondFrameId = window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId != null) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [pathname]);

  useEffect(() => {
    const previousAdminPathname = adminPanelPathnameRef.current;
    adminPanelPathnameRef.current = pathname;
    if (previousAdminPathname === pathname) return;
    if (!isAdminPanelOpen || isAdminPanelPinned) return;
    setIsAdminPanelOpen(false);
  }, [isAdminPanelOpen, isAdminPanelPinned, pathname]);

  useEffect(() => {
    if (!isAdminPanelOpen || AdminChatPanelComponent) return;

    let cancelled = false;

    void import("./AdminChatPanel")
      .then((module) => {
        if (!cancelled) {
          setAdminChatPanelComponent(() => module.default);
        }
      })
      .catch((error) => {
        console.error("Failed to load admin chat panel chunk:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [AdminChatPanelComponent, isAdminPanelOpen]);

  useEffect(() => {
    if (!isChatOpen || TelegramChatComponent) return;

    let cancelled = false;

    void import("./TelegramChat")
      .then((module) => {
        if (!cancelled) {
          setTelegramChatComponent(() => module.default);
        }
      })
      .catch((error) => {
        console.error("Failed to load telegram chat chunk:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [TelegramChatComponent, isChatOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const body = document.body;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const overlaySelector = ".soft-modal-shell, .app-overlay-panel";

    if (!mediaQuery.matches && !isChatOpen && !isAdminPanelOpen) {
      return;
    }

    const previousStyles = {
      htmlOverflow: root.style.overflow,
      htmlOverscroll: root.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };

    let isLocked = false;

    const getOverlayRoot = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      return target.closest(overlaySelector);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!getOverlayRoot(event.target)) {
        event.preventDefault();
      }
    };

    const restoreBodyScroll = () => {
      if (!isLocked) return;

      root.style.overflow = previousStyles.htmlOverflow;
      root.style.overscrollBehavior = previousStyles.htmlOverscroll;
      body.style.overflow = previousStyles.bodyOverflow;
      body.style.overscrollBehavior = previousStyles.bodyOverscroll;
      // Only ever attached while actually locked (see lockBodyScroll) — a
      // non-passive touchmove listener disables the browser's scroll
      // fast-path for every touch gesture on the page while it's registered,
      // not just ones inside the locked overlay. Previously this stayed
      // attached for the component's whole lifetime on any mobile viewport,
      // degrading touch-scroll smoothness on every page even with no modal
      // open at all.
      document.removeEventListener("touchmove", handleTouchMove);
      isLocked = false;
    };

    const lockBodyScroll = () => {
      if (isLocked) return;

      root.style.overflow = "hidden";
      root.style.overscrollBehavior = "none";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
      document.addEventListener("touchmove", handleTouchMove, { passive: false });
      isLocked = true;
    };

    const syncOverlayScrollLock = () => {
      const hasModalOverlay =
        Boolean(document.querySelector(overlaySelector)) ||
        isChatOpen ||
        isAdminPanelOpen;

      if (mediaQuery.matches && hasModalOverlay) {
        lockBodyScroll();
        return;
      }

      restoreBodyScroll();
    };

    // Coalesce into at most one check per animation frame. Only DOM additions
    // and removals can mount/unmount an overlay. Observing class/style changes
    // here also watched every virtualized catalog row and every image fade,
    // scheduling full-document querySelector calls during active scrolling.
    let syncRaf = 0;
    const scheduleSync = () => {
      if (syncRaf) return;
      syncRaf = window.requestAnimationFrame(() => {
        syncRaf = 0;
        syncOverlayScrollLock();
      });
    };

    const observer = new MutationObserver(() => {
      scheduleSync();
    });

    observer.observe(body, {
      childList: true,
      subtree: true,
    });

    const handleViewportChange = () => {
      syncOverlayScrollLock();
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleViewportChange);
    } else {
      mediaQuery.addListener(handleViewportChange);
    }

    window.addEventListener("resize", handleViewportChange);
    syncOverlayScrollLock();

    return () => {
      observer.disconnect();
      if (syncRaf) window.cancelAnimationFrame(syncRaf);
      window.removeEventListener("resize", handleViewportChange);
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleViewportChange);
      } else {
        mediaQuery.removeListener(handleViewportChange);
      }
      restoreBodyScroll();
    };
  }, [isAdminPanelOpen, isChatOpen]);

  // Route prefetching is cheap (Next.js dedupes/caches it) and pays off on
  // every visit, unlike the heavier warmup below (chunk preloads, catalog
  // fetches) which is intentionally opt-in. Kept independent of
  // enableAggressiveWarmup so real visitors — who never set that env flag —
  // still get it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (primaryRoutePrefetchStartedRef.current) return;
    primaryRoutePrefetchStartedRef.current = true;

    let idleId: number | null = null;
    let didWarmRoutes = false;
    const delayId = window.setTimeout(() => {
      const warmRoutes = () => {
        didWarmRoutes = true;
        const routeLimit = shouldUseLightNetworkWarmup() ? 3 : 5;
        PRIMARY_WARMUP_ROUTES
          .filter((route) => route !== pathname)
          .slice(0, routeLimit)
          .forEach((route) => router.prefetch(route));
      };

      // Homepage prefetch used to be skipped completely, leaving its most
      // common first navigation cold. Start it only after initial content has
      // settled, so it improves the next click without competing with LCP.
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(warmRoutes, { timeout: 4000 });
      } else {
        warmRoutes();
      }
    }, pathname === "/" ? 1800 : 350);

    return () => {
      window.clearTimeout(delayId);
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (!didWarmRoutes) {
        primaryRoutePrefetchStartedRef.current = false;
      }
    };
  }, [pathname, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (warmupStartedRef.current) return;
    warmupStartedRef.current = true;

    // The homepage already loads its interactive sections as they approach
    // the viewport. Global route/chunk warmup here used to compete with the
    // hero, fonts and category data during the first load.
    if (pathname === "/" || !enableAggressiveWarmup) return;

    const shouldUseLightWarmup = shouldUseLightNetworkWarmup();
    const hasFreshGetProdCache = () => {
      try {
        const raw = window.sessionStorage.getItem(CATALOG_PRODUCTS_CACHE_KEY);
        if (!raw) return false;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length > 0;
        if (!parsed || typeof parsed !== "object") return false;
        const record = parsed as { t?: unknown; v?: unknown };
        if (
          typeof record.t === "number" &&
          Date.now() - record.t > CATALOG_PRODUCTS_CACHE_TTL_MS
        ) {
          window.sessionStorage.removeItem(CATALOG_PRODUCTS_CACHE_KEY);
          return false;
        }
        return record.v != null;
      } catch {
        return false;
      }
    };

    const preloadCriticalChunks = () => {
      try {
        void import("./Data");
      } catch {}
      try {
        void import("./filtrtion");
      } catch {}
      // AuthModal/Contact only start downloading once their button is tapped
      // (see the `modals.auth`/`modals.contact` effects below) — on mobile
      // that cold import is the visible lag between tap and modal appearing.
      // These buttons are always visible in the header, so warm them
      // unconditionally rather than behind the aggressive-warmup flag, which
      // defaults off and never fires for real visitors.
      try {
        void import("./AuthModal");
      } catch {}
      try {
        void import("./Contact");
      } catch {}
    };

    const preloadAllChunks = () => {
      preloadCriticalChunks();
      try {
        void import("./Order");
      } catch {}
      try {
        void import("./tovar");
      } catch {}
    };

    let routesWarmed = false;
    const warmRoutes = async () => {
      if (routesWarmed) return;
      routesWarmed = true;

      const warm = async (path: string) => {
        let timer: number | undefined;
        try {
          await Promise.race([
            fetch(path),
            new Promise<void>((resolve) => {
              timer = window.setTimeout(resolve, 30000);
            }),
          ]);
        } catch {
        } finally {
          if (timer != null) window.clearTimeout(timer);
        }
      };

      await warm("/inform/about");
      void warm("/katalog");
    };

    type RequestIdleCallback = (cb: () => void, opts?: { timeout: number }) => number;
    const idle = (window as Window & { requestIdleCallback?: RequestIdleCallback })
      .requestIdleCallback;

    const runWarmup = async () => {
      if (document.visibilityState === "hidden") return;

      preloadCriticalChunks();

      if (enableAggressiveWarmup) {
        preloadAllChunks();
        void warmRoutes();
        if (!isDevelopment) {
          try {
            void fetch("/api/preload").catch(() => {});
          } catch {}
        }
      }

      try {
        const shouldSkipGetProdWarmup =
          !hasFreshGetProdCache() && window.location?.pathname === "/";

        if (
          enableAggressiveWarmup &&
          !shouldSkipGetProdWarmup &&
          !hasFreshGetProdCache()
        ) {
          const res = await fetch("/api/proxy?endpoint=getprod", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });

          if (res.ok) {
            const raw = await res.json();
            try {
              window.sessionStorage.setItem(
                CATALOG_PRODUCTS_CACHE_KEY,
                JSON.stringify({ t: Date.now(), v: raw })
              );
            } catch {}
            try {
              window.localStorage.setItem(
                CATALOG_PRODUCTS_CACHE_KEY,
                JSON.stringify({ t: Date.now(), v: raw })
              );
            } catch {}
          }
        }
      } catch {}

      try {
        let selectedCars: string[] = [];
        try {
          const raw = window.localStorage.getItem("partson:selectedCars");
          const parsed = raw ? JSON.parse(raw) : null;
          if (Array.isArray(parsed)) {
            selectedCars = parsed
              .filter((c) => typeof c === "string")
              .map((c: string) => c.trim())
              .filter(Boolean)
              .sort();
          }
        } catch {}

        const body: Record<string, unknown> = {
          page: 1,
          limit: 12,
          selectedCars,
          selectedCategories: [],
          searchQuery: "",
          searchFilter: "all",
          group: "",
          subcategory: "",
          producer: "",
          sortOrder: "none",
        };

        const cacheKey = JSON.stringify({
          endpoint: CATALOG_PAGE_CACHE_VERSION,
          page: 1,
          limit: 12,
          cursor: "",
          cursorField: "",
          q: "",
          filter: "all",
          cars: selectedCars,
          cats: [],
          group: null,
          subcat: null,
          producer: null,
          hierarchy: false,
          sort: "none",
          pricedOnly: false,
          priceFrom: null,
          priceTo: null,
          inStock: false,
        });

        try {
          if (window.sessionStorage.getItem(cacheKey)) return;
        } catch {}

        const res = await fetch("/api/catalog-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) return;
        const result = await res.json();
        const items = Array.isArray(result?.items) ? result.items : [];

        try {
          const now = Date.now();
          window.sessionStorage.setItem(
            cacheKey,
            JSON.stringify({ ...result, t: now, expiresAt: now + 1000 * 60 * 4 })
          );
        } catch {}

        if (items.length === 0) return;

        const warmPriceCodes = Array.from(
          new Set(
            items
              .map((item: Record<string, unknown>) => {
                const article = item?.["НомерПоКаталогу"] ?? item?.article;
                const code = item?.["НоменклатураКод"] ?? item?.code;
                return typeof article === "string" ? article : code;
              })
              .map((code: unknown) => (typeof code === "string" ? code.trim() : ""))
              .filter(Boolean)
          )
        ).slice(0, 8);

        const priceWarmupLimit = enableAggressiveWarmup ? 8 : 4;
        warmPriceCodes.slice(0, priceWarmupLimit).forEach((code) => {
          void fetch("/api/proxy?endpoint=prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Код: code }),
          }).catch(() => {});
        });
      } catch {}
    };

    let timerId: number | null = null;
    let idleId: number | null = null;
    let initialWarmupFrameId: number | null = null;
    let warmRoutesTimer: number | null = null;
    let preloadAllTimer: number | null = null;
    let loadListener: (() => void) | null = null;

    if (!shouldUseLightWarmup) {
      initialWarmupFrameId = window.requestAnimationFrame(() => {
        preloadCriticalChunks();
        if (enableAggressiveWarmup) {
          warmRoutesTimer = window.setTimeout(() => void warmRoutes(), 1800);
        }
      });
    }

    const scheduleWarmup = () => {
      if (shouldUseLightWarmup) return;

      if (enableAggressiveWarmup) {
        preloadAllTimer = window.setTimeout(preloadAllChunks, 4200);
      }

      if (typeof idle === "function") {
        idleId = idle(() => void runWarmup(), { timeout: 5200 });
      } else {
        timerId = window.setTimeout(() => void runWarmup(), 2500);
      }
    };

    if (document.readyState === "complete") {
      scheduleWarmup();
    } else {
      const handleLoad = () => scheduleWarmup();
      window.addEventListener("load", handleLoad, { once: true });
      loadListener = handleLoad;
    }

    return () => {
      if (loadListener) {
        window.removeEventListener("load", loadListener);
      }
      if (initialWarmupFrameId != null) window.cancelAnimationFrame(initialWarmupFrameId);
      if (warmRoutesTimer != null) window.clearTimeout(warmRoutesTimer);
      if (preloadAllTimer != null) window.clearTimeout(preloadAllTimer);
      if (timerId != null) window.clearTimeout(timerId);
      if (idleId != null && "cancelIdleCallback" in window) {
        (
          window as Window & { cancelIdleCallback?: (id: number) => void }
        ).cancelIdleCallback?.(idleId);
      }
    };
  }, [enableAggressiveWarmup, isDevelopment, pathname, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!firebaseDeps) return;

    const { auth, db, doc, getDoc, onAuthStateChanged, setDoc } = firebaseDeps;

    const currentUser = auth.currentUser;
    if (currentUser) {
      setAuthUserUid(currentUser.uid);
      // Optimistic instant paint for a returning admin on the same device;
      // the authoritative check (custom claims / Firestore role / the
      // server-side email allowlist) still runs below via onAuthStateChanged.
      if (readRememberedAdminAccess(currentUser.uid)) {
        setIsAdmin(true);
      }
    }

    const storedChatId = normalizeStoredId(localStorage.getItem("chat_user_id"));

    if (storedChatId) {
      setUserId(storedChatId);
      setLoading(false);
    } else {
      const generatedId = createGuestChatId();
      localStorage.setItem("chat_user_id", generatedId);
      setUserId(generatedId);
      setLoading(false);
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAdminCheckReady(false);
        setAuthUserUid(user.uid);
        if (readRememberedAdminAccess(user.uid)) {
          setIsAdmin(true);
        }
        const userRef = doc(db, "users", user.uid);
        let userData: Record<string, unknown> | undefined;

        try {
          const userSnap = await getDoc(userRef);
          userData = userSnap.exists()
            ? (userSnap.data() as Record<string, unknown>)
            : undefined;
        } catch (error) {
          if (!isPermissionDeniedError(error)) {
            console.error("Failed to load user profile for role detection:", error);
          }
          userData = undefined;
        }

        let claims: Record<string, unknown> = {};
        let idToken = "";
        try {
          const token = await user.getIdTokenResult(true);
          claims = (token?.claims ?? {}) as Record<string, unknown>;
          idToken = token?.token ?? "";
        } catch {
          claims = {};
        }

        const isAdminRole =
          hasAdminAccess(userData) ||
          hasAdminAccess(claims) ||
          (claims.permissions &&
          typeof claims.permissions === "object"
            ? hasAdminAccess(claims.permissions as Record<string, unknown>)
            : false) ||
          hasAdminRole(claims.permissions);

        const isAdminEmail = idToken ? await checkIsAdminOnServer(idToken) : false;
        isAdminEmailRef.current = isAdminEmail;

        const lastAuthenticatedUid = normalizeStoredId(
          localStorage.getItem("user_id")
        );
        const storedChatId = normalizeStoredId(
          localStorage.getItem("chat_user_id")
        );
        const persistedChatId = readUserChatId(userData);

        const resolvedChatId =
          lastAuthenticatedUid === user.uid
            ? storedChatId || persistedChatId || user.uid
            : persistedChatId || user.uid;

        const adminStorageKey = getAdminStorageKey(user.uid);
        const resolvedIsAdmin = isAdminRole || isAdminEmail;

        setIsAdmin(resolvedIsAdmin);
        setAdminCheckReady(true);

        if (resolvedIsAdmin) {
          localStorage.setItem(adminStorageKey, "1");
        } else {
          localStorage.removeItem(adminStorageKey);
        }

        window.dispatchEvent(
          new CustomEvent("partson:adminStateChange", {
            detail: { isAdmin: resolvedIsAdmin, uid: user.uid },
          })
        );
        window.dispatchEvent(
          new CustomEvent("partson:authStateChange", {
            detail: { uid: user.uid },
          })
        );

        localStorage.setItem("user_id", user.uid);

        if (storedChatId !== resolvedChatId) {
          localStorage.setItem("chat_user_id", resolvedChatId);
        }

        if (normalizeStoredId(userData?.chatUserId) !== resolvedChatId) {
          try {
            await setDoc(userRef, { chatUserId: resolvedChatId }, { merge: true });
          } catch (error) {
            console.error("Failed to sync user chat id:", error);
          }
        }

        setUserId(resolvedChatId);
      } else {
        setAuthUserUid(null);
        setIsAdmin(false);
        setAdminCheckReady(false);
        isAdminEmailRef.current = false;
        try { localStorage.removeItem("user_id"); } catch {}
        window.dispatchEvent(
          new CustomEvent("partson:adminStateChange", {
            detail: { isAdmin: false, uid: null },
          })
        );
        window.dispatchEvent(
          new CustomEvent("partson:authStateChange", {
            detail: { uid: null },
          })
        );
        const fallbackId =
          typeof window !== "undefined"
            ? normalizeStoredId(localStorage.getItem("chat_user_id"))
            : null;
        setUserId(fallbackId);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [firebaseDeps]);

  // Promoting/demoting a user's role from the admin panel writes straight to
  // their users/{uid} Firestore doc. Without a live listener, the affected
  // browser only re-checks admin access on its next login or Firebase's
  // ~1hr ID token refresh — this makes a role change take effect immediately.
  useEffect(() => {
    if (!firebaseDeps || !authUserUid || !adminCheckReady) return;

    const { db, doc, onSnapshot } = firebaseDeps;
    const userRef = doc(db, "users", authUserUid);

    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (!snap.exists()) return;
      const isAdminRole = hasAdminAccess(snap.data() as Record<string, unknown>);
      const resolvedIsAdmin = isAdminRole || isAdminEmailRef.current;

      setIsAdmin((prev) => (prev === resolvedIsAdmin ? prev : resolvedIsAdmin));

      const adminStorageKey = getAdminStorageKey(authUserUid);
      try {
        if (resolvedIsAdmin) {
          localStorage.setItem(adminStorageKey, "1");
        } else {
          localStorage.removeItem(adminStorageKey);
        }
      } catch {}

      window.dispatchEvent(
        new CustomEvent("partson:adminStateChange", {
          detail: { isAdmin: resolvedIsAdmin, uid: authUserUid },
        })
      );
    });

    return () => unsubscribe();
  }, [firebaseDeps, authUserUid, adminCheckReady]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    if (!firebaseDeps) return;

    const { db, doc, setDoc } = firebaseDeps;
    const presenceRef = doc(db, "chatPresence", userId);
    let presenceSyncAllowed = true;

    const syncPresence = async (isOnline: boolean) => {
      if (!presenceSyncAllowed) return;
      try {
        await setDoc(
          presenceRef,
          {
            userIsOnline: isOnline,
            userLastSeenAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          presenceSyncAllowed = false;
          return;
        }
        console.error("Failed to sync chat presence:", error);
      }
    };

    const markVisible = () => {
      void syncPresence(document.visibilityState === "visible");
    };

    const markHidden = () => {
      void syncPresence(false);
    };

    void syncPresence(document.visibilityState === "visible");

    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncPresence(true);
      }
    }, 30000);

    document.addEventListener("visibilitychange", markVisible);
    window.addEventListener("focus", markVisible);
    window.addEventListener("blur", markHidden);
    window.addEventListener("pagehide", markHidden);

    return () => {
      window.clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", markVisible);
      window.removeEventListener("focus", markVisible);
      window.removeEventListener("blur", markHidden);
      window.removeEventListener("pagehide", markHidden);
      void syncPresence(false);
    };
  }, [firebaseDeps, userId]);

  useEffect(() => {
    if (!authUserUid || typeof window === "undefined") return;
    if (!firebaseDeps) return;

    const { db, doc, setDoc } = firebaseDeps;
    const userRef = doc(db, "users", authUserUid);
    let presenceSyncAllowed = true;

    const syncPresence = async (isOnline: boolean) => {
      if (!presenceSyncAllowed) return;
      try {
        await setDoc(
          userRef,
          {
            isOnline,
            lastSeenAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          presenceSyncAllowed = false;
          return;
        }
        console.error("Failed to sync user presence:", error);
      }
    };

    const markVisible = () => {
      void syncPresence(document.visibilityState === "visible");
    };

    const markHidden = () => {
      void syncPresence(false);
    };

    void syncPresence(document.visibilityState === "visible");

    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncPresence(true);
      }
    }, 30000);

    document.addEventListener("visibilitychange", markVisible);
    window.addEventListener("focus", markVisible);
    window.addEventListener("blur", markHidden);
    window.addEventListener("pagehide", markHidden);

    return () => {
      window.clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", markVisible);
      window.removeEventListener("focus", markVisible);
      window.removeEventListener("blur", markHidden);
      window.removeEventListener("pagehide", markHidden);
      void syncPresence(false);
    };
  }, [authUserUid, firebaseDeps]);

  useEffect(() => {
    if (loading || !userId) return;
    if (!firebaseDeps) return;

    const { collection, db, onSnapshot, query, where } = firebaseDeps;
    const q = query(collection(db, "messages"), where("userId", "==", userId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const unreadMessages = snapshot.docs.filter((messageDoc) => {
        const data = messageDoc.data();
        if (data.sender !== "manager") return false;
        return data.textRead === false || data.textRead === undefined;
      });

      setUserUnreadCount(unreadMessages.length);
    });

    return () => unsubscribe();
  }, [firebaseDeps, userId, loading]);

  useEffect(() => {
    if (!isAdmin) {
      setTotalNotifications(0);
      return;
    }
    if (!firebaseDeps) return;

    const { collection, db, onSnapshot } = firebaseDeps;

    let unreadMessages = 0;
    let unreadOrders = 0;
    let unreadCalls = 0;

    const syncTotal = () => {
      setTotalNotifications(unreadMessages + unreadOrders + unreadCalls);
    };

    const unsubscribeMessages = onSnapshot(collection(db, "messages"), (snapshot) => {
      unreadMessages = snapshot.docs.reduce((count, snapshotDoc) => {
        const data = snapshotDoc.data() as Record<string, unknown>;
        if (data?.sender !== "user") return count;
        return data?.readByAdmin === true ? count : count + 1;
      }, 0);
      syncTotal();
    });

    const unsubscribeOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      unreadOrders = snapshot.docs.reduce((count, snapshotDoc) => {
        const data = snapshotDoc.data() as Record<string, unknown>;
        return data?.read === true ? count : count + 1;
      }, 0);
      syncTotal();
    });

    const unsubscribeCalls = onSnapshot(collection(db, "zvyaz"), (snapshot) => {
      unreadCalls = snapshot.docs.reduce((count, snapshotDoc) => {
        const data = snapshotDoc.data() as Record<string, unknown>;
        return data?.read === true ? count : count + 1;
      }, 0);
      syncTotal();
    });

    return () => {
      unsubscribeMessages();
      unsubscribeOrders();
      unsubscribeCalls();
    };
  }, [firebaseDeps, isAdmin]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOpenChat = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.trim()) {
        setPrefillMessage(detail);
      }
      openChat();
    };

    window.addEventListener("openChatWithMessage", handleOpenChat as EventListener);

    return () => {
      window.removeEventListener("openChatWithMessage", handleOpenChat as EventListener);
    };
  }, [openChat]);

  const renderBadge = (count: number) => {
    if (count <= 0) return null;
    const displayCount = count > 99 ? "99+" : count;

    return (
      <span className="absolute -top-1 -right-1 flex min-w-[24px] items-center justify-center rounded-full border-2 border-white bg-red-600 px-1.5 text-xs font-bold text-white h-6">
        {displayCount}
      </span>
    );
  };

  return (
    <div style={{ ["--header-height" as string]: "4rem" }}>
      <span
        ref={scrollTopSentinelRef}
        className="pointer-events-none absolute left-0 top-0 h-px w-px"
        aria-hidden="true"
      />
      <Suspense fallback={null}>
        <RouteViewStateSync pathname={pathname} onChange={syncRouteViewState} />
      </Suspense>

      <NavigationProgress />

      {!isEmbeddedProductView && (
        <div className="fixed top-0 left-0 right-0 z-50 h-[var(--header-height,4rem)] bg-slate-800">
          <Header />
        </div>
      )}

      <main
        className={
          isEmbeddedProductView ? "min-h-screen" : "min-h-screen pt-header-offset"
        }
      >
        <div className={pathname === "/" ? undefined : "route-transition-shell"}>
          {children}
        </div>
      </main>

      {!isEmbeddedProductView && (
        <div className="site-floating-actions fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-50 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6 sm:gap-4 lg:right-7">
          <div className="flex items-end gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="Вгору"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className={[
                "group relative isolate z-20 flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] sm:h-[60px] sm:w-[60px] sm:rounded-[20px]",
                "border transition-[box-shadow,border-color,transform,opacity] duration-300 ease-out",
                "hover:scale-[1.018] active:scale-[0.97]",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/45",
                "border-cyan-100/25 shadow-[0_16px_38px_rgba(8,47,73,0.22)] hover:border-cyan-100/45 hover:shadow-[0_22px_46px_rgba(14,116,144,0.28)]",
                showScrollTop
                  ? "opacity-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 translate-y-3 pointer-events-none",
              ].join(" ")}
            >
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,#0f172a,#0369a1_52%,#14b8a6)]" />
              <span className="pointer-events-none absolute inset-x-2 top-1 h-5 rounded-full bg-gradient-to-b from-white/22 to-transparent" />
              <span className="relative z-10 flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-[1.08]">
                <ChevronUp
                  className="text-white drop-shadow-[0_8px_18px_rgba(15,23,42,0.32)]"
                  size={30}
                  strokeWidth={2.4}
                  aria-hidden="true"
                />
              </span>
            </button>

            <div className="flex flex-col items-center gap-2 sm:gap-3">
              {isAdmin && !isAdminPanelOpen && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    aria-label="Додати товар"
                    title="Додати товар"
                    className="group relative isolate z-20 flex h-11 w-11 items-center justify-center overflow-hidden rounded-[15px] border border-violet-200/40 bg-[linear-gradient(145deg,#581c87,#7c3aed_55%,#a855f7)] text-white shadow-[0_12px_26px_rgba(124,58,237,0.30)] transition-[transform,border-color,box-shadow,filter] duration-200 hover:border-violet-100/75 hover:brightness-110 hover:shadow-[0_17px_34px_rgba(124,58,237,0.40)] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/45 sm:h-12 sm:w-12 sm:rounded-[16px]"
                  >
                    <span className="pointer-events-none absolute inset-x-2 top-1 h-4 rounded-full bg-gradient-to-b from-white/25 to-transparent" />
                    <Plus size={23} strokeWidth={2.6} className="relative transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdminPanelOpen(true)}
                    aria-label="Відкрити адмін-панель"
                    title="Адмін-панель"
                    className="group relative isolate z-20 flex h-14 w-14 items-center justify-center overflow-visible rounded-[18px] border border-indigo-200/35 bg-[linear-gradient(145deg,#312e81,#4f46e5_55%,#0ea5e9)] text-white shadow-[0_14px_30px_rgba(67,56,202,0.28)] transition-[transform,border-color,box-shadow,filter] duration-200 hover:border-indigo-100/70 hover:brightness-110 hover:shadow-[0_20px_38px_rgba(67,56,202,0.38)] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/45 sm:h-[60px] sm:w-[60px] sm:rounded-[20px]"
                  >
                    <span className="pointer-events-none absolute inset-x-2 top-1 h-5 rounded-full bg-gradient-to-b from-white/22 to-transparent" />
                    <Shield size={25} strokeWidth={2.2} className="relative transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                    {renderBadge(totalNotifications)}
                  </button>
                </>
              )}

              {!isChatOpen && ChatButtonComponent ? (
                <ChatButtonComponent onClick={openChat} unreadCount={userUnreadCount} />
              ) : !isChatOpen ? (
                <button
                  type="button"
                  onClick={openChat}
                  aria-label="Відкрити чат"
                  className="relative z-20 inline-flex h-14 w-14 items-center justify-center rounded-[18px] border border-sky-200/30 bg-[linear-gradient(145deg,#0f172a,#1d4ed8_52%,#0ea5e9)] text-white shadow-[0_14px_30px_rgba(14,116,144,0.28)] transition-[filter,box-shadow,transform] duration-200 ease-out hover:brightness-110 hover:shadow-[0_20px_38px_rgba(14,116,144,0.38)] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/45 sm:h-[60px] sm:w-[60px] sm:rounded-[20px]"
                >
                  <MessageCircle size={27} strokeWidth={2.2} aria-hidden="true" />
                  {renderBadge(userUnreadCount)}
                </button>
              ) : null}
            </div>
          </div>

          {isAdmin && AdminChatPanelComponent && (
            <AdminChatPanelComponent
              isOpen={isAdminPanelOpen}
              isPinned={isAdminPanelPinned}
              onClose={() => setIsAdminPanelOpen(false)}
              onPinnedChange={setIsAdminPanelPinned}
              onNotificationCountChange={(count) => setTotalNotifications(count)}
            />
          )}
        </div>
      )}

      {!isEmbeddedProductView && isChatOpen && TelegramChatComponent && (
        <TelegramChatComponent
          isOpen={isChatOpen}
          onClose={closeChat}
          prefillMessage={prefillMessage}
          onPrefillSent={() => setPrefillMessage(null)}
        />
      )}

      {isAdmin && (
        <ProductCreateModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
        />
      )}

    </div>
  );
}
