"use client";

import Link from "next/link";
import { useFirebaseAuthState } from "app/lib/firebase-auth-state";
import { LogIn, ShoppingCart, Handshake } from "lucide-react";

export default function PartnershipCtaClient() {
  const { ready, user } = useFirebaseAuthState();

  if (!ready) {
    return <div className="h-11 w-64 animate-pulse rounded-2xl bg-white/10" />;
  }

  if (user) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/katalog"
          className="inline-flex items-center gap-2 rounded-2xl border border-sky-300/40 bg-[image:linear-gradient(135deg,rgba(7,89,133,0.96)_0%,rgba(14,165,233,0.92)_52%,rgba(56,189,248,0.88)_100%)] px-6 py-3 text-sm font-bold tracking-wide text-white shadow-[0_10px_24px_rgba(14,165,233,0.26)] transition-[border-color,box-shadow,filter] duration-200 hover:border-sky-200/70 hover:shadow-[0_16px_36px_rgba(14,165,233,0.34)] hover:brightness-110"
        >
          <ShoppingCart size={17} strokeWidth={1.8} />
          Перейти до каталогу
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("openAuthModal", {
              detail: { initialMode: "register", initialAccountTab: null },
            })
          )
        }
        className="inline-flex items-center gap-2 rounded-2xl border border-sky-300/40 bg-[image:linear-gradient(135deg,rgba(7,89,133,0.96)_0%,rgba(14,165,233,0.92)_52%,rgba(56,189,248,0.88)_100%)] px-6 py-3 text-sm font-bold tracking-wide text-white shadow-[0_10px_24px_rgba(14,165,233,0.26)] transition-[border-color,box-shadow,filter] duration-200 hover:border-sky-200/70 hover:shadow-[0_16px_36px_rgba(14,165,233,0.34)] hover:brightness-110"
      >
        <Handshake size={17} strokeWidth={1.8} />
        Зареєструватись
      </button>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("openAuthModal", {
              detail: { initialMode: "login", initialAccountTab: null },
            })
          )
        }
        className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/[0.09] px-6 py-3 text-sm font-bold tracking-wide text-sky-100 backdrop-blur-sm transition-[border-color,background-color,color,box-shadow] duration-200 hover:border-white/32 hover:bg-white/[0.14] hover:text-white hover:shadow-[0_10px_22px_rgba(255,255,255,0.08)]"
      >
        <LogIn size={17} strokeWidth={1.8} />
        Увійти
      </button>
    </div>
  );
}
