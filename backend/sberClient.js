import fetch from "node-fetch";
import { loadTokens, saveTokens } from "./tokenStore.js";

const {
  SBER_CLIENT_ID,
  SBER_CLIENT_SECRET,
  SBER_REDIRECT_URI,
  SBER_AUTH_BASE_URL,
  SBER_API_BASE_URL,
} = process.env;

// Шаг 1: URL, на который отправляем пользователя логиниться через СберБизнес ID.
// Точный путь авторизации и набор scope уточните в личном кабинете developers.sber.ru —
// он выдаётся вместе с client_id при регистрации приложения.
export function buildAuthUrl(state) {
  const url = new URL(`${SBER_AUTH_BASE_URL}/ic/authorize`);
  url.searchParams.set("client_id", SBER_CLIENT_ID);
  url.searchParams.set("redirect_uri", SBER_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "statement"); // уточните точное имя scope в кабинете разработчика
  url.searchParams.set("state", state);
  return url.toString();
}

// Шаг 2: обмен authorization code на access/refresh токены.
export async function exchangeCodeForToken(code) {
  const res = await fetch(`${SBER_AUTH_BASE_URL}/ic/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SBER_REDIRECT_URI,
      client_id: SBER_CLIENT_ID,
      client_secret: SBER_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Обмен кода на токен не удался: ${res.status} ${await res.text()}`);
  const tokens = await res.json();
  saveTokens(tokens);
  return tokens;
}

async function refreshAccessToken(refresh_token) {
  const res = await fetch(`${SBER_AUTH_BASE_URL}/ic/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
      client_id: SBER_CLIENT_ID,
      client_secret: SBER_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Обновление токена не удалось: ${res.status} ${await res.text()}`);
  const tokens = await res.json();
  saveTokens(tokens);
  return tokens;
}

// Возвращает валидный access_token, обновляя его при необходимости.
export async function getValidAccessToken() {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error("Ещё не авторизованы. Откройте /auth в браузере и войдите через СберБизнес ID.");
  }
  const soonToExpire = Date.now() > tokens.expires_at - 60_000;
  if (!soonToExpire) return tokens.access_token;
  const fresh = await refreshAccessToken(tokens.refresh_token);
  return fresh.access_token;
}

// Выписка за один день, с пагинацией. dateStr в формате YYYY-MM-DD.
export async function fetchStatementForDate(dateStr, accountNumber) {
  const accessToken = await getValidAccessToken();
  const all = [];
  let page = 1;
  while (true) {
    const url = new URL(`${SBER_API_BASE_URL}/fintech/api/v2/statement/transactions`);
    url.searchParams.set("accountNumber", accountNumber);
    url.searchParams.set("statementDate", dateStr);
    url.searchParams.set("page", String(page));

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Sber API вернул ошибку ${res.status} за ${dateStr}: ${await res.text()}`);
    }
    const data = await res.json();

    // TODO: сверьте с реальным ответом API и поправьте под точную структуру —
    // разные версии документации по-разному называют поле со списком операций.
    const items = data.transactions || data.items || data.operations || [];
    all.push(...items);

    if (items.length < 100) break; // последняя страница
    page += 1;

    // Sber просит не чаще одного запроса в 2 секунды между вызовами API.
    await new Promise((r) => setTimeout(r, 2100));
  }
  return all;
}
