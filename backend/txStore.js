import fs from "fs";

const TX_FILE = new URL("./data/transactions.json", import.meta.url);
const SYNC_STATE_FILE = new URL("./data/sync-state.json", import.meta.url);

export function loadTransactions() {
  try {
    return JSON.parse(fs.readFileSync(TX_FILE));
  } catch (e) {
    return [];
  }
}

function ensureDataDir() {
  fs.mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
}

export function saveTransactions(list) {
  ensureDataDir();
  fs.writeFileSync(TX_FILE, JSON.stringify(list, null, 2));
}

// Добавляет новые операции, отбрасывая дубликаты по id.
export function mergeTransactions(existing, incoming) {
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const t of incoming) byId.set(t.id, t);
  return [...byId.values()];
}

export function getLastSyncedDate() {
  try {
    const state = JSON.parse(fs.readFileSync(SYNC_STATE_FILE));
    return state.lastSyncedDate;
  } catch (e) {
    return null;
  }
}

export function setLastSyncedDate(dateStr) {
  ensureDataDir();
  fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify({ lastSyncedDate: dateStr }, null, 2));
}

// Приводит "сырую" операцию из Sber API к простому формату,
// который понимает фронтенд-инструмент учёта.
// TODO: поля raw.* подставьте по фактическому ответу API (см. комментарий в sberClient.js).
export function normalizeRawTx(raw, dateStr) {
  const amount = Number(raw.amount ?? raw.sum ?? raw.value ?? 0);
  const isCredit =
    raw.direction === "credit" ||
    raw.creditDebitIndicator === "CRDT" ||
    amount > 0;
  return {
    id: String(raw.id ?? raw.operationId ?? raw.docNumber ?? `${dateStr}-${amount}-${Math.random()}`),
    date: raw.operationDate ?? raw.date ?? dateStr,
    amount: Math.abs(amount),
    desc: raw.description ?? raw.purpose ?? raw.paymentPurpose ?? "",
    isCredit,
  };
}
