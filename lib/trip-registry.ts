/**
 * 同一ブラウザ内の「山行URL履歴」＋カレンダー用メタ。
 * サーバには保存されない（ログインなしのため端末ローカル）。
 */

export type TripRegistryEntry = {
  id: string;
  title: string;
  /** YYYY-MM-DD または未設定（期間の初日） */
  planDate: string | null;
  /** YYYY-MM-DD または未設定。未設定なら planDate のみの1日 */
  planEndDate: string | null;
  updatedAt: string;
};

const KEY = "mountaineering:trip-registry-v2";
const LEGACY_KEY = "mountaineering:trip-registry-v1";
const MAX = 50;

function isEntry(x: unknown): x is TripRegistryEntry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.updatedAt === "string" &&
    typeof o.title === "string"
  );
}

function migrateLegacyIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) return;
    const old = localStorage.getItem(LEGACY_KEY);
    if (!old) return;
    const parsed = JSON.parse(old) as unknown;
    if (!Array.isArray(parsed)) return;
    const next: TripRegistryEntry[] = parsed
      .filter(
        (x): x is { id: string; updatedAt: string } =>
          !!x &&
          typeof x === "object" &&
          typeof (x as { id?: unknown }).id === "string" &&
          typeof (x as { updatedAt?: unknown }).updatedAt === "string",
      )
      .map((e) => {
        const o = e as {
          title?: unknown;
          planDate?: unknown;
          planEndDate?: unknown;
        };
        return {
          id: e.id,
          title: typeof o.title === "string" ? o.title : "無題の山行",
          planDate: typeof o.planDate === "string" ? o.planDate : null,
          planEndDate:
            typeof o.planEndDate === "string" ? o.planEndDate : null,
          updatedAt: e.updatedAt,
        };
      });
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function readTripRegistry(): TripRegistryEntry[] {
  if (typeof window === "undefined") return [];
  migrateLegacyIfNeeded();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).map((e) => ({
      id: e.id,
      title: e.title,
      planDate: typeof e.planDate === "string" ? e.planDate : null,
      planEndDate:
        typeof (e as { planEndDate?: unknown }).planEndDate === "string"
          ? (e as { planEndDate: string }).planEndDate
          : null,
      updatedAt: e.updatedAt,
    }));
  } catch {
    return [];
  }
}

export function upsertTripRegistry(entry: TripRegistryEntry): void {
  if (typeof window === "undefined") return;
  migrateLegacyIfNeeded();
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
