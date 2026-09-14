"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { collection, doc, getDoc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useFirebaseAuthState } from "app/lib/firebase-auth-state";

export type LayoutAccountRuntimeProps = {
  isAdmin: boolean;
  setIsAdmin: Dispatch<SetStateAction<boolean>>;
  setUserUnreadCount: Dispatch<SetStateAction<number>>;
  setTotalNotifications: Dispatch<SetStateAction<number>>;
};

// This module is downloaded only for a restored account or explicit chat
// interaction. Its SDK, role checks and presence listeners are not needed
// to render a guest's header or page content.
const firebaseDeps = { db, collection, doc, getDoc, onSnapshot, query, setDoc, where };

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

export default function LayoutAccountRuntime({
  isAdmin,
  setIsAdmin,
  setUserUnreadCount,
  setTotalNotifications,
}: LayoutAccountRuntimeProps) {
  const { ready: firebaseAuthReady, user: firebaseUser } = useFirebaseAuthState();
  const [adminCheckReady, setAdminCheckReady] = useState(false);
  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const isAdminEmailRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!firebaseAuthReady) return;

    const { db, doc, getDoc, setDoc } = firebaseDeps;
    let cancelled = false;

    if (firebaseUser) {
      setAuthUserUid(firebaseUser.uid);
      // Optimistic instant paint for a returning admin on the same device;
      // the authoritative check (custom claims / Firestore role / the
      // server-side email allowlist) still runs below.
      if (readRememberedAdminAccess(firebaseUser.uid)) {
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

    const syncAuthState = async () => {
      const user = firebaseUser;
      if (user) {
        setAdminCheckReady(false);
        setAuthUserUid(user.uid);
        if (readRememberedAdminAccess(user.uid)) {
          setIsAdmin(true);
        }
        const userRef = doc(db, "users", user.uid);
        // Profile and token are independent. Reading them in parallel avoids
        // making the role check wait on two serial network/IndexedDB trips.
        // A cached token is sufficient here; the live user-doc listener below
        // still applies role changes immediately without a forced refresh.
        const userDataPromise = getDoc(userRef)
          .then((userSnap) =>
            userSnap.exists()
              ? (userSnap.data() as Record<string, unknown>)
              : undefined
          )
          .catch((error) => {
            if (!isPermissionDeniedError(error)) {
              console.error("Failed to load user profile for role detection:", error);
            }
            return undefined;
          });
        const tokenPromise = user
          .getIdTokenResult()
          .then((token) => ({
            claims: (token?.claims ?? {}) as Record<string, unknown>,
            idToken: token?.token ?? "",
          }))
          .catch(() => ({
            claims: {} as Record<string, unknown>,
            idToken: "",
          }));
        const [userData, { claims, idToken }] = await Promise.all([
          userDataPromise,
          tokenPromise,
        ]);
        if (cancelled) return;

        const isAdminRole =
          hasAdminAccess(userData) ||
          hasAdminAccess(claims) ||
          (claims.permissions &&
          typeof claims.permissions === "object"
            ? hasAdminAccess(claims.permissions as Record<string, unknown>)
            : false) ||
          hasAdminRole(claims.permissions);

        const isAdminEmail = idToken ? await checkIsAdminOnServer(idToken) : false;
        if (cancelled) return;
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
    };

    void syncAuthState();

    return () => {
      cancelled = true;
    };
  }, [firebaseAuthReady, firebaseUser, setIsAdmin]);

  // Promoting/demoting a user's role from the admin panel writes straight to
  // their users/{uid} Firestore doc. Without a live listener, the affected
  // browser only re-checks admin access on its next login or Firebase's
  // ~1hr ID token refresh — this makes a role change take effect immediately.
  useEffect(() => {
    if (!authUserUid || !adminCheckReady) return;

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
  }, [authUserUid, adminCheckReady, setIsAdmin]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

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
  }, [userId]);

  useEffect(() => {
    if (!authUserUid || typeof window === "undefined") return;

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
  }, [authUserUid]);

  useEffect(() => {
    if (loading || !userId) return;

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
  }, [userId, loading, setUserUnreadCount]);

  useEffect(() => {
    if (!isAdmin) {
      setTotalNotifications(0);
      return;
    }

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
  }, [isAdmin, setTotalNotifications]);

  return null;
}
