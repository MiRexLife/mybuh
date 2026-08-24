import fs from "fs";

const TOKENS_FILE = new URL("./data/tokens.json", import.meta.url);

export function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE));
  } catch (e) {
    return null; // ещё не авторизовались
  }
}

export function saveTokens(tokens) {
  fs.mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
  fs.writeFileSync(
    TOKENS_FILE,
    JSON.stringify(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        // expires_in приходит в секундах — считаем абсолютное время истечения
        expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
      },
      null,
      2
    )
  );
}
