import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "app/lib/firebase-admin";
import { resolvePartnerStatusByUid } from "app/api/_lib/partner-auth";
import { canUseAvatarFrame, findAvatarFrame, getProfileAvatarTier, canUseProfileBackground, findProfileBackground } from "app/lib/profile-appearance";

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  let identity;
  try {
    if (!token) throw new Error("Missing token");
    identity = await getFirebaseAdminAuth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Увійдіть у профіль ще раз." }, { status: 401 });
  }
  let patch: Record<string, string | null>;
  try {
    const text = await request.text();
    if (text.length > 2048) throw new Error("Too large");
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
    const keys = Object.keys(body);
    if (!keys.length || keys.some(key => key !== "avatar" && key !== "avatarFrame" && key !== "profileBackground")) throw new Error("Invalid fields");
    if (keys.some(key => body[key] !== null && typeof body[key] !== "string")) throw new Error("Invalid values");
    if (body.avatar != null && !getProfileAvatarTier(body.avatar)) throw new Error("Invalid avatar");
    if (body.avatarFrame != null && !findAvatarFrame(body.avatarFrame)) throw new Error("Invalid frame");
    if (body.profileBackground != null && !findProfileBackground(body.profileBackground)) throw new Error("Invalid background");
    patch = body;
  } catch {
    return NextResponse.json({ error: "Некоректні налаштування оформлення." }, { status: 400 });
  }
  try {
    const userRef = getFirebaseAdminDb().collection("users").doc(identity.uid);
    const tier = getProfileAvatarTier(patch.avatar);
    // Basic avatars and resetting a frame never wait for order history.
    if (tier === "admin" || tier === "partner") {
      const user = await userRef.get();
      const envAdmin = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").some(email => !!identity.email && email.trim().toLowerCase() === identity.email.toLowerCase());
      const isAdmin = envAdmin || user.data()?.role === "admin";
      if (!isAdmin && (tier === "admin" || !(await resolvePartnerStatusByUid(identity.uid)).isPartner)) {
        return NextResponse.json({ error: "Цей аватар недоступний для вашого профілю." }, { status: 403 });
      }
    }
    if (patch.avatarFrame && !canUseAvatarFrame(patch.avatarFrame, (await resolvePartnerStatusByUid(identity.uid)).totalSpent)) {
      return NextResponse.json({ error: "Ця рамка відкриється після досягнення потрібної суми замовлень." }, { status: 403 });
    }
    if (patch.profileBackground && findProfileBackground(patch.profileBackground)!.threshold > 0 &&
      !canUseProfileBackground(patch.profileBackground, (await resolvePartnerStatusByUid(identity.uid)).totalSpent)) {
      return NextResponse.json({ error: "Цей фон відкриється після досягнення потрібної суми замовлень." }, { status: 403 });
    }
    await userRef.set(patch, { merge: true });
    return NextResponse.json({ ok: true, ...patch }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Не вдалося зберегти стиль. Спробуйте ще раз." }, { status: 503 });
  }
}
