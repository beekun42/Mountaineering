import { randomUUID } from "crypto";

export type PackingItem = { id: string; text: string };

export type PaymentEntry = {
  id: string;
  payerMemberIndex: number | null;
  targetMemberIndexes: number[];
  amount: number;
  note: string;
  isFinalized: boolean;
};

export type TripPayload = {
  title: string;
  /** YYYY-MM-DD または空（期間の初日） */
  planDate: string;
  /** YYYY-MM-DD または空。空なら planDate のみの1日 */
  planEndDate: string;
  schedule: string;
  yamapUrl: string;
  /** YAMAPページの og:image など（背景用・任意） */
  yamapCoverImageUrl: string;
  members: string[];
  transport: string;
  timeline: string;
  /** 旧形式のメモ（移行用・互換） */
  packing: string;
  packingList: PackingItem[];
  /** itemId -> メンバーindexごとのチェック */
  packingChecks: Record<string, boolean[]>;
  /** ゆるーと（https://yuru-to.net/ 等）埋め込み用。旧フィールド yurakuUrl から移行 */
  yuruToUrl: string;
  onsen: string;
  expenses: string;
  payments: PaymentEntry[];
  /** メンバーごとの「支払い入力完了」チェック */
  memberPaymentDoneChecks: boolean[];
  /** 送金結果のチェック状態。key は from->to:amount */
  settlementChecks: Record<string, boolean>;
  notes: string;
};

export function defaultTripPayload(): TripPayload {
  return {
    title: "",
    planDate: "",
    planEndDate: "",
    schedule: "",
    yamapUrl: "",
    yamapCoverImageUrl: "",
    members: [],
    transport: "",
    timeline: "",
    packing: "",
    packingList: [],
    packingChecks: {},
    yuruToUrl: "",
    onsen: "",
    expenses: "",
    payments: [],
    memberPaymentDoneChecks: [],
    settlementChecks: {},
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

function normalizePayments(
  raw: unknown,
  memberCount: number,
): PaymentEntry[] {
  if (!Array.isArray(raw)) return [];
  const list: PaymentEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : randomUUID();
    const payerRaw = r.payerMemberIndex;
    const payerMemberIndex =
      typeof payerRaw === "number" &&
      Number.isInteger(payerRaw) &&
      payerRaw >= 0 &&
      payerRaw < memberCount
        ? payerRaw
        : null;
    const targetsRaw = r.targetMemberIndexes;
    const targetMemberIndexes =
      Array.isArray(targetsRaw) && targetsRaw.every((x) => typeof x === "number")
        ? Array.from(
            new Set(
              (targetsRaw as number[]).filter(
                (x) => Number.isInteger(x) && x >= 0 && x < memberCount,
              ),
            ),
          ).sort((a, b) => a - b)
        : [];
    const amountRaw = r.amount;
    const amount =
      typeof amountRaw === "number" && Number.isFinite(amountRaw) && amountRaw >= 0
        ? amountRaw
        : 0;
    const note = typeof r.note === "string" ? r.note : "";
    const isFinalized = r.isFinalized === true;
    list.push({
      id,
      payerMemberIndex,
      targetMemberIndexes,
      amount,
      note,
      isFinalized,
    });
  }
  return list;
}

function normalizeSettlementChecks(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === "boolean") out[k] = v;
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
  const payments = normalizePayments(o.payments, members.length);
  const settlementChecks = normalizeSettlementChecks(o.settlementChecks);
  const memberPaymentDoneChecks = normalizeMemberPaymentDoneChecks(
    o.memberPaymentDoneChecks,
    members.length,
  );

  const yuruToDirect = typeof o.yuruToUrl === "string" ? o.yuruToUrl : "";
  const yuruLegacy = typeof o.yurakuUrl === "string" ? (o.yurakuUrl as string) : "";
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
    yamapCoverImageUrl:
      typeof o.yamapCoverImageUrl === "string" ? o.yamapCoverImageUrl : d.yamapCoverImageUrl,
    members,
    transport: typeof o.transport === "string" ? o.transport : d.transport,
    timeline: typeof o.timeline === "string" ? o.timeline : d.timeline,
    packing: legacyPacking,
    packingList,
    packingChecks,
    yuruToUrl,
    onsen: typeof o.onsen === "string" ? o.onsen : d.onsen,
    expenses: typeof o.expenses === "string" ? o.expenses : d.expenses,
    payments,
    memberPaymentDoneChecks,
    settlementChecks,
    notes: typeof o.notes === "string" ? o.notes : d.notes,
  };
}

function normalizeMemberPaymentDoneChecks(
  raw: unknown,
  memberCount: number,
): boolean[] {
  if (!Array.isArray(raw) || !raw.every((x) => typeof x === "boolean")) {
    return Array.from({ length: memberCount }, () => false);
  }
  const b = raw as boolean[];
  return Array.from({ length: memberCount }, (_, i) => b[i] ?? false);
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

export function syncMemberDoneChecks(
  checks: boolean[],
  memberCount: number,
): boolean[] {
  return Array.from({ length: memberCount }, (_, i) => checks[i] ?? false);
}
