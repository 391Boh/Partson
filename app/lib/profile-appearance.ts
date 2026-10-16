import { ORDER_REWARDS } from "app/lib/order-rewards";

export type AvatarTier = "basic" | "partner" | "admin";
const AVATAR_IDS: Record<AvatarTier, readonly string[]> = {
  basic: ["wrench", "car", "cog", "gauge", "fuel", "battery", "brake", "key"],
  partner: ["partner-turbo", "partner-brake", "partner-piston", "partner-wheel", "partner-spark", "partner-speed"],
  admin: ["admin-crown-gear", "admin-flag", "admin-shield", "admin-wheel"],
};
export function getProfileAvatarTier(id: unknown): AvatarTier | null {
  if (typeof id !== "string") return null;
  return (Object.keys(AVATAR_IDS) as AvatarTier[]).find(tier => AVATAR_IDS[tier].includes(id)) ?? null;
}
export const PROFILE_AVATAR_FRAMES = ORDER_REWARDS.map(reward => ({
  ...reward,
  finish: ({ teal: "Бірюза", blue: "Синя сталь", violet: "Аметист", copper: "Мідь", silver: "Платина", gold: "Золото" })[reward.tone],
}));
export function findAvatarFrame(id: unknown) {
  return typeof id === "string" ? PROFILE_AVATAR_FRAMES.find(frame => frame.id === id) ?? null : null;
}
export function canUseAvatarFrame(id: string | null, totalSpent: number) {
  if (id === null) return true;
  const frame = findAvatarFrame(id);
  return !!frame && Number.isFinite(totalSpent) && totalSpent >= frame.threshold;
}

/** Tiny local vector covers: no remote images or additional image decoder work. */
export const PROFILE_BACKGROUNDS = [
  { id: "default", label: "Тихий графіт", threshold: 0, rewardLabel: "Доступний усім", image: "/profile-covers/graphite.svg" },
  ...ORDER_REWARDS.map((reward, index) => ({
    id: reward.id, label: ["Бірюзовий потік", "Синій горизонт", "Аметистова орбіта", "Мідний штрих", "Платиновий контур", "Золота лінія"][index],
    threshold: reward.threshold, rewardLabel: reward.label, image: `/profile-covers/${reward.tone}.svg`,
  })),
];
export function findProfileBackground(id: unknown) {
  return typeof id === "string" ? PROFILE_BACKGROUNDS.find(background => background.id === id) ?? null : null;
}
export function canUseProfileBackground(id: string | null, totalSpent: number) {
  if (id === null || id === "default") return true;
  const background = findProfileBackground(id);
  return !!background && Number.isFinite(totalSpent) && totalSpent >= background.threshold;
}
