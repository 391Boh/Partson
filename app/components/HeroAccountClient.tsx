"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IdCard, LogIn, UserPlus, Percent, Handshake, Target, BadgeCheck, PartyPopper, Trash2, Car, Truck } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useFirebaseAuthState } from "app/lib/firebase-auth-state";
import { PARTNER_THRESHOLD_UAH } from "app/lib/partnership-discount";

type HeroAccountClientProps = {
  variant?: "actions" | "benefits" | "panel";
};

const actionButtonBase = [
  "inline-flex",
  "relative",
  "items-center",
  "gap-2",
  "justify-center",
  "overflow-hidden",
  "rounded-[10px]",
  "border",
  "px-5",
  "py-3",
  "font-ui",
  "text-[12px]",
  "font-bold",
  "tracking-[0.08em]",
  "uppercase",
  "transition-[box-shadow,filter,background-color,border-color,background-position,transform]",
  "duration-400",
  "ease-out",
  "focus-visible:outline",
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-sky-300/80",
  "select-none",
  "disabled:opacity-60",
  "disabled:cursor-not-allowed",
  "group",
].join(" ");

const primaryButton = `${actionButtonBase} border-sky-300/45 bg-[image:linear-gradient(135deg,rgba(7,89,133,0.96)_0%,rgba(14,165,233,0.92)_52%,rgba(56,189,248,0.88)_100%)] text-white shadow-[0_1px_0_rgba(255,255,255,0.20)_inset,0_10px_24px_rgba(14,165,233,0.22),0_6px_16px_rgba(2,132,199,0.16)] ring-1 ring-sky-200/14 motion-safe:hover:border-sky-200/65 motion-safe:hover:brightness-[1.07] motion-safe:hover:shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_14px_32px_rgba(14,165,233,0.30),0_8px_22px_rgba(2,132,199,0.20)]`;
const loginButton = `${primaryButton} bg-no-repeat [background-size:180%_180%] [background-position:0%_50%] motion-safe:hover:[background-position:100%_50%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/55 before:to-transparent after:pointer-events-none after:absolute after:inset-y-0 after:left-0 after:w-10 after:bg-[linear-gradient(90deg,rgba(255,255,255,0.14),rgba(255,255,255,0))]`;
const secondaryButton = `${actionButtonBase} border-white/28 bg-white/10 text-sky-50 shadow-[0_1px_0_rgba(255,255,255,0.16)_inset,0_8px_20px_rgba(2,6,23,0.26)] backdrop-blur-sm motion-safe:hover:border-white/48 motion-safe:hover:bg-white/18 motion-safe:hover:shadow-[0_1px_0_rgba(255,255,255,0.24)_inset,0_12px_28px_rgba(2,6,23,0.32)]`;
const vinButton = `${loginButton}`;

// Same shape-handling as AccountInfo.tsx's normalizeVins — the vins field
// isn't always a clean string[] (legacy docs can hold a comma/semicolon
// string, or a map), so a plain Array.isArray check silently dropped those
// users' VINs here even though the account page displayed them fine.
const normalizeVins = (raw: unknown): string[] => {
  if (!raw) return [];

  if (typeof raw === "string") {
    return raw
      .split(/[,;\n]/)
      .map((vin) => vin.trim())
      .filter(Boolean);
  }

  if (Array.isArray(raw)) {
    return raw
      .filter((vin): vin is string => typeof vin === "string")
      .map((vin) => vin.trim())
      .filter(Boolean);
  }

  if (typeof raw === "object") {
    return Object.values(raw as Record<string, unknown>)
      .map((vin) => {
        if (typeof vin === "string") return vin.trim();
        if (typeof vin === "number" && Number.isFinite(vin)) return String(vin);
        return "";
      })
      .filter(Boolean);
  }

  return [];
};

// Saved cars are written by Auto.tsx as a clean string[] of human-readable
// labels (e.g. "BMW 3 (E90), 2008, 2.0 дизель") — those labels contain
// commas, so the comma/semicolon splitting normalizeVins does would shred
// them. Cars only ever need the array / legacy-map shapes handled.
const normalizeCars = (raw: unknown): string[] => {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.values(raw as Record<string, unknown>)
      : [];
  return list
    .filter((car): car is string => typeof car === "string")
    .map((car) => car.trim())
    .filter(Boolean)
    .filter((car, index, all) => all.indexOf(car) === index);
};

// Same field names / fallbacks the catalog (KatalogClientPage.tsx) and
// Auto.tsx use, so this widget shows exactly the car the catalog will
// filter by.
const CAR_STORAGE_KEYS = {
  cars: "partson:selectedCars",
  selection: "partson:selectedCarSelection",
} as const;

const readSelectionLabel = (raw: unknown): string | null => {
  if (!raw || typeof raw !== "object") return null;
  const label = (raw as Record<string, unknown>).label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
};

// Saved delivery is written by app/partnership/PartnershipDeliveryClient.tsx
// onto the same users/{uid} doc; the site checkout auto-fills from these.
type DeliveryInfo = { method: string; detail: string | null };

const readNpDescription = (raw: unknown): string => {
  if (raw && typeof raw === "object") {
    const value = (raw as Record<string, unknown>).Description;
    if (typeof value === "string") return value.trim();
  }
  return "";
};

const readDeliveryInfo = (data: Record<string, unknown>): DeliveryInfo | null => {
  const method =
    typeof data.deliveryMethod === "string" ? data.deliveryMethod.trim() : "";
  if (!method) return null;

  const street =
    typeof data.deliveryLvivStreet === "string"
      ? data.deliveryLvivStreet.trim()
      : "";

  let detail: string | null = null;
  if (method === "Нова Пошта") {
    detail =
      [readNpDescription(data.deliveryCity), readNpDescription(data.deliveryWarehouse)]
        .filter(Boolean)
        .join(", ") || null;
  } else if (method === "Доставка у Львові") {
    detail = street || null;
  } else if (method === "Самовивіз") {
    detail = "вул. Перфецького, 8";
  }

  return { method, detail };
};

type ProfileData = {
  name: string | null;
  vins: string[];
  cars: string[];
  selectionLabel: string | null;
  delivery: DeliveryInfo | null;
};
type OrdersSummary = { hasOrders: boolean; totalSpent: number };

const parseProfileData = (data: Record<string, unknown>): ProfileData => {
  const rawVins = data.vins ?? data.VIN ?? data.vin;
  const vins = normalizeVins(rawVins).filter((vin, index, all) => all.indexOf(vin) === index);
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : null;
  const avto =
    data.avto && typeof data.avto === "object"
      ? (data.avto as Record<string, unknown>)
      : null;
  const avtoCars = normalizeCars(avto?.cars);
  const cars = avtoCars.length ? avtoCars : normalizeCars(data.selectedCars);
  const selectionLabel =
    readSelectionLabel(avto?.selection) ??
    readSelectionLabel(data.selectedCarSelection);
  const delivery = readDeliveryInfo(data);
  return { name, vins, cars, selectionLabel, delivery };
};

// Hero mounts this component twice at once (variant="benefits" and
// variant="actions", see hero.tsx) — both want the same user's data, so
// every subscriber for a given uid shares one live Firestore listener
// instead of each instance opening (and paying for) its own.
//
// Live, not a one-shot getDoc: a car picked in the Auto.tsx widget further
// down this same homepage, or a VIN added through the header's account
// modal, used to leave this panel showing stale cars/VINs until the next
// full page load — nothing on the page ever told the old cached-promise
// version to refetch. onSnapshot means any write to users/{uid} from
// anywhere (this tab or another) reaches every mounted instance immediately.
let profileCache: { uid: string; data: ProfileData } | null = null;
const profileListeners = new Map<string, Set<(data: ProfileData) => void>>();
const profileUnsubscribers = new Map<string, () => void>();

const subscribeUserProfile = (
  uid: string,
  listener: (data: ProfileData) => void
): (() => void) => {
  if (profileCache?.uid === uid) listener(profileCache.data);

  let listeners = profileListeners.get(uid);
  if (!listeners) {
    listeners = new Set();
    profileListeners.set(uid, listeners);
  }
  listeners.add(listener);

  if (!profileUnsubscribers.has(uid)) {
    let cancelled = false;
    // Placeholder so a second subscriber arriving before the dynamic
    // imports below resolve doesn't start a second listener for the same
    // uid; replaced with the real unsubscribe once onSnapshot attaches.
    profileUnsubscribers.set(uid, () => {
      cancelled = true;
    });
    void (async () => {
      const [{ db }, { doc, onSnapshot }] = await Promise.all([
        import("../../firebase"),
        import("firebase/firestore"),
      ]);
      if (cancelled) return;
      const stop = onSnapshot(
        doc(db, "users", uid),
        (snap) => {
          const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
          const result = parseProfileData(data);
          profileCache = { uid, data: result };
          profileListeners.get(uid)?.forEach((cb) => cb(result));
        },
        () => {
          const empty: ProfileData = { name: null, vins: [], cars: [], selectionLabel: null, delivery: null };
          profileCache = { uid, data: empty };
          profileListeners.get(uid)?.forEach((cb) => cb(empty));
        }
      );
      profileUnsubscribers.set(uid, stop);
    })();
  }

  return () => {
    const set = profileListeners.get(uid);
    set?.delete(listener);
    if (set && set.size === 0) {
      profileListeners.delete(uid);
      profileUnsubscribers.get(uid)?.();
      profileUnsubscribers.delete(uid);
      if (profileCache?.uid === uid) profileCache = null;
    }
  };
};

// Optimistic local writes (handleDeleteVin/handleDeleteCar below) still
// update this cache directly for an instant preview — the live listener
// above reconfirms the same value moments later once Firestore round-trips.
const setUserProfileCache = (uid: string, data: ProfileData) => {
  profileCache = { uid, data };
};

let ordersCache: { uid: string; data: OrdersSummary } | null = null;
let ordersInFlight: { uid: string; promise: Promise<OrdersSummary> } | null = null;

const fetchOrdersSummary = (uid: string): Promise<OrdersSummary> => {
  if (ordersCache?.uid === uid) return Promise.resolve(ordersCache.data);
  if (ordersInFlight?.uid === uid) return ordersInFlight.promise;

  const promise = (async () => {
    const [{ db }, { collection, getDocs, query, where }] = await Promise.all([
      import("../../firebase"),
      import("firebase/firestore"),
    ]);
    const snap = await getDocs(query(collection(db, "orders"), where("uid", "==", uid)));
    const totalSpent = snap.docs.reduce((sum, docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      return sum + Number(data.totalAmount || data.total || 0);
    }, 0);
    const result: OrdersSummary = { hasOrders: !snap.empty, totalSpent };
    ordersCache = { uid, data: result };
    return result;
  })().finally(() => {
    if (ordersInFlight?.uid === uid) ordersInFlight = null;
  });

  ordersInFlight = { uid, promise };
  return promise;
};

export default function HeroAccountClient({
  variant = "actions",
}: HeroAccountClientProps) {
  const [hasOrders, setHasOrders] = useState<boolean | null>(null);
  const [totalSpent, setTotalSpent] = useState<number | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const { ready: isAuthReady, user } = useFirebaseAuthState();
  const router = useRouter();
  // The cars/VIN/delivery rows below now change more often than before —
  // the live Firestore subscription (see subscribeUserProfile) can deliver
  // a fresh profile at any moment, not just once per page load — so a plain
  // conditional render popping a whole row in/out, or React reordering chips
  // with no transition, reads as a sudden jump. shouldAnimate gates that
  // motion behind prefers-reduced-motion, same as Auto.tsx.
  const shouldAnimate = !useReducedMotion();

  useEffect(() => {
    if ((variant !== "benefits" && variant !== "panel") || !isAuthReady || !user) {
      setHasOrders(null);
      setTotalSpent(null);
      return;
    }

    let cancelled = false;
    // Needs every order (not just limit(1) like before) to also sum
    // totalAmount — that sum is what decides isPartner below, the same
    // threshold check PartnershipStatusCard.tsx already uses.
    fetchOrdersSummary(user.uid)
      .then(({ hasOrders: hasAny, totalSpent: total }) => {
        if (cancelled) return;
        setHasOrders(hasAny);
        setTotalSpent(total);
      })
      .catch(() => {
        if (!cancelled) {
          setHasOrders(null);
          setTotalSpent(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, user, variant]);

  // Name (for the "Вітаю, {ім'я}" greeting) and saved cars/VINs (shown next
  // to the account buttons) all live on the same users/{uid} doc
  // AccountInfo.tsx already reads from — same field names/fallbacks as
  // there, so this stays in sync with whatever the account page shows, live
  // (see subscribeUserProfile above) rather than only as of the last mount.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    return subscribeUserProfile(user.uid, setProfile);
  }, [user]);

  const isPartner = totalSpent !== null && totalSpent >= PARTNER_THRESHOLD_UAH;
  const displayName = profile?.name ?? null;

  // Optimistic remove (matches AccountInfo.tsx's handleDeleteVin), reverted
  // if the write fails — this widget has no toast system, so a silent
  // revert is the only feedback available here.
  const handleDeleteVin = async (vin: string) => {
    if (!user || !profile) return;
    const previousVins = profile.vins;
    const updatedVins = previousVins.filter((v) => v !== vin);
    setProfile({ ...profile, vins: updatedVins });
    setUserProfileCache(user.uid, { ...profile, vins: updatedVins });
    try {
      const [{ db }, { doc, setDoc }] = await Promise.all([
        import("../../firebase"),
        import("firebase/firestore"),
      ]);
      await setDoc(doc(db, "users", user.uid), { vins: updatedVins }, { merge: true });
    } catch {
      setProfile((prev) => (prev ? { ...prev, vins: previousVins } : prev));
      setUserProfileCache(user.uid, { ...profile, vins: previousVins });
    }
  };

  // Removing a saved car here writes the same fields Auto.tsx / the catalog
  // read (`selectedCars`, `avto.cars`, and — when the removed car was the
  // active engine-level pick — `selectedCarSelection` / `avto.selection`),
  // and mirrors them into localStorage so the next /katalog visit filters
  // correctly even before its own Firestore read lands.
  const handleDeleteCar = async (label: string) => {
    if (!user || !profile) return;
    const previous = profile;
    const nextCars = profile.cars.filter((c) => c !== label);
    const clearedSelection = profile.selectionLabel === label;
    const optimistic: ProfileData = {
      ...profile,
      cars: nextCars,
      selectionLabel: clearedSelection ? null : profile.selectionLabel,
    };
    setProfile(optimistic);
    setUserProfileCache(user.uid, optimistic);

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          CAR_STORAGE_KEYS.cars,
          JSON.stringify(nextCars)
        );
        if (clearedSelection) {
          window.localStorage.removeItem(CAR_STORAGE_KEYS.selection);
        }
      }
      const [{ db }, { doc, setDoc }] = await Promise.all([
        import("../../firebase"),
        import("firebase/firestore"),
      ]);
      await setDoc(
        doc(db, "users", user.uid),
        {
          selectedCars: nextCars,
          avto: clearedSelection
            ? { cars: nextCars, selection: null }
            : { cars: nextCars },
          ...(clearedSelection ? { selectedCarSelection: null } : {}),
        },
        { merge: true }
      );
    } catch {
      setProfile(previous);
      setUserProfileCache(user.uid, previous);
    }
  };

  const openCarPicker = () => router.push("/katalog?tab=auto");
  const openCatalogForCars = () => router.push("/katalog");
  // The delivery editor lives on the partnership page (PartnershipDeliveryClient).
  const openDeliverySettings = () => router.push("/partnership#delivery");

  // Guests always qualify (stable from first paint, no flicker risk).
  // Logged-in users only qualify once the Firestore check confirms they have
  // no prior orders. Before that check resolves, `user` is already a real
  // object but `hasOrders` is still null — `!user || hasOrders === false`
  // reads as true→false→(true|false) for that window: the item appeared
  // optimistically, then got yanked out the instant login was confirmed,
  // then possibly reappeared once the Firestore check landed. Wait for the
  // full picture (auth ready, and the order check too if logged in) before
  // computing the list at all, so it renders once and never changes.
  const isBenefitsDataReady = isAuthReady && (!user || hasOrders !== null);

  const benefitItems = useMemo((): Array<{
    id: string;
    icon: typeof Percent;
    tone: "accent" | "success";
    label: ReactNode;
    onClick: () => void;
  }> => {
    const showDiscount = !user || hasOrders === false;

    return [
      ...(showDiscount
        ? [
            {
              id: "discount",
              icon: Percent,
              tone: "accent" as const,
              label: (
                <>
                  <strong className="text-sky-200">5%</strong> знижка на перше замовлення
                </>
              ),
              onClick: () => window.dispatchEvent(new Event("openOrderModal")),
            },
          ]
        : []),
      {
        id: "partnership",
        icon: isPartner ? BadgeCheck : Handshake,
        tone: isPartner ? ("success" as const) : ("accent" as const),
        label: isPartner ? (
          <>
            Ви є партнером <strong className="text-emerald-300">Partson</strong>
          </>
        ) : (
          <>
            Партнерство <strong className="text-sky-200">PartsON</strong>
          </>
        ),
        onClick: () => router.push("/partnership"),
      },
      {
        id: "selection",
        icon: Target,
        tone: "accent" as const,
        label: (
          <>
            <strong className="text-sky-200">Професійний</strong> підбір
          </>
        ),
        onClick: () => router.push("/katalog?tab=auto"),
      },
    ];
  }, [hasOrders, isPartner, user, router]);

  const actions = (() => {
    // Firebase auth state isn't known during SSR/first paint — rendering
    // the guest buttons immediately and then swapping to the logged-in "VIN"
    // button once isAuthReady resolves true is exactly what read as
    // flickering in the hero. Show a neutral, same-sized placeholder until
    // the real state is known, then commit to it once, instead of guessing
    // and correcting.
    if (!isAuthReady) {
      return (
        <>
          <p className="font-display max-w-[30ch] text-[20px] font-semibold italic leading-snug text-sky-100/95 [text-shadow:0_2px_10px_rgba(2,6,23,0.92)] after:mx-auto after:mt-2.5 after:block after:h-0.5 after:w-20 after:bg-gradient-to-r after:from-transparent after:via-sky-300/80 after:to-transparent sm:text-[23px]">
            <strong className="font-black not-italic text-slate-100">Зручний профіль</strong> користувача!
          </p>
          <div className="flex min-h-[46px] min-w-[260px] items-center justify-center gap-2 sm:min-h-[48px] sm:min-w-[276px]">
            <span className="h-[46px] w-[126px] animate-pulse rounded-[10px] bg-white/10 sm:h-[48px] sm:w-[134px]" />
            <span className="h-[46px] w-[126px] animate-pulse rounded-[10px] bg-white/10 sm:h-[48px] sm:w-[134px]" />
          </div>
        </>
      );
    }

    return (
      <>
        {!user && (
          <p className="font-display max-w-[30ch] text-[20px] font-semibold italic leading-snug text-sky-100/95 [text-shadow:0_2px_10px_rgba(2,6,23,0.92)] after:mx-auto after:mt-2.5 after:block after:h-0.5 after:w-20 after:bg-gradient-to-r after:from-transparent after:via-sky-300/80 after:to-transparent sm:text-[23px]">
            <strong className="font-black not-italic text-slate-100">Зручний профіль</strong> користувача!
          </p>
        )}
        <div className="flex min-h-[46px] min-w-[260px] flex-wrap items-center justify-center gap-2 sm:min-h-[48px] sm:min-w-[276px]">
        {user ? (
          <>
            <button type="button" onClick={openCarPicker} className={vinButton}>
              <span className="relative inline-flex items-center gap-1.5 transition-transform duration-300 ease-out group-hover:scale-[1.07]">
                <Car className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                {profile && profile.cars.length > 0 ? "Змінити авто" : "Обрати авто"}
              </span>
            </button>
            <button type="button" onClick={() => window.dispatchEvent(new Event("openAccountVin"))} className={vinButton}>
              <span className="relative inline-flex items-center gap-1.5 transition-transform duration-300 ease-out group-hover:scale-[1.07]">
                <IdCard className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                Додати VIN номер
              </span>
            </button>
            {/* Saved cars — mirrors the VIN chips right below. Each chip
                jumps to the catalog, which reads the very same stored car
                and opens already filtered by it; the trash icon clears it
                from Firestore + localStorage in one go. The whole row (and
                each chip inside it) animates in/out instead of popping —
                the live profile subscription can add/remove a chip at any
                moment now, not just once on first load. */}
            <AnimatePresence initial={false}>
              {profile && profile.cars.length > 0 && (
                <motion.div
                  key="cars-row"
                  initial={shouldAnimate ? { opacity: 0, height: 0 } : false}
                  animate={shouldAnimate ? { opacity: 1, height: "auto" } : undefined}
                  exit={shouldAnimate ? { opacity: 0, height: 0 } : undefined}
                  transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                  className="flex w-full flex-wrap items-center justify-center gap-1.5 overflow-hidden"
                  aria-label="Збережені автомобілі"
                >
                  <AnimatePresence initial={false}>
                    {profile.cars.map((label) => {
                      const isActive = profile.selectionLabel === label;
                      return (
                        <motion.span
                          key={label}
                          layout={shouldAnimate}
                          initial={shouldAnimate ? { opacity: 0, scale: 0.85 } : false}
                          animate={shouldAnimate ? { opacity: 1, scale: 1 } : undefined}
                          exit={shouldAnimate ? { opacity: 0, scale: 0.85 } : undefined}
                          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                          className={`group/car inline-flex max-w-full items-center gap-1.5 rounded-full border py-1.5 pl-1 pr-1 text-[11px] font-bold tracking-[0.01em] text-white shadow-[0_2px_8px_rgba(2,132,199,0.24)] [text-shadow:0_1px_2px_rgba(2,6,23,0.6)] ${
                            isActive
                              ? "border-teal-300/50 bg-[image:linear-gradient(135deg,rgba(13,148,136,0.9)_0%,rgba(14,165,233,0.7)_100%)]"
                              : "border-sky-300/35 bg-[image:linear-gradient(135deg,rgba(7,89,133,0.85)_0%,rgba(14,165,233,0.65)_100%)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={openCatalogForCars}
                            aria-label={`Відкрити каталог для ${label}`}
                            className="inline-flex min-w-0 items-center gap-1.5 rounded-full pl-2 pr-1 transition-transform duration-200 group-hover/car:scale-[1.02]"
                          >
                            <Car className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                            <span className="truncate">{label}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCar(label)}
                            aria-label={`Видалити авто ${label}`}
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sky-100/70 transition-colors duration-150 hover:bg-rose-500/40 hover:text-rose-50"
                          >
                            <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                          </button>
                        </motion.span>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Only appears once the profile fetch resolves with saved
                VINs — before that (or for a user with none) nothing renders
                here. No IdCard icon here (the button right above already
                carries one) — same sky-gradient family as vinButton
                instead, just scaled down, plus a trash icon to delete each
                one inline. */}
            <AnimatePresence initial={false}>
              {profile && profile.vins.length > 0 && (
                <motion.div
                  key="vins-row"
                  initial={shouldAnimate ? { opacity: 0, height: 0 } : false}
                  animate={shouldAnimate ? { opacity: 1, height: "auto" } : undefined}
                  exit={shouldAnimate ? { opacity: 0, height: 0 } : undefined}
                  transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                  className="flex w-full flex-wrap items-center justify-center gap-1.5 overflow-hidden"
                  aria-label="Збережені VIN-коди"
                >
                  <AnimatePresence initial={false}>
                    {profile.vins.map((vin) => (
                      <motion.span
                        key={vin}
                        layout={shouldAnimate}
                        initial={shouldAnimate ? { opacity: 0, scale: 0.85 } : false}
                        animate={shouldAnimate ? { opacity: 1, scale: 1 } : undefined}
                        exit={shouldAnimate ? { opacity: 0, scale: 0.85 } : undefined}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="group/vin inline-flex items-center gap-1.5 rounded-full border border-sky-300/45 bg-[image:linear-gradient(135deg,rgba(7,89,133,0.94)_0%,rgba(14,165,233,0.78)_100%)] py-1.5 pl-3 pr-1 font-mono text-[11px] font-bold tracking-[0.04em] text-white shadow-[0_2px_8px_rgba(2,132,199,0.3)] [text-shadow:0_1px_2px_rgba(2,6,23,0.7)]"
                      >
                        {vin}
                        <button
                          type="button"
                          onClick={() => handleDeleteVin(vin)}
                          aria-label={`Видалити VIN ${vin}`}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sky-100/70 transition-colors duration-150 hover:bg-rose-500/40 hover:text-rose-50"
                        >
                          <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Saved delivery address — read from the same users/{uid} fields
                the partnership page writes and the checkout auto-fills. One
                chip, tap opens the delivery editor on /partnership. */}
            <AnimatePresence initial={false}>
              {profile?.delivery && (
                <motion.div
                  key="delivery-row"
                  initial={shouldAnimate ? { opacity: 0, height: 0 } : false}
                  animate={shouldAnimate ? { opacity: 1, height: "auto" } : undefined}
                  exit={shouldAnimate ? { opacity: 0, height: 0 } : undefined}
                  transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                  className="flex w-full flex-wrap items-center justify-center gap-1.5 overflow-hidden"
                  aria-label="Збережена доставка"
                >
                  <button
                    type="button"
                    onClick={openDeliverySettings}
                    aria-label="Змінити спосіб доставки"
                    className="group/delivery inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-300/45 bg-[image:linear-gradient(135deg,rgba(7,89,133,0.94)_0%,rgba(14,165,233,0.78)_100%)] py-1.5 pl-3 pr-3 text-[11px] font-bold tracking-[0.01em] text-white shadow-[0_2px_8px_rgba(2,132,199,0.3)] transition-transform duration-200 [text-shadow:0_1px_2px_rgba(2,6,23,0.7)] hover:scale-[1.02]"
                  >
                    <Truck className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                    <span className="truncate">
                      {profile.delivery.method}
                      {profile.delivery.detail ? ` · ${profile.delivery.detail}` : ""}
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("openAuthModal", {
                    detail: { initialMode: "login", initialAccountTab: null },
                  })
                )
              }
              className={loginButton}
            >
              <span className="relative inline-flex items-center gap-1.5 transition-transform duration-300 ease-out group-hover:scale-[1.07]">
                <LogIn className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                Увійти
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("openAuthModal", {
                    detail: { initialMode: "register", initialAccountTab: null },
                  })
                )
              }
              className={secondaryButton}
            >
              <span className="relative inline-flex items-center gap-1.5 transition-transform duration-300 ease-out group-hover:scale-[1.07]">
                <UserPlus className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                Реєстрація
              </span>
            </button>
          </>
        )}
        </div>
      </>
    );
  })();

  if (variant === "actions") return actions;

  // Was h-full — inside the flex-col column in hero.tsx, that stretched
  // this card's box to the column's full height regardless of how short its
  // actual content was, leaving a large invisible gap below the chips
  // before the box's own bottom edge. That gap is what pushed the
  // tagline/buttons block down below it, no matter how the block below was
  // told to align itself — the real fix was here, not there.
  const benefits = (
    <div className="flex w-full min-w-0 flex-col space-y-3">
      <div className="flex items-center justify-start gap-3">
        {/* Was wrapped in a bordered rounded-full badge span — now just the
            bare icon, no container, so it reads as a bigger standalone
            glyph instead of a small mark inside a circle. Moved back to the
            left of the text (was on the right) — the row itself still hugs
            the right edge via justify-end on the row above.
            Swaps to a party-popper glyph once a logged-in user's name has
            loaded (greeting state) — the gift-box outline stays for the
            "Вигода від реєстрації" pitch shown to guests / before the name
            is known, since that icon is about the registration bonus, not
            a person. */}
        {user && displayName ? (
          <PartyPopper
            className="h-9 w-9 shrink-0 text-sky-200/90 drop-shadow-[0_0_14px_rgba(56,189,248,0.45)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-9 w-9 shrink-0 text-sky-200/90 drop-shadow-[0_0_14px_rgba(56,189,248,0.45)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 10h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10z" />
            <path d="M2 7h20v3H2z" />
            <path d="M12 7v15" />
            <path d="M7.5 7a2.5 2.5 0 1 1 0-5c2.5 0 4.5 5 4.5 5" />
            <path d="M16.5 7a2.5 2.5 0 1 0 0-5c-2.5 0-4.5 5-4.5 5" />
          </svg>
        )}
        <div className="flex min-w-0 flex-col items-start text-left">
          <p className="font-display break-words text-base font-black uppercase tracking-[0.1em] text-slate-100 [text-shadow:0_2px_10px_rgba(2,6,23,0.85)] sm:text-lg sm:tracking-[0.14em]">
            {user && displayName ? (
              <>Вітаю, {displayName}!</>
            ) : (
              "Вигода від реєстрації"
            )}
          </p>
          <span className="h-0.5 w-32 bg-gradient-to-r from-cyan-300/90 via-sky-300/45 to-transparent" />
        </div>
      </div>
      {/* Icon back to the side of the text (was stacked icon-above-text) —
          `auto-fit`/`minmax` still keeps this a true horizontal row for 2
          or 3 items alike on any screen width, wrapping to a second row
          only if there truly isn't 190px to give each one. 190px (icon +
          gap eats ~46px of it) leaves enough for the longest label, "5%
          знижка на перше замовлення", to fit its 2-line clamp. No hover
          shift/translate here — border and background tint only. */}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2 text-[13px] font-semibold tracking-[-0.01em] text-white sm:text-[14px]">
        {isBenefitsDataReady ? (
          benefitItems.map(({ id, label, icon: Icon, onClick, tone }) => (
            <li key={id} className="min-w-0">
              <button
                type="button"
                onClick={onClick}
                className={
                  tone === "success"
                    ? "group home-chip-hover flex h-full w-full cursor-pointer items-center gap-2.5 rounded-xl border border-emerald-300/40 bg-emerald-400/[0.14] px-3.5 py-3 text-left shadow-[0_4px_14px_rgba(16,185,129,0.20)] backdrop-blur-sm transition-[border-color,background-color] duration-200 ease-out motion-safe:hover:border-emerald-200/65 motion-safe:hover:bg-[image:linear-gradient(120deg,rgba(52,211,153,0.22)_0%,rgba(255,255,255,0.14)_100%)]"
                    : "group home-chip-hover flex h-full w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/18 bg-white/14 px-3.5 py-3 text-left shadow-[0_4px_14px_rgba(2,6,23,0.24)] backdrop-blur-sm transition-[border-color,background-color] duration-200 ease-out motion-safe:hover:border-sky-300/50 motion-safe:hover:bg-[image:linear-gradient(120deg,rgba(56,189,248,0.18)_0%,rgba(255,255,255,0.14)_100%)]"
                }
              >
                <span
                  className={
                    tone === "success"
                      ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-400/20 text-emerald-200 transition-colors duration-200 group-hover:border-emerald-200/80 group-hover:text-emerald-100"
                      : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-300/40 bg-sky-400/16 text-sky-200 transition-colors duration-200 group-hover:border-sky-200/70 group-hover:text-sky-100"
                  }
                >
                  <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
                </span>
                <span
                  className={
                    tone === "success"
                      ? "line-clamp-2 leading-snug transition-colors duration-200 group-hover:text-emerald-100"
                      : "line-clamp-2 leading-snug transition-colors duration-200 group-hover:text-sky-100"
                  }
                >
                  {label}
                </span>
              </button>
            </li>
          ))
        ) : (
          // Same list, not yet known whether the discount row belongs — a
          // static-height skeleton avoids the row count (and card height)
          // changing once isBenefitsDataReady flips, instead of rendering
          // an optimistic guess that then has to be corrected.
          <>
            <li aria-hidden="true">
              <span className="block h-[92px] animate-pulse rounded-xl border border-white/10 bg-white/5" />
            </li>
            <li aria-hidden="true">
              <span className="block h-[92px] animate-pulse rounded-xl border border-white/10 bg-white/5" />
            </li>
          </>
        )}
      </ul>
    </div>
  );

  if (variant === "panel") {
    return (
      <>
        {benefits}
        <div className="flex flex-col items-center gap-3 text-center">
          {actions}
        </div>
      </>
    );
  }

  return benefits;
}
