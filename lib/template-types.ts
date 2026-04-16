/** ユーザー別テンプレ（持ち物・清算）の JSON 形 */

export type TemplateKind = "packing" | "settlement";

export type PackingTemplatePayload = {
  lines: string[];
};

export type SettlementTemplateRow = {
  note: string;
  amount: number;
  /** 山行ページに適用したとき、当時のメンバー全員を割り勘対象にする（車代など） */
  splitAmongAll?: boolean;
};

export type SettlementTemplatePayload = {
  rows: SettlementTemplateRow[];
};

export function normalizePackingTemplatePayload(raw: unknown): PackingTemplatePayload {
  if (!raw || typeof raw !== "object") return { lines: [] };
  const o = raw as Record<string, unknown>;
  const linesRaw = o.lines;
  if (!Array.isArray(linesRaw)) return { lines: [] };
  const lines: string[] = [];
  for (const x of linesRaw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (t) lines.push(t);
    if (lines.length >= 200) break;
  }
  return { lines };
}

export function normalizeSettlementTemplatePayload(raw: unknown): SettlementTemplatePayload {
  if (!raw || typeof raw !== "object") return { rows: [] };
  const o = raw as Record<string, unknown>;
  const rowsRaw = o.rows;
  if (!Array.isArray(rowsRaw)) return { rows: [] };
  const rows: SettlementTemplateRow[] = [];
  for (const r of rowsRaw) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const note = typeof row.note === "string" ? row.note : "";
    const amountRaw = row.amount;
    const amount =
      typeof amountRaw === "number" && Number.isFinite(amountRaw) && amountRaw >= 0
        ? amountRaw
        : 0;
    const splitAmongAll = row.splitAmongAll === true;
    rows.push({ note, amount, ...(splitAmongAll ? { splitAmongAll: true } : {}) });
    if (rows.length >= 200) break;
  }
  return { rows };
}

export function normalizeTemplatePayload(
  kind: TemplateKind,
  raw: unknown,
): PackingTemplatePayload | SettlementTemplatePayload {
  return kind === "packing"
    ? normalizePackingTemplatePayload(raw)
    : normalizeSettlementTemplatePayload(raw);
}
