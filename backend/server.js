import "dotenv/config";
import express from "express";
import cron from "node-cron";
import crypto from "crypto";
import { buildAuthUrl, exchangeCodeForToken } from "./sberClient.js";
import { loadTransactions } from "./txStore.js";
import { runSync } from "./sync.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Разрешаем фронтенд-инструменту (артефакту в браузере) обращаться сюда.
// Для продакшена лучше сузить origin до конкретного домена вместо "*".
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  next();
});

// Шаг 1: откройте в браузере, чтобы один раз авторизоваться через СберБизнес ID.
app.get("/auth", (req, res) => {
  const state = crypto.randomBytes(8).toString("hex");
  res.redirect(buildAuthUrl(state));
});

// Шаг 2: Sber возвращает пользователя сюда с ?code=...
app.get("/oauth/callback", async (req, res) => {
  try {
    await exchangeCodeForToken(req.query.code);
    res.send("Авторизация прошла успешно. Токены сохранены, можно закрыть эту вкладку.");
  } catch (e) {
    res.status(500).send(`Ошибка авторизации: ${e.message}`);
  }
});

// Эндпоинт для фронтенда: отдаёт накопленные операции.
// Защищён простым ключом — передавайте его в заголовке Authorization: Bearer <LOCAL_API_KEY>.
app.get("/api/transactions", (req, res) => {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.LOCAL_API_KEY}`) {
    return res.status(401).json({ error: "Неверный ключ доступа" });
  }
  const since = req.query.since; // YYYY-MM-DD, опционально
  let list = loadTransactions();
  if (since) list = list.filter((t) => t.date >= since);
  res.json({ transactions: list });
});

// Ручной запуск синхронизации (например, для проверки после первой авторизации).
app.post("/api/sync-now", async (req, res) => {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.LOCAL_API_KEY}`) {
    return res.status(401).json({ error: "Неверный ключ доступа" });
  }
  try {
    const count = await runSync();
    res.json({ ok: true, newTransactions: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Автоматическая синхронизация раз в день в 07:00.
cron.schedule("0 7 * * *", () => {
  console.log("Плановая синхронизация...");
  runSync().catch((e) => console.error("Ошибка плановой синхронизации:", e.message));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  console.log(`Для первой авторизации откройте http://localhost:${PORT}/auth`);
});
