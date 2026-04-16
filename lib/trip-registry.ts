/**
 * 同一ブラウザ内の「山行URL履歴」＋カレンダー用メタ。
 * サーバには保存されない（ログインなしのため端末ローカル）。
 */

export type TripRegistryEntry = {
  id: string;
  title: string;
  /** YYYY-MM-DD または未設定 */
  planDate: string | null;
  updatedAt: string;
};

const KEY = "mountaineering:trip-registry-v1";
const MAX = 50;

function isEntry(x: unknown): x is TripRegistryEntry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.updatedAt === "string";
}

export function readTripRegistry(): TripRegistryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

export function upsertTripRegistry(entry: TripRegistryEntry): void {
  if (typeof window === "undefined") return;
  const cur = readTripRegistry().filter((t) => t.id !== entry.id);
  cur.unshift(entry);
  cur.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  localStorage.setItem(KEY, JSON.stringify(cur.slice(0, MAX)));
}

export function removeTripRegistry(id: string): void {
  if (typeof window === "undefined") return;
  const cur = readTripRegistry().filter((t) => t.id !== id);
  localStorage.setItem(KEY, JSON.stringify(cur));
}
