// Layout hint only: lets a verified partner's catalog cards reserve the promo
// price layout before the partner prices arrive, instead of first drawing the
// public "−N% партнерам" teaser and then rebuilding the price row. It never
// carries a price and never grants one — prices, the cart and checkout still
// use only the server-verified partner response.
export const PARTNER_PRICE_HINT_KEY = "partson:partner-hint";
export const PARTNER_PRICE_HINT_ATTRIBUTE = "data-partner-hint";
const PARTNER_PRICE_HINT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const setDocumentHint = (on: boolean) => {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute(PARTNER_PRICE_HINT_ATTRIBUTE, on);
};

/** Records the outcome of a verified partner check for the signed-in user. */
export function rememberPartnerPriceHint(isPartner: boolean, uid?: string | null) {
  try {
    const userId = uid ?? localStorage.getItem("user_id");
    if (isPartner && userId) {
      localStorage.setItem(PARTNER_PRICE_HINT_KEY, JSON.stringify({ uid: userId, savedAt: Date.now() }));
    } else {
      localStorage.removeItem(PARTNER_PRICE_HINT_KEY);
    }
  } catch {
    // Storage blocked: the cards simply skip the reserved layout.
  }
  setDocumentHint(isPartner);
}

export function clearPartnerPriceHint() {
  try {
    localStorage.removeItem(PARTNER_PRICE_HINT_KEY);
  } catch {
    // ignore
  }
  setDocumentHint(false);
}

/** Inline <head> script: applies the hint before first paint. */
export const partnerPriceHintBootstrap = `(function(){try{var h=JSON.parse(localStorage.getItem(${JSON.stringify(
  PARTNER_PRICE_HINT_KEY
)})||"null");var u=localStorage.getItem("user_id");if(h&&u&&h.uid===u&&Date.now()-h.savedAt<${PARTNER_PRICE_HINT_TTL_MS})document.documentElement.setAttribute(${JSON.stringify(
  PARTNER_PRICE_HINT_ATTRIBUTE
)},"")}catch(e){}})();`;
