'use client';

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "../../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import Header from "./Header";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Shield } from "lucide-react";

const AdminChatPanel = dynamic(() => import("./AdminChatPanel"), { ssr: false });
const TelegramChat = dynamic(() => import("./TelegramChat"), { ssr: false });
const ChatButton = dynamic(() => import("./ChatButton"), { ssr: false });

interface LayoutHostProps {
  children: ReactNode;
}

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

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const ADMIN_EMAIL_VALUES = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean)
);

const normalizeAdminValue = (value: unknown) =>
  typeof value === "string" ? normalizeAdminToken(value) : "";

const hasAdminEmail = (value: unknown) => {
  const normalized = normalizeEmail(value);
  return normalized ? ADMIN_EMAIL_VALUES.has(normalized) : false;
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
) => {
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
  "/katalog",
  "/katalog?tab=auto",
  "/katalog?tab=category",
  "/inform/about",
  "/inform/delivery",
  "/inform/payment",
  "/inform/location",
  "/groups",
  "/manufacturers",
] as const;

export default function LayoutHost({ children }: LayoutHostProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userUnreadCount, setUserUnreadCount] = useState(0);
  const [totalNotifications, setTotalNotifications] = useState(0);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const warmupStartedRef = useRef(false);
  const auth = getAuth();
  const isDevelopment = process.env.NODE_ENV !== "production";
  const isEmbeddedProductView =
    pathname.startsWith("/product/") && searchParams.get("view") === "modal";
  const routeTransitionKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname === "/") {
      const frameId = window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });

      return () => window.cancelAnimationFrame(frameId);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const body = document.body;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const overlaySelector = ".soft-modal-shell, .app-overlay-panel";

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

    const restoreBodyScroll = () => {
      if (!isLocked) return;

      root.style.overflow = previousStyles.htmlOverflow;
      root.style.overscrollBehavior = previousStyles.htmlOverscroll;
      body.style.overflow = previousStyles.bodyOverflow;
      body.style.overscrollBehavior = previousStyles.bodyOverscroll;
      isLocked = false;
    };

    const lockBodyScroll = () => {
      if (isLocked) return;

      root.style.overflow = "hidden";
      root.style.overscrollBehavior = "none";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
      isLocked = true;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isLocked || !mediaQuery.matches) return;

      if (!getOverlayRoot(event.target)) {
        event.preventDefault();
      }
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

    const observer = new MutationObserver(() => {
      syncOverlayScrollLock();
    });

    observer.observe(body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
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
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    syncOverlayScrollLock();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleViewportChange);
      document.removeEventListener("touchmove", handleTouchMove);
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleViewportChange);
      } else {
        mediaQuery.removeListener(handleViewportChange);
      }
      restoreBodyScroll();
    };
  }, [isAdminPanelOpen, isChatOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isDevelopment) return;
    if (warmupStartedRef.current) return;
    warmupStartedRef.current = true;

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const isSlowConnection =
      Boolean(connection?.saveData) ||
      (typeof connection?.effectiveType === "string" &&
        connection.effectiveType.includes("2g"));
    const isHome = window.location?.pathname === "/";

    const GETPROD_CACHE_KEY = "partson:getprod";
    const GETPROD_TTL_MS = 1000 * 60 * 30;

    const hasFreshGetProdCache = () => {
      try {
        const raw = window.sessionStorage.getItem(GETPROD_CACHE_KEY);
        if (!raw) return false;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length > 0;
        if (!parsed || typeof parsed !== "object") return false;
        const record = parsed as { t?: unknown; v?: unknown };
        if (typeof record.t === "number" && Date.now() - record.t > GETPROD_TTL_MS) {
          window.sessionStorage.removeItem(GETPROD_CACHE_KEY);
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
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 30000);
        try {
          await fetch(path, { cache: "no-store", signal: controller.signal });
        } catch {
          // ignore
        } finally {
          window.clearTimeout(timer);
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
      preloadAllChunks();
      void warmRoutes();
      try {
        void fetch("/api/preload", { cache: "no-store" }).catch(() => {});
      } catch {}

      try {
        const shouldSkipGetProdWarmup =
          !hasFreshGetProdCache() && window.location?.pathname === "/";

        if (!shouldSkipGetProdWarmup && !hasFreshGetProdCache()) {
          const res = await fetch("/api/proxy?endpoint=getprod", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });

          if (res.ok) {
            const raw = await res.json();
            try {
              window.sessionStorage.setItem(
                "partson:getprod",
                JSON.stringify({ t: Date.now(), v: raw })
              );
            } catch {}
            try {
              window.localStorage.setItem(
                "partson:getprod",
                JSON.stringify({ t: Date.now(), v: raw })
              );
            } catch {}
          }
        }
      } catch {}

      if (isHome) return;
      try {
        let selectedCars: string[] = [];
        try {
          const raw = window.localStorage.getItem("partson:selectedCars");
          const parsed = raw ? JSON.parse(raw) : null;
          if (Array.isArray(parsed)) {
            selectedCars = parsed.filter((c) => typeof c === "string");
          }
        } catch {}

        const body: Record<string, unknown> = {
          selectedCars,
          selectedCategories: [],
        };
        body["\u041d\u043e\u043c\u0435\u0440\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u044b"] = 1;

        const cacheKey = JSON.stringify({
          endpoint: "getdata",
          page: 1,
          q: "",
          filter: "all",
          cars: selectedCars,
          cats: [],
          group: null,
          subcat: null,
        });

        try {
          if (window.sessionStorage.getItem(cacheKey)) return;
        } catch {}

        const res = await fetch("/api/proxy?endpoint=getdata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) return;
        const result = await res.json();

        try {
          window.sessionStorage.setItem(cacheKey, JSON.stringify(result));
        } catch {}

        if (!Array.isArray(result)) return;
        const warmPriceCodes = Array.from(
          new Set(
            result
              .map((item: Record<string, unknown>) => {
                const article =
                  item?.["\u041d\u043e\u043c\u0435\u0440\u041f\u043e\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0443"];
                const code =
                  item?.["\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430\u041a\u043e\u0434"];
                return typeof article === "string" ? article : code;
              })
              .map((code: unknown) => (typeof code === "string" ? code.trim() : ""))
              .filter(Boolean)
          )
        ).slice(0, 8);

        warmPriceCodes.forEach((code) => {
          void fetch("/api/proxy?endpoint=prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ РљРѕРґ: code }),
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

    if (!isSlowConnection) {
      initialWarmupFrameId = window.requestAnimationFrame(() => {
        PRIMARY_WARMUP_ROUTES.forEach((route) => router.prefetch(route));
        preloadCriticalChunks();
        warmRoutesTimer = window.setTimeout(() => void warmRoutes(), 160);
      });
    }

    const scheduleWarmup = () => {
      if (isSlowConnection) return;

      preloadAllTimer = window.setTimeout(preloadAllChunks, 2500);

      if (typeof idle === "function") {
        idleId = idle(() => void runWarmup(), { timeout: 2000 });
      } else {
        timerId = window.setTimeout(() => void runWarmup(), 1500);
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
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          idleId
        );
      }
    };
  }, [isDevelopment, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

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
        setAuthUserUid(user.uid);
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
        try {
          const token = await user.getIdTokenResult(true);
          claims = (token?.claims ?? {}) as Record<string, unknown>;
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
        const isAdminEmail =
          hasAdminEmail(user.email) ||
          hasAdminEmail(userData?.email) ||
          hasAdminEmail(claims.email);
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

        const adminStorageKey = `partson:isAdmin:${user.uid}`;
        const rememberedIsAdmin = localStorage.getItem(adminStorageKey) === "1";
        const resolvedIsAdmin = isAdminRole || isAdminEmail || rememberedIsAdmin;
        setIsAdmin(resolvedIsAdmin);
        if (isAdminRole || isAdminEmail) {
          localStorage.setItem(adminStorageKey, "1");
        }
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
        const fallbackId =
          typeof window !== "undefined"
            ? normalizeStoredId(localStorage.getItem("chat_user_id"))
            : null;
        setUserId(fallbackId);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    if (!authUserUid || typeof window === "undefined") return;

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
  }, [authUserUid]);

  useEffect(() => {
    if (loading || !userId) return;

    const q = query(
      collection(db, "messages"),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const unreadMessages = snapshot.docs.filter((doc) => {
        const data = doc.data();
        if (data.sender !== "manager") return false;
        return data.textRead === false || data.textRead === undefined;
      });

      setUserUnreadCount(unreadMessages.length);
    });

    return () => unsubscribe();
  }, [userId, loading]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOpenChat = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.trim()) {
        setPrefillMessage(detail);
      }
      setIsChatOpen(true);
    };

    window.addEventListener("openChatWithMessage", handleOpenChat as EventListener);
    return () => {
      window.removeEventListener("openChatWithMessage", handleOpenChat as EventListener);
    };
  }, []);

  const renderBadge = (count: number) => {
    if (count <= 0) return null;
    const displayCount = count > 99 ? "99+" : count;

    return (
      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[24px] h-6 bg-red-600 text-white text-xs font-bold rounded-full px-1.5 border-2 border-white">
        {displayCount}
      </span>
    );
  };

  return (
    <div style={{ ['--header-height' as string]: '4rem' }}>
      {!isEmbeddedProductView && (
        <div className="fixed top-0 left-0 right-0 z-50 h-16">
          <Header setIsChatOpen={setIsChatOpen} />
        </div>
      )}

      <main className={isEmbeddedProductView ? "min-h-screen" : "min-h-screen pt-[var(--header-height)]"}>
        <div key={routeTransitionKey} className="route-transition-shell">
          {children}
        </div>
      </main>

      {!isEmbeddedProductView && (
        <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-50 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6 sm:gap-4 lg:right-7">
          {!loading && isAdmin && !isAdminPanelOpen && (
            <button
              onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)}
              className="relative z-[60] inline-flex h-[56px] w-[56px] items-center justify-center rounded-[20px] bg-gradient-to-r from-blue-700 to-teal-800 text-white shadow-xl ring-1 ring-white/20 transition-all duration-300 hover:opacity-100 sm:h-auto sm:w-auto sm:gap-2 sm:rounded-full sm:px-4 sm:py-4"
              aria-label="Адмін панель"
              title="Адмін панель"
            >
              <Shield className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="hidden text-xs font-semibold sm:inline">Адмін</span>
              {renderBadge(totalNotifications)}
            </button>
          )}

          {!isChatOpen && (
            <ChatButton
              onClick={() => setIsChatOpen(true)}
              unreadCount={userUnreadCount}
            />
          )}

          {isAdmin && (
            <AdminChatPanel
              isOpen={isAdminPanelOpen}
              onClose={() => setIsAdminPanelOpen(false)}
              onNotificationCountChange={(count) => setTotalNotifications(count)}
            />
          )}
        </div>
      )}

      {!isEmbeddedProductView && isChatOpen && (
        <TelegramChat
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          prefillMessage={prefillMessage}
          onPrefillSent={() => setPrefillMessage(null)}
        />
      )}
    </div>
  );
}
