import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Перевірка підпису від Telegram
function checkTelegramAuth(data) {
  const secret = crypto.createHash("sha256").update(process.env.BOT_TOKEN).digest();
  const checkString = Object.keys(data)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");

  const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
  return hmac === data.hash;
}

// 🚀 Маршрут авторизації
app.post("/auth/telegram", (req, res) => {
  const userData = req.body;

  if (!userData || !userData.hash) {
    return res.status(400).json({ error: "Немає даних для авторизації" });
  }

  // Перевіряємо дані
  if (!checkTelegramAuth(userData)) {
    return res.status(403).json({ error: "Невірний підпис Telegram" });
  }

  console.log("✅ Авторизований користувач:", userData);

  // Тут ти можеш:
  // 1. Зберегти користувача в базу
  // 2. Видати JWT-токен для сесії
  // 3. Відповісти фронту
  res.json({
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ Auth сервер запущений на http://localhost:${PORT}`);
});
