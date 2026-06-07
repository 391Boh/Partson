"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, IdCard, LogIn, UserPlus } from "lucide-react";
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
  "items-center",
  "gap-2",
  "justify-center",
  "rounded-[14px]",
  "px-5",
  "py-2.5",
  "font-ui",
  "text-[11px]",
  "font-bold",
  "tracking-[0.12em]",
  "uppercase",
  "transition-[box-shadow,filter,background-color,border-color]",
  "duration-400",
  "ease-out",
  "focus-visible:outline",
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-sky-300/80",
  "select-none",
  "disabled:opacity-60",
  "disabled:cursor-not-allowed",
].join(" ");

const primaryButton = `${actionButtonBase} border border-sky-100/35 bg-[image:linear-gradient(135deg,rgba(239,246,255,0.98)_0%,rgba(191,219,254,0.94)_34%,rgba(125,211,252,0.92)_68%,rgba(59,130,246,0.9)_100%)] text-slate-900 shadow-[0_10px_22px_rgba(56,189,248,0.24)] motion-safe:hover:border-sky-50/55 motion-safe:hover:brightness-[1.02] motion-safe:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_14px_30px_rgba(56,189,248,0.28)]`;
const loginButton = `${primaryButton} bg-no-repeat [background-size:185%_185%] [background-position:0%_50%] transition-[box-shadow,filter,background-color,border-color,background-position] motion-safe:hover:[background-position:100%_50%]`;
const secondaryButton = `${actionButtonBase} border border-white/24 bg-[image:linear-gradient(135deg,rgba(255,255,255,0.18)_0%,rgba(226,232,240,0.12)_50%,rgba(125,211,252,0.16)_100%)] text-white shadow-[0_10px_20px_rgba(2,6,23,0.24)] motion-safe:hover:border-sky-100/34 motion-safe:hover:bg-[image:linear-gradient(135deg,rgba(255,255,255,0.22)_0%,rgba(226,232,240,0.14)_48%,rgba(125,211,252,0.2)_100%)] motion-safe:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_14px_28px_rgba(56,189,248,0.16)]`;
const vinButton = `${actionButtonBase} group/vin relative overflow-hidden border border-cyan-100/60 bg-[image:linear-gradient(135deg,#f8fafc_0%,#dff8ff_28%,#67e8f9_62%,#0ea5e9_100%)] px-4 pr-5 text-slate-950 shadow-[0_14px_30px_rgba(8,145,178,0.3),inset_0_1px_0_rgba(255,255,255,0.72)] ring-1 ring-white/35 bg-no-repeat [background-size:180%_180%] [background-position:0%_50%] transition-[box-shadow,filter,border-color,background-position,transform] motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-white/80 motion-safe:hover:[background-position:100%_50%] motion-safe:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_18px_36px_rgba(14,165,233,0.36)]`;

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
        label: "Пріоритетна підтримка",
        onClick: () =>
          window.dispatchEvent(new CustomEvent("openChatWithMessage", { detail: "" })),
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
        {isAuthReady && user ? (
          <button type="button" onClick={() => window.dispatchEvent(new Event("openAccountVin"))} className={vinButton}>
            <span className="absolute inset-y-0 left-0 w-12 bg-[linear-gradient(90deg,rgba(255,255,255,0.55),rgba(255,255,255,0))]" aria-hidden="true" />
            <span className="relative inline-flex h-6 w-7 items-center justify-center rounded-[8px] border border-slate-900/10 bg-white/78 text-sky-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_12px_rgba(14,165,233,0.18)]">
              <IdCard className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              <BadgeCheck className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-white text-emerald-600" strokeWidth={2.5} aria-hidden="true" />
            </span>
            Додати VIN
          </button>
        ) : isAuthReady ? (
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
              <LogIn className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              Увійти
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
              <UserPlus className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              Реєстрація
            </button>
          </>
        ) : (
          <span className="h-10 w-[220px] rounded-[14px] border border-white/15 bg-white/10" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`home-glass-card flex min-h-[180px] h-full min-w-0 flex-col space-y-2 rounded-2xl border border-white/10 p-3 shadow-[0_10px_24px_rgba(2,6,23,0.26)] ${cardInteractionStatic} md:col-span-2 lg:col-span-1 ${cardGradientBase} ${cardGradientHover} bg-white/10 motion-safe:hover:bg-white/12 sm:min-h-0`}
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
          <p className="font-display break-words text-xs font-semibold italic uppercase tracking-[0.14em] text-slate-100/90 sm:text-sm sm:tracking-[0.2em]">
            Вигода від реєстрації
          </p>
          <span className="h-0.5 w-28 bg-gradient-to-r from-sky-300/70 via-white/25 to-transparent" />
        </div>
      </div>
      <ul className="space-y-2 text-[13px] font-semibold tracking-[-0.01em] text-slate-100 sm:text-[15px]">
        {benefitItems.map(({ label, onClick }) => (
          <li
            key={label}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => event.key === "Enter" && onClick()}
            className="home-chip-hover flex cursor-pointer items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2 transition-[border-color,background-color] duration-200 ease-out motion-safe:hover:border-white/30 motion-safe:hover:bg-white/15"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-emerald-400/70 text-emerald-300/90">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12l4 4 10-10" />
              </svg>
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
