import { randomUUID } from "crypto";

export type PackingItem = { id: string; text: string };

export type TripPayload = {
  title: string;
  /** YYYY-MM-DD または空（期間の初日） */
  planDate: string;
  /** YYYY-MM-DD または空。空なら planDate のみの1日。2泊3日なら「帰宅日」や「最終日」を入れる想定 */
  planEndDate: string;
  schedule: string;
  yamapUrl: string;
  members: string[];
  transport: string;
  timeline: string;
  /** 旧形式のメモ（移行用・互換） */
  packing: string;
  packingList: PackingItem[];
  /** itemId → メンバーindex ごとのチェック */
  packingChecks: Record<string, boolean[]>;
  /** ゆるーと（https://yuru-to.net/ 等）埋め込み用。旧フィールド yurakuUrl から移行 */
  yuruToUrl: string;
  onsen: string;
  expenses: string;
  notes: string;
};

export function defaultTripPayload(): TripPayload {
  return {
    title: "",
    planDate: "",
    planEndDate: "",
    schedule: "",
    yamapUrl: "",
    members: [],
    transport: "",
    timeline: "",
    packing: "",
    packingList: [],
    packingChecks: {},
    yuruToUrl: "",
    onsen: "",
    expenses: "",
    notes: "",
  };
}

function normalizePackingList(
  o: Record<string, unknown>,
  legacyPacking: string,
): PackingItem[] {
  const raw = o.packingList;
  if (Array.isArray(raw) && raw.length > 0) {
    const list: PackingItem[] = [];
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : randomUUID();
      const text = typeof r.text === "string" ? r.text : "";
      if (text.trim()) list.push({ id, text: text.trim() });
    }
    if (list.length > 0) return list;
  }
  if (legacyPacking.trim()) {
    return legacyPacking
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ id: randomUUID(), text }));
  }
  return [];
}

function normalizePackingChecks(
  raw: unknown,
  items: PackingItem[],
  memberCount: number,
): Record<string, boolean[]> {
  const out: Record<string, boolean[]> = {};
  const src =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const item of items) {
    const arr = src[item.id];
    if (Array.isArray(arr) && arr.every((x) => typeof x === "boolean")) {
      const b = arr as boolean[];
      out[item.id] = Array.from({ length: memberCount }, (_, i) => b[i] ?? false);
    } else {
      out[item.id] = Array.from({ length: memberCount }, () => false);
    }
  }
  return out;
}

export function normalizePayload(raw: unknown): TripPayload {
  const d = defaultTripPayload();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const membersRaw = o.members;
  const members =
    Array.isArray(membersRaw) && membersRaw.every((x) => typeof x === "string")
      ? (membersRaw as string[])
      : d.members;
  const legacyPacking = typeof o.packing === "string" ? o.packing : d.packing;
  const packingList = normalizePackingList(o, legacyPacking);
  const packingChecks = normalizePackingChecks(
    o.packingChecks,
    packingList,
    members.length,
  );

  const yuruToDirect =
    typeof o.yuruToUrl === "string" ? o.yuruToUrl : "";
  const yuruLegacy =
    typeof o.yurakuUrl === "string" ? (o.yurakuUrl as string) : "";
  const yuruToUrl = yuruToDirect.trim() !== "" ? yuruToDirect : yuruLegacy;

  let planEndDate =
    typeof o.planEndDate === "string" ? o.planEndDate : d.planEndDate;
  if (planEndDate && typeof o.planDate === "string" && o.planDate && planEndDate < o.planDate) {
    planEndDate = "";
  }

  return {
    title: typeof o.title === "string" ? o.title : d.title,
    planDate: typeof o.planDate === "string" ? o.planDate : d.planDate,
    planEndDate,
    schedule: typeof o.schedule === "string" ? o.schedule : d.schedule,
    yamapUrl: typeof o.yamapUrl === "string" ? o.yamapUrl : d.yamapUrl,
    members,
    transport: typeof o.transport === "string" ? o.transport : d.transport,
    timeline: typeof o.timeline === "string" ? o.timeline : d.timeline,
    packing: legacyPacking,
    packingList,
    packingChecks,
    yuruToUrl,
    onsen: typeof o.onsen === "string" ? o.onsen : d.onsen,
    expenses: typeof o.expenses === "string" ? o.expenses : d.expenses,
    notes: typeof o.notes === "string" ? o.notes : d.notes,
  };
}

/** クライアント用：アイテム追加時にチェック配列を揃える */
export function syncPackingChecks(
  checks: Record<string, boolean[]>,
  items: PackingItem[],
  memberCount: number,
): Record<string, boolean[]> {
  const next: Record<string, boolean[]> = {};
  for (const item of items) {
    const prev = checks[item.id];
    next[item.id] = Array.from({ length: memberCount }, (_, i) => prev?.[i] ?? false);
  }
  return next;
}
