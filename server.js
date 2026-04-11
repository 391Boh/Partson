/* eslint-disable @typescript-eslint/no-require-imports */
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
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

function checkTelegramAuth(data) {
  if (!process.env.BOT_TOKEN) return false;

  const secret = crypto.createHash("sha256").update(process.env.BOT_TOKEN).digest();
  const checkString = Object.keys(data)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("\n");

  const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
  return hmac === data.hash;
}

app.post("/auth/telegram", (req, res) => {
  const userData = req.body;

  if (!userData || !userData.hash) {
    return res.status(400).json({ error: "Missing telegram auth payload" });
  }

  if (!checkTelegramAuth(userData)) {
    return res.status(403).json({ error: "Invalid telegram signature" });
  }

  return res.json({
    success: true,
    user: {
      id: userData.id,
      first_name: userData.first_name,
      username: userData.username,
      photo_url: userData.photo_url,
    },
    token: "jwt_or_session_token_here",
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
