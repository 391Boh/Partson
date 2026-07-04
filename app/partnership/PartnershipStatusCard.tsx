"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { BadgeCheck, Handshake, TrendingUp, LogIn, ChevronRight } from "lucide-react";
import { db } from "../../firebase";
import { useFirebaseAuthState } from "app/lib/firebase-auth-state";
import { PARTNER_DISCOUNT_PERCENT, PARTNER_THRESHOLD_UAH } from "app/lib/partnership-discount";

type CardStatus = "loading" | "guest" | "active" | "pending";
type PartnershipStatusCardProps = {
  showCta?: boolean;
  edge?: boolean;
};

const STEPS = [
  { n: "1", label: "Реєстрація", note: "Старт", g: "from-sky-500 to-cyan-500" },
  { n: "2", label: "Замовлення", note: "Накопичення", g: "from-indigo-500 to-sky-500" },
  { n: "3", label: "Активація", note: "Автоматично", g: "from-cyan-500 to-teal-500" },
  { n: "4", label: `Знижка ${PARTNER_DISCOUNT_PERCENT}%`, note: "Постійно", g: "from-emerald-500 to-cyan-500" },
] as const;

const darkStripClass =
  "relative overflow-hidden rounded-[20px] border border-white/[0.10] bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(7,17,48,0.96)_48%,rgba(8,31,62,0.92))] p-4 text-white shadow-[0_18px_42px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.10)] sm:p-5";
const edgeStripClass =
  "relative overflow-hidden border-y border-white/[0.10] bg-[linear-gradient(135deg,rgba(8,18,50,0.92),rgba(10,34,68,0.88)_48%,rgba(14,55,92,0.82))] py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-1px_0_rgba(125,211,252,0.08)] sm:py-5";

function StripGlow() {
  return (
    <>
      <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-sky-400/16 blur-3xl" />
      <span className="pointer-events-none absolute -bottom-12 left-10 h-28 w-28 rounded-full bg-cyan-300/10 blur-3xl" />
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(125,211,252,1) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
    </>
  );
}

function StepRail() {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {STEPS.map(({ n, label, note, g }, idx) => (
        <div
          key={n}
          className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.055] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        >
          {idx < STEPS.length - 1 && (
            <span className="pointer-events-none absolute right-[-18px] top-1/2 hidden h-px w-9 bg-gradient-to-r from-sky-300/45 to-transparent sm:block" />
          )}
          <div className="flex items-center gap-2.5 sm:flex-col sm:items-start">
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${g} text-[11px] font-black text-white shadow-[0_8px_18px_rgba(14,165,233,0.24)]`}
            >
              {n}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold leading-tight text-white">{label}</p>
              <p className="mt-0.5 text-[10.5px] font-medium leading-snug text-sky-100/50">{note}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PartnershipStatusCard({ showCta = true, edge = false }: PartnershipStatusCardProps) {
  const { ready, user } = useFirebaseAuthState();
  const [status, setStatus] = useState<CardStatus>("loading");
  const [totalSpent, setTotalSpent] = useState(0);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setStatus("guest");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const q = query(
          collection(db, "orders"),
          where("uid", "==", user.uid),
          orderBy("createdAt", "desc"),
        );
        const snap = await getDocs(q);
        const total = snap.docs.reduce((sum, doc) => {
          const d = doc.data();
          return sum + Number(d.totalAmount || d.total || 0);
        }, 0);

        if (!cancelled) {
          setTotalSpent(total);
          setStatus(total >= PARTNER_THRESHOLD_UAH ? "active" : "pending");
        }
      } catch {
        if (!cancelled) setStatus("guest");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  const progress = Math.min(totalSpent / PARTNER_THRESHOLD_UAH, 1);
  const pct = Math.round(progress * 100);
  const remaining = Math.max(PARTNER_THRESHOLD_UAH - totalSpent, 0);
  const outerClass = edge ? "" : "p-5 sm:p-6";
  const stripClass = edge ? edgeStripClass : darkStripClass;
  const contentClass = edge ? "page-shell-inline relative z-10" : "relative z-10";

  if (status === "loading") {
    return (
      <div className={outerClass}>
        <div className={stripClass}>
          <StripGlow />
          <div className={`${contentClass} flex items-center gap-4`}>
            <div className="h-10 w-10 animate-pulse rounded-[12px] bg-sky-300/15" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-sky-200/18" />
              <div className="h-2 w-1/2 animate-pulse rounded-full bg-sky-200/12" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "guest") {
    return (
      <div className={outerClass}>
        <div className={stripClass}>
          <StripGlow />
          <div className={`${contentClass} grid gap-4 ${showCta ? "lg:grid-cols-[minmax(0,1fr)_auto]" : ""} lg:items-center`}>
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-300/78">
                    Шлях до партнерства
                  </p>
                  <h2 className="mt-1 text-[1.05rem] font-black tracking-[-0.02em] text-white">
                    4 прості кроки до партнерської знижки
                  </h2>
                </div>
                <p className="max-w-[260px] text-[11.5px] font-medium leading-relaxed text-sky-100/58 lg:text-right">
                  Без заявок, внесків і ручного підтвердження.
                </p>
              </div>
              <StepRail />
            </div>

            {showCta ? (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("openAuthModal", { detail: { initialMode: "register" } }))}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-sky-300/36 bg-[linear-gradient(135deg,rgba(7,89,133,0.95),rgba(14,165,233,0.90)_52%,rgba(56,189,248,0.84))] px-4 py-2.5 text-[12px] font-bold text-white shadow-[0_10px_24px_rgba(14,165,233,0.24)] transition-[border-color,box-shadow,filter] duration-200 hover:border-sky-200/70 hover:brightness-110 hover:shadow-[0_14px_30px_rgba(14,165,233,0.32)]"
              >
                <LogIn size={13} strokeWidth={2.2} />
                Почати
                <ChevronRight size={12} strokeWidth={2.2} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className={outerClass}>
        <div className={stripClass}>
          <StripGlow />
          <div className={`${contentClass} grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center`}>
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative shrink-0">
                <span className="absolute -inset-2 rounded-full bg-emerald-300/20 blur-lg" />
                <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-[15px] border border-emerald-300/28 bg-emerald-400/12 text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                  <Handshake size={22} strokeWidth={1.7} />
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[1.05rem] font-black tracking-tight text-white">Ви партнер PartsON</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/24 bg-emerald-400/12 px-2.5 py-0.5 text-[10px] font-bold text-emerald-200">
                    <BadgeCheck size={9} strokeWidth={2.5} />
                    Активовано
                  </span>
                </div>
                <p className="mt-0.5 text-[12.5px] font-medium text-sky-100/58">
                  Знижка <span className="font-bold text-emerald-200">{PARTNER_DISCOUNT_PERCENT}%</span> застосовується до кожного замовлення автоматично.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 lg:min-w-[220px]">
              {STEPS.map(({ n, g }) => (
                <span
                  key={n}
                  className={`inline-flex h-9 items-center justify-center rounded-xl bg-gradient-to-br ${g} shadow-[0_8px_18px_rgba(14,165,233,0.20)]`}
                >
                  <BadgeCheck size={13} strokeWidth={2.5} className="text-white" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={outerClass}>
      <div className={stripClass}>
        <StripGlow />
        <div className={`${contentClass} grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center`}>
          <div className="shrink-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.20em] text-sky-300/78">Ваш прогрес</p>
            <div className="mt-1 flex items-end gap-1">
              <span className="text-[1.75rem] font-black leading-none tracking-tight text-white">
                {Math.round(totalSpent).toLocaleString("uk-UA")}
              </span>
              <span className="mb-0.5 text-[12px] font-bold text-sky-100/52">грн</span>
              <span className="mb-0.5 ml-0.5 text-[12px] font-medium text-sky-100/42">/ {PARTNER_THRESHOLD_UAH}</span>
            </div>
            <p className="mt-2 text-[11.5px] font-medium leading-relaxed text-sky-100/54">
              До автоматичної активації партнерського статусу.
            </p>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-4">
              {STEPS.map(({ n, label, g }, idx) => {
                const stepDone = idx === 0 || (idx === 1 && progress > 0);
                return (
                  <div
                    key={n}
                    className={`rounded-2xl border px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${
                      stepDone ? "border-white/[0.12] bg-white/[0.075]" : "border-white/[0.07] bg-white/[0.035]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 sm:flex-col sm:items-start">
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          stepDone
                            ? `bg-gradient-to-br ${g} shadow-[0_8px_18px_rgba(14,165,233,0.22)]`
                            : "border border-white/[0.10] bg-white/[0.06]"
                        } text-[11px] font-black ${stepDone ? "text-white" : "text-sky-100/40"}`}
                      >
                        {stepDone ? <BadgeCheck size={13} strokeWidth={2.5} /> : n}
                      </span>
                      <p className={`text-[11.5px] font-extrabold leading-tight ${stepDone ? "text-white" : "text-sky-100/45"}`}>
                        {label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-200">
                <TrendingUp size={10} strokeWidth={2.2} />
                {pct}% виконано
              </span>
              <span className="text-[11px] font-semibold text-sky-100/52">
                Залишилось{" "}
                <span className="font-bold text-white">{Math.round(remaining).toLocaleString("uk-UA")} грн</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
