"use client";

import { Fingerprint } from "lucide-react";

export default function VinOpenButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("openAccountVin"))}
      className="inline-flex min-h-11 w-full items-center gap-2 rounded-[13px] border border-indigo-100 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-sm transition-[border-color,background-color,color] duration-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 cursor-pointer"
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-600">
        <Fingerprint size={14} aria-hidden />
      </span>
      <span>
        <span className="block text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-400">
          Підбір
        </span>
        За VIN і кодом
      </span>
    </button>
  );
}
