"use client";

import { ChevronRight, ShieldCheck } from "lucide-react";

// Opens the account modal on its VIN tab (Header handles "openAccountVin";
// a guest is asked to sign in first).
export default function HeroVinCheckButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("openAccountVin"))}
      className="home-part-path"
    >
      <span className="home-part-path-icon">
        <ShieldCheck size={20} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="home-part-path-text">
        <span className="home-part-path-title">Перевірка сумісності за VIN</span>
        <span className="home-part-path-hint">Додайте VIN у профілі — підтвердимо, що деталь підходить саме вашому авто</span>
      </span>
      <ChevronRight className="home-part-path-arrow" size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
