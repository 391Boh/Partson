/* eslint-disable @typescript-eslint/no-require-imports */
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const DEFAULT_AUTH_MAX_AGE_SECONDS = 24 * 60 * 60;

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue
      .replace(/^['"]|['"]$/g, "")
      .replace(/\\n/g, "\n");
  }
}

loadDotEnvLocal();

const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (!isProduction) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(bodyParser.json({ limit: "1mb" }));

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key?.replace(/\\n/g, "\n"),
    };
  }

  return {
    projectId:
      process.env.FIREBASE_ADMIN_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
}

function getFirebaseAdminAuth() {
  const existing = getApps()[0];
  if (!existing) {
    const serviceAccount = readServiceAccount();
    if (
      !serviceAccount.projectId ||
      !serviceAccount.clientEmail ||
      !serviceAccount.privateKey
    ) {
      throw new Error(
        "Firebase Admin env is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY.",
      );
    }

    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  return getAuth();
}

function checkTelegramAuth(data) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  if (!token) return false;
  const incomingHash = String(data.hash || "").trim();
  if (!/^[a-fA-F0-9]{64}$/.test(incomingHash)) return false;

  const secret = crypto.createHash("sha256").update(token).digest();
  const checkString = Object.keys(data)
    .filter((key) => key !== "hash" && data[key] != null)
    .sort()
    .map((key) => `${key}=${String(data[key])}`)
    .join("\n");

  const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
  const a = Buffer.from(hmac, "hex");
  const b = Buffer.from(incomingHash, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function toInteger(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

app.post("/auth/telegram", async (req, res) => {
  const userData = req.body;

  if (!userData || !userData.hash) {
    return res.status(400).json({ error: "Missing telegram auth payload" });
  }

  const authDate = toInteger(userData.auth_date);
  const userId = toInteger(userData.id);
  const firstName =
    typeof userData.first_name === "string" ? userData.first_name.trim() : "";

  if (!authDate || !userId || !firstName) {
    return res.status(400).json({ error: "Invalid telegram auth payload" });
  }

  const now = Math.floor(Date.now() / 1000);
  const maxAgeRaw = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS);
  const maxAgeSeconds =
    Number.isFinite(maxAgeRaw) && maxAgeRaw > 0
      ? Math.floor(maxAgeRaw)
      : DEFAULT_AUTH_MAX_AGE_SECONDS;

  if (now - authDate > maxAgeSeconds) {
    return res.status(403).json({ error: "Telegram auth payload is expired" });
  }

  if (!checkTelegramAuth(userData)) {
    return res.status(403).json({ error: "Invalid telegram signature" });
  }

  let firebaseToken = "";
  try {
    firebaseToken = await getFirebaseAdminAuth().createCustomToken(
      `telegram_${userId}`,
      {
        provider: "telegram",
        telegram_id: String(userId),
        telegram_username:
          typeof userData.username === "string" ? userData.username : "",
      },
    );
  } catch (error) {
    console.error("Failed to create Telegram Firebase custom token:", error);
    return res
      .status(500)
      .json({ error: "Firebase Admin is not configured for Telegram auth" });
  }

  return res.json({
    success: true,
    firebaseToken,
    user: {
      id: userId,
      first_name: firstName,
      username: typeof userData.username === "string" ? userData.username : undefined,
      photo_url:
        typeof userData.photo_url === "string" ? userData.photo_url : undefined,
    },
    link:
      typeof process.env.TELEGRAM_AUTH_REDIRECT_LINK === "string"
        ? process.env.TELEGRAM_AUTH_REDIRECT_LINK
        : null,
  });
});

app.use((err, _req, res, next) => {
  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin is not allowed" });
  }
  return next(err);
});

const PORT = Number(process.env.AUTH_PORT ?? process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`Auth server started on port ${PORT}`);
});
