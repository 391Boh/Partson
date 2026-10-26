// Exterior panorama linked to the owner’s interior tour, verified at the PartsON entrance.
// Preserve the complete Google identifier; a raw photo ID can resolve to another panorama.
const PANORAMA_ID = "CAoSHENJQUJJaERweU82YUFqUGxzLVlzYjl1U2lUTm0=";
export const STORE_TOUR_EMBED_URL = `https://www.google.com/maps/embed?pb=!6m8!1m7!1s${encodeURIComponent(PANORAMA_ID)}!2m2!1d49.8146253!2d23.9896342!3f160!4f0!5f0.7820865974627469&hl=uk`;
export const STORE_TOUR_URL = `https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(PANORAMA_ID)}&heading=160&pitch=0`;
