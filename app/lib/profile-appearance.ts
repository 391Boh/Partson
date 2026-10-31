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
/** Grades shown on every style: each step up adds a visible effect, not only a colour. */
export type ProfileRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "exclusive";
export const PROFILE_RARITIES: Record<ProfileRarity, { label: string; level: number }> = {
  common: { label: "Звичайна", level: 1 },
  uncommon: { label: "Незвичайна", level: 2 },
  rare: { label: "Рідкісна", level: 3 },
  epic: { label: "Епічна", level: 4 },
  legendary: { label: "Легендарна", level: 5 },
  exclusive: { label: "Ексклюзивна", level: 5 },
};
const REWARD_STYLES = {
  teal: { rarity: "uncommon", finish: "Бірюза", frameFeature: "Перелив, що повільно обертається", backgroundFeature: "Хвилі потоку" },
  blue: { rarity: "uncommon", finish: "Синя сталь", frameFeature: "Шкала, як на тахометрі", backgroundFeature: "Траса до горизонту" },
  violet: { rarity: "rare", finish: "Аметист", frameFeature: "Подвійне кільце й сяйво", backgroundFeature: "Орбіти й зорі" },
  copper: { rarity: "rare", finish: "Мідь", frameFeature: "Брашована мідь із жаром", backgroundFeature: "Топографічні лінії" },
  silver: { rarity: "epic", finish: "Платина", frameFeature: "Дзеркальний відблиск", backgroundFeature: "Креслення гальмівного диска" },
  gold: { rarity: "legendary", finish: "Золото", frameFeature: "Ореол та іскри", backgroundFeature: "Промені, іскри й золотий відблиск" },
} as const satisfies Record<(typeof ORDER_REWARDS)[number]["tone"], {
  rarity: ProfileRarity; finish: string; frameFeature: string; backgroundFeature: string;
}>;
export const DEFAULT_FRAME_STYLE = { rarity: "common", finish: "Класична", feature: "Рівний обідок" } as const;

export const PROFILE_AVATAR_FRAMES = ORDER_REWARDS.map(reward => ({
  ...reward,
  finish: REWARD_STYLES[reward.tone].finish,
  rarity: REWARD_STYLES[reward.tone].rarity,
  feature: REWARD_STYLES[reward.tone].frameFeature,
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
  // `-v2`: covers are served immutable, so a redrawn cover needs a new URL.
  { id: "default", label: "Тихий графіт", threshold: 0, rewardLabel: "Доступний усім", image: "/profile-covers/graphite-v2.svg", tone: "graphite",
    rarity: DEFAULT_FRAME_STYLE.rarity as ProfileRarity, feature: "Тонка точкова сітка" },
  ...ORDER_REWARDS.map((reward, index) => ({
    id: reward.id, label: ["Бірюзовий потік", "Синій горизонт", "Аметистова орбіта", "Мідний штрих", "Платиновий контур", "Золота лінія"][index],
    threshold: reward.threshold, rewardLabel: reward.label, image: `/profile-covers/${reward.tone}-v2.svg`, tone: reward.tone as string,
    rarity: REWARD_STYLES[reward.tone].rarity as ProfileRarity, feature: REWARD_STYLES[reward.tone].backgroundFeature,
  })),
];
export function findProfileBackground(id: unknown) {
  return typeof id === "string" ? PROFILE_BACKGROUNDS.find(background => background.id === id) ?? null : null;
}
/** Palette name for `data-profile-theme`: the profile window and the home greeting follow the chosen cover. */
export function getProfileTheme(id: unknown) {
  return (findProfileBackground(id) ?? PROFILE_BACKGROUNDS[0]).tone;
}
export function canUseProfileBackground(id: string | null, totalSpent: number) {
  if (id === null || id === "default") return true;
  const background = findProfileBackground(id);
  return !!background && Number.isFinite(totalSpent) && totalSpent >= background.threshold;
}
