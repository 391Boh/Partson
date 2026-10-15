"use client";

import { useId } from "react";
import { Award, BadgeCheck, Check, ChevronDown, Crown, Gem, Handshake, LockKeyhole, RefreshCw, ShieldCheck, Trophy, type LucideIcon } from "lucide-react";
import { ORDER_REWARDS, getOrderRewardProgress, type OrderReward } from "app/lib/order-rewards";

const money = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 });
const icons: Record<OrderReward["id"], LucideIcon> = {
  partner: Handshake,
  regular: BadgeCheck,
  enthusiast: Award,
  master: ShieldCheck,
  expert: Gem,
  legend: Crown,
};

type Props = {
  totalSpent: number | null;
  status: "loading" | "ready" | "error";
  onRetry: () => void;
};

export default function ProfileOrderRewards({ totalSpent, status, onRetry }: Props) {
  const titleId = useId();
  const progress = totalSpent === null ? null : getOrderRewardProgress(totalSpent);
  const ready = status === "ready" && progress !== null;
  const CurrentIcon = progress?.current ? icons[progress.current.id] : Trophy;

  return (
    <section className="profile-rewards" aria-labelledby={titleId} aria-busy={status === "loading"}>
      {!ready && <div className="profile-rewards-heading">
        <h3 id={titleId}>Мої нагороди</h3>
      </div>}

      {!ready ? (
        <div className="profile-rewards-state" role="status">
          <Trophy size={24} aria-hidden="true" />
          <div>
            <p>{status === "error" ? "Не вдалося завантажити нагороди" : "Завантажуємо ваші нагороди…"}</p>
            <span>{status === "error" ? "Спробуйте ще раз, щоб побачити актуальний прогрес." : "Перевіряємо суму ваших замовлень."}</span>
          </div>
          {status === "error" && <button type="button" onClick={onRetry} className="profile-rewards-retry"><RefreshCw size={16} aria-hidden="true" />Повторити</button>}
        </div>
      ) : (
        <details className="profile-rewards-disclosure">
          <summary className="profile-rewards-summary">
            <span className="profile-rewards-summary-heading">
              <span id={titleId}>Мої нагороди</span>
              <span className="profile-rewards-count">{progress.earned.length} із {ORDER_REWARDS.length}</span>
              <ChevronDown size={17} className="profile-rewards-chevron" aria-hidden="true" />
            </span>
          <div className="profile-rewards-current" data-tone={progress.current?.tone ?? "teal"}>
            <span className="profile-reward-emblem" aria-hidden="true"><CurrentIcon size={25} strokeWidth={1.7} /></span>
            <div>
              <p>{progress.current?.label ?? "Перші кілометри попереду"}</p>
              <span>Сума замовлень: <strong>{money.format(progress.totalSpent)} грн</strong></span>
            </div>
          </div>

          <div className="profile-rewards-progress">
            <p id={`${titleId}-progress`}>
              {progress.next ? <>До «{progress.next.label}» — ще <strong>{money.format(progress.remaining)} грн</strong></> : "Усі нагороди відкрито. Дякуємо, що обираєте PartsON!"}
            </p>
            <div role="progressbar" aria-labelledby={`${titleId}-progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.progress)} aria-valuetext={progress.next ? `До нагороди «${progress.next.label}» залишилось ${money.format(progress.remaining)} грн` : "Усі нагороди отримано"} className="profile-rewards-track">
              <span style={{ transform: `scaleX(${progress.progress / 100})` }} />
            </div>
          </div>

          </summary>
          <ul className="profile-rewards-list" aria-label="Нагороди за суму замовлень">
            {ORDER_REWARDS.map((reward) => {
              const unlocked = progress.totalSpent >= reward.threshold;
              const Icon = icons[reward.id];
              return (
                <li key={reward.id} className="profile-reward" data-tone={reward.tone} data-unlocked={unlocked} aria-current={progress.current?.id === reward.id ? "step" : undefined}>
                  <span className="profile-reward-medal" aria-hidden="true">
                    <Icon size={22} strokeWidth={1.7} />
                    <span className="profile-reward-status">{unlocked ? <Check size={10} strokeWidth={3} /> : <LockKeyhole size={9} />}</span>
                  </span>
                  <span className="profile-reward-copy">
                    <span className="profile-reward-name">{reward.label}</span>
                    <span className="profile-reward-threshold">{money.format(reward.threshold)} грн</span>
                    <span className="sr-only">{unlocked ? "Отримано" : "Ще не отримано"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
