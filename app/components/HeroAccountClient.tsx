"use client";

import { useEffect, useMemo, useState } from "react";
import { IdCard, LogIn, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFirebaseAuthState } from "app/lib/firebase-auth-state";

type HeroAccountClientProps = {
  cardGradientBase: string;
  cardGradientHover: string;
  cardInteractionStatic: string;
  variant?: "actions" | "benefits";
};

const actionButtonBase = [
  "inline-flex",
  "relative",
  "items-center",
  "gap-2",
  "justify-center",
  "overflow-hidden",
  "rounded-[14px]",
  "border",
  "px-5",
  "py-2.5",
  "font-ui",
  "text-[11px]",
  "font-bold",
  "tracking-[0.12em]",
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
const secondaryButton = `${actionButtonBase} border-sky-200/20 bg-[image:linear-gradient(135deg,rgba(255,255,255,0.08)_0%,rgba(56,189,248,0.09)_50%,rgba(99,102,241,0.07)_100%)] text-sky-100 shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_8px_20px_rgba(2,6,23,0.22)] ring-1 ring-sky-200/10 backdrop-blur-md motion-safe:hover:border-sky-200/38 motion-safe:hover:bg-[image:linear-gradient(135deg,rgba(255,255,255,0.12)_0%,rgba(56,189,248,0.14)_50%,rgba(99,102,241,0.10)_100%)] motion-safe:hover:text-white motion-safe:hover:shadow-[0_1px_0_rgba(255,255,255,0.20)_inset,0_12px_28px_rgba(2,6,23,0.26),0_6px_16px_rgba(56,189,248,0.12)] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/28 before:to-transparent`;
const vinButton = `${loginButton}`;

export default function HeroAccountClient({
  cardGradientBase,
  cardGradientHover,
  cardInteractionStatic,
  variant = "actions",
}: HeroAccountClientProps) {
  const [hasOrders, setHasOrders] = useState<boolean | null>(null);
  const { ready: isAuthReady, user } = useFirebaseAuthState();
  const router = useRouter();

  useEffect(() => {
    if (variant !== "benefits" || !isAuthReady || !user) {
      setHasOrders(null);
      return;
    }

    let cancelled = false;
    const checkOrders = async () => {
      try {
        const [{ db }, { collection, getDocs, limit, query, where }] = await Promise.all([
          import("../../firebase"),
          import("firebase/firestore"),
        ]);
        const snap = await getDocs(
          query(collection(db, "orders"), where("uid", "==", user.uid), limit(1))
        );
        if (!cancelled) setHasOrders(!snap.empty);
      } catch {
        if (!cancelled) setHasOrders(null);
      }
    };

    void checkOrders();
    return () => {
      cancelled = true;
    };
  }, [isAuthReady, user, variant]);

  const benefitItems = useMemo(
    () => [
      ...(hasOrders !== true
        ? [
            {
              label: "5% знижка на перше замовлення",
              onClick: () => window.dispatchEvent(new Event("openOrderModal")),
            },
          ]
        : []),
      {
        label: "Партнерство PartsON",
        onClick: () => router.push("/partnership"),
      },
      {
        label: "Професійний підбір",
        onClick: () => router.push("/katalog?tab=auto"),
      },
    ],
    [hasOrders, router]
  );

  if (variant === "actions") {
    return (
      <div className="flex min-h-[42px] min-w-[272px] flex-wrap items-center justify-center gap-2 sm:min-h-[44px] sm:min-w-[292px]">
        {user ? (
          <button type="button" onClick={() => window.dispatchEvent(new Event("openAccountVin"))} className={vinButton}>
            <span className="relative inline-flex items-center gap-1.5 transition-transform duration-300 ease-out group-hover:scale-[1.07]">
              <IdCard className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              Додати VIN номер
            </span>
          </button>
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
    );
  }

  return (
    <div
      className={`home-glass-card hero-stable-card flex min-h-[180px] h-full min-w-0 flex-col space-y-2 rounded-2xl border border-white/10 p-3 shadow-[0_10px_24px_rgba(2,6,23,0.26)] ${cardInteractionStatic} md:col-span-2 lg:col-span-1 ${cardGradientBase} ${cardGradientHover} bg-white/10 sm:min-h-0`}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200/30 text-sky-200/90 shadow-[0_0_16px_rgba(56,189,248,0.3)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 10h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10z" />
            <path d="M2 7h20v3H2z" />
            <path d="M12 7v15" />
            <path d="M7.5 7a2.5 2.5 0 1 1 0-5c2.5 0 4.5 5 4.5 5" />
            <path d="M16.5 7a2.5 2.5 0 1 0 0-5c-2.5 0-4.5 5-4.5 5" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="font-display break-words text-xs font-semibold italic uppercase tracking-[0.14em] text-white sm:text-sm sm:tracking-[0.2em]">
            Вигода від реєстрації
          </p>
          <span className="h-0.5 w-28 bg-gradient-to-r from-sky-300/70 via-white/25 to-transparent" />
        </div>
      </div>
      <ul className="space-y-2 text-[13px] font-semibold tracking-[-0.01em] text-white sm:text-[15px]">
        {benefitItems.map(({ label, onClick }) => (
          <li key={label}>
            <button
              type="button"
              onClick={onClick}
              className="group home-chip-hover w-full flex cursor-pointer items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2 transition-[border-color,background-color] duration-200 ease-out motion-safe:hover:border-sky-300/50 motion-safe:hover:bg-[image:linear-gradient(120deg,rgba(56,189,248,0.16)_0%,rgba(255,255,255,0.10)_100%)]"
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-emerald-400/70 text-emerald-300/90 transition-colors duration-200 group-hover:border-emerald-300 group-hover:text-emerald-200">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12l4 4 10-10" />
                </svg>
              </span>
              <span className="text-[13px] transition-all duration-200 group-hover:text-[13.5px] group-hover:text-sky-100 sm:text-[15px] sm:group-hover:text-[15.5px]">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
