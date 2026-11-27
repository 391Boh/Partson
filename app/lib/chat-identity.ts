// Chat identity (27.11.2026): a chat thread belongs to the visitor's Firebase
// uid, so Firestore rules can let each visitor read only their own messages.
// Guests get an anonymous Firebase account, created only when they actually
// open the chat (or come back with an earlier thread) — never for every page
// view. Anonymous sessions stay invisible to the rest of the site (the auth
// state hook reports them as guests).
//
// An earlier thread kept under a localStorage id ("chat_user_id": the old
// "user_<uuid>" guest id, or an anonymous uid from before a sign-in) is moved
// onto the current uid once by POST /api/chat/claim.

export const CHAT_IDENTITY_EVENT = "partson:chatIdentity";
const CHAT_ID_KEY = "chat_user_id";
const CHECKED_KEY = "chat_legacy_checked";

const readStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

const legacyHasMessages = async (legacyId: string) => {
  try {
    const response = await fetch("/api/chat/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", legacyId }),
    });
    const payload = (await response.json().catch(() => null)) as { hasMessages?: boolean } | null;
    return Boolean(payload?.hasMessages);
  } catch {
    return false;
  }
};

/** Moves a thread kept under `legacyId` onto the signed-in caller. */
export const claimChatThread = async (
  user: { uid: string; getIdToken: () => Promise<string> },
  legacyId: string | null | undefined
) => {
  const id = (legacyId || "").trim();
  if (!id || id === user.uid) return true;
  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/chat/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "claim", legacyId: id }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

let resolving: Promise<string | null> | null = null;

/**
 * The chat uid for this browser.
 * create=true (the chat window is open): signs a guest in anonymously.
 * create=false (background unread/presence): only when this browser already
 * has a thread; otherwise null and nothing is created.
 */
export const resolveChatUserId = (create: boolean): Promise<string | null> => {
  if (create && resolving) {
    return resolving.then((uid) => uid ?? resolveChatUserIdNow(true));
  }
  resolving ??= resolveChatUserIdNow(create).finally(() => {
    resolving = null;
  });
  return resolving;
};

const resolveChatUserIdNow = async (create: boolean): Promise<string | null> => {
  const [{ auth }, { signInAnonymously }] = await Promise.all([
    import("./firebase-auth"),
    import("firebase/auth"),
  ]);
  await auth.authStateReady();
  const legacyId = (readStorage(CHAT_ID_KEY) || "").trim();
  let user = auth.currentUser;

  if (!user) {
    if (!create) {
      if (!legacyId || readStorage(CHECKED_KEY) === legacyId) return null;
      const hasThread = await legacyHasMessages(legacyId);
      writeStorage(CHECKED_KEY, legacyId);
      if (!hasThread) return null;
    }
    user = (await signInAnonymously(auth)).user;
  }

  if (legacyId && legacyId !== user.uid) {
    if (await claimChatThread(user, legacyId)) writeStorage(CHAT_ID_KEY, user.uid);
  } else if (!legacyId) {
    writeStorage(CHAT_ID_KEY, user.uid);
  }
  // Lets the layout start unread counting/presence for a guest who has just
  // opened the chat, without waiting for the next page load.
  try {
    window.dispatchEvent(new CustomEvent(CHAT_IDENTITY_EVENT, { detail: { uid: user.uid } }));
  } catch {}
  return user.uid;
};
