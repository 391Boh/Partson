import { PROFILE_RARITIES, type ProfileRarity } from "app/lib/profile-appearance";

const MAX_LEVEL = 5;

/** Grade chip: five pips filled up to the style's level, plus its name. */
export function ProfileRarityBadge({ rarity }: { rarity: ProfileRarity }) {
  const { label, level } = PROFILE_RARITIES[rarity];
  return (
    <span className="profile-rarity" data-rarity={rarity}>
      <span className="profile-rarity-pips" aria-hidden="true">
        {Array.from({ length: MAX_LEVEL }, (_, index) => (
          <span key={index} data-on={index < level} />
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}
