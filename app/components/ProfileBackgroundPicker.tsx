"use client";

import { Check, Lock } from "lucide-react";
import { PROFILE_BACKGROUNDS } from "app/lib/profile-appearance";

export function ProfileBackgroundPicker({ selectedId, totalSpent, saving, onSelect }: {
  selectedId: string | null; totalSpent: number | null; saving: boolean;
  onSelect: (id: string | null) => void;
}) {
  return <div className="profile-background-picker">
    <p className="profile-frame-hint">Мінімалістичний фон для вашого профілю. Нові стилі відкриваються за сумою замовлень.</p>
    <div className="profile-background-grid">
      {PROFILE_BACKGROUNDS.map(background => {
        const selected = (selectedId ?? "default") === background.id;
        const unlocked = background.threshold === 0 || (totalSpent !== null && totalSpent >= background.threshold);
        return <button key={background.id} type="button" className="profile-background-option"
          aria-pressed={selected} disabled={saving || !unlocked}
          aria-label={`${background.label}${!unlocked ? ` — від ${background.threshold.toLocaleString("uk-UA")} грн` : ""}`}
          onClick={() => onSelect(background.id === "default" ? null : background.id)}>
          <span className="profile-background-swatch" style={{ backgroundImage: `url("${background.image}")` }} aria-hidden="true">
            <span className="profile-background-sample" />
            {(selected || !unlocked) && <span className="profile-background-marker">{selected ? <Check size={14} /> : <Lock size={13} />}</span>}
          </span>
          <span className="profile-background-label"><strong>{background.label}</strong><span>{background.threshold ? `${background.rewardLabel} · ${background.threshold.toLocaleString("uk-UA")} грн` : background.rewardLabel}</span></span>
        </button>;
      })}
    </div>
  </div>;
}
