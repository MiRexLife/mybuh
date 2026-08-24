import "dotenv/config";
import { fetchStatementForDate } from "./sberClient.js";
import {
  loadTransactions,
  saveTransactions,
  mergeTransactions,
  getLastSyncedDate,
  setLastSyncedDate,
  normalizeRawTx,
} from "./txStore.js";

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

export async function runSync() {
  const accountNumber = process.env.SBER_ACCOUNT_NUMBER;
  const last = getLastSyncedDate();
  const start = last ? new Date(last) : new Date(new Date().getFullYear(), 0, 1); // с начала года, если ещё не синхронизировали
  start.setDate(start.getDate() + (last ? 1 : 0));
  const end = new Date();

  const existing = loadTransactions();
  let allNew = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    const dateStr = toDateStr(cursor);
    try {
      const raw = await fetchStatementForDate(dateStr, accountNumber);
      const normalized = raw.map((r) => normalizeRawTx(r, dateStr)).filter((t) => t.isCredit && t.amount > 0);
      allNew.push(...normalized);
      console.log(`${dateStr}: ${normalized.length} поступлений`);
    } catch (e) {
      console.error(`Ошибка синхронизации за ${dateStr}:`, e.message);
      break; // не двигаем lastSyncedDate дальше точки сбоя
    }
    setLastSyncedDate(dateStr);
    cursor.setDate(cursor.getDate() + 1);
  }

  const merged = mergeTransactions(existing, allNew);
  saveTransactions(merged);
  console.log(`Готово. Новых операций: ${allNew.length}. Всего в хранилище: ${merged.length}.`);
  return allNew.length;
}

// Позволяет запускать вручную: npm run sync-now
if (import.meta.url === `file://${process.argv[1]}`) {
  runSync().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
