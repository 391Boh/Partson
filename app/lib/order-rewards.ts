import { PARTNER_THRESHOLD_UAH } from "app/lib/partnership-discount";

/** Recognition milestones only. Pricing continues to use the partner rules. */
export const ORDER_REWARDS = [
  { id: "partner", label: "Партнер", threshold: PARTNER_THRESHOLD_UAH, tone: "teal" },
  { id: "regular", label: "Свій у гаражі", threshold: 5_000, tone: "blue" },
  { id: "enthusiast", label: "Знавець", threshold: 10_000, tone: "violet" },
  { id: "master", label: "Майстер", threshold: 25_000, tone: "copper" },
  { id: "expert", label: "Експерт", threshold: 50_000, tone: "silver" },
  { id: "legend", label: "Легенда PartsON", threshold: 100_000, tone: "gold" },
] as const;

export type OrderReward = (typeof ORDER_REWARDS)[number];

export function getOrderRewardProgress(amount: number) {
  const totalSpent = Number.isFinite(amount)
    ? Math.round(Math.min(Math.max(amount, 0), Number.MAX_SAFE_INTEGER / 100) * 100) / 100
    : 0;
  const earned = ORDER_REWARDS.filter((reward) => totalSpent >= reward.threshold);
  const current = earned.at(-1) ?? null;
  const next = ORDER_REWARDS.find((reward) => totalSpent < reward.threshold) ?? null;
  const start = current?.threshold ?? 0;
  const remaining = next ? Math.round((next.threshold - totalSpent) * 100) / 100 : 0;
  const progress = next ? Math.max(0, Math.min(100, (totalSpent - start) / (next.threshold - start) * 100)) : 100;

  return { totalSpent, earned, current, next, remaining, progress };
}
