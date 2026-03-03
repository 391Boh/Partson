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
} from "firebase/firestore";
import Header from "./Header";
import AdminChatPanel from "./AdminChatPanel";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

const TelegramChat = dynamic(() => import("./TelegramChat"), { ssr: false });
const ChatButton = dynamic(() => import("./ChatButton"), { ssr: false });

interface LayoutHostProps {
  children: ReactNode;
}

export default function LayoutHost({ children }: LayoutHostProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
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
  const isEmbeddedProductView =
    pathname.startsWith("/product/") && searchParams.get("view") === "modal";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const body = document.body;
    const root = document.documentElement;

    body.style.overflow = "auto";
    body.style.overflowY = "auto";
    root.style.overflow = "auto";
    root.style.overflowY = "auto";

    if (pathname === "/") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
        void import("app/inform/page");
      } catch {}
    };

    const preloadAllChunks = () => {
      preloadCriticalChunks();
      try {
        void import("app/katalog/page");
      } catch {}
      try {
        void import("app/components/Data");
      } catch {}
      try {
        void import("app/components/filtrtion");
      } catch {}
      try {
        void import("app/components/Order");
      } catch {}
      try {
        void import("app/components/tovar");
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

      await warm("/inform?tab=about");
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
    let warmRoutesTimer: number | null = null;
    let preloadAllTimer: number | null = null;
    let loadListener: (() => void) | null = null;

    const scheduleWarmup = () => {
      if (isSlowConnection) return;

      router.prefetch("/katalog");
      router.prefetch("/inform");
      preloadCriticalChunks();

      warmRoutesTimer = window.setTimeout(() => void warmRoutes(), 400);
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
      if (warmRoutesTimer != null) window.clearTimeout(warmRoutesTimer);
      if (preloadAllTimer != null) window.clearTimeout(preloadAllTimer);
      if (timerId != null) window.clearTimeout(timerId);
      if (idleId != null && "cancelIdleCallback" in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          idleId
        );
      }
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const legacyUserId = localStorage.getItem("user_id");
    const storedChatId = localStorage.getItem("chat_user_id");
    const resolvedId = storedChatId || legacyUserId;

    if (resolvedId) {
      if (!storedChatId) {
        localStorage.setItem("chat_user_id", resolvedId);
      }
      setUserId(resolvedId);
      setLoading(false);
    } else {
      const generatedId = (() => {
        const cryptoObj = globalThis.crypto as Crypto | undefined;
        if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
          return `user_${cryptoObj.randomUUID()}`;
        }
        return `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      })();

      localStorage.setItem("chat_user_id", generatedId);
      setUserId(generatedId);
      setLoading(false);
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const isAdminRole = userSnap.exists() && userSnap.data().role === "admin";

        setIsAdmin(isAdminRole);
        localStorage.setItem("user_id", user.uid);
        const storedChatId = localStorage.getItem("chat_user_id");
        const resolvedChatId = storedChatId || user.uid;
        if (!storedChatId) {
          localStorage.setItem("chat_user_id", resolvedChatId);
        }
        setUserId(resolvedChatId);
      } else {
        setIsAdmin(false);
        const fallbackId =
          typeof window !== "undefined" ? localStorage.getItem("chat_user_id") : null;
        setUserId(fallbackId);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

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
        {children}
      </main>

      {!isEmbeddedProductView && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end space-y-4">
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

          {!loading && isAdmin && (
            <button
              onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)}
              className="relative z-[60] bg-gradient-to-r from-blue-700 to-teal-800 text-white p-4 rounded-full opacity-60 hover:opacity-100 transition-all duration-300 flex justify-center items-center shadow-xl ring-1 ring-white/20"
            >
              {isAdminPanelOpen ? (
                <ChevronDownIcon className="h-6 w-6" />
              ) : (
                <>
                  <ChevronUpIcon className="h-6 w-6" />
                  {renderBadge(totalNotifications)}
                </>
              )}
            </button>
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

