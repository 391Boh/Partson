// Layout hint only: lets an admin's product page reserve the admin bar's row
// (ProductPageAdminEditPanel) before the client knows who is signed in,
// instead of pushing the page down 42px once it mounts. It reads the same
// localStorage flag ProductPageAdminEditGate trusts for showing the bar and
// grants nothing — every admin action is still verified by the server.
export const ADMIN_LAYOUT_HINT_ATTRIBUTE = "data-admin-hint";

export function setAdminLayoutHint(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute(ADMIN_LAYOUT_HINT_ATTRIBUTE, on);
}

/** Inline <head> script: applies the hint before first paint. */
export const adminLayoutHintBootstrap = `(function(){try{var u=localStorage.getItem("user_id");if(u&&localStorage.getItem("partson:isAdmin:"+u)==="1")document.documentElement.setAttribute(${JSON.stringify(
  ADMIN_LAYOUT_HINT_ATTRIBUTE
)},"")}catch(e){}})();`;
