"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildIcsAllDayEvent,
  downloadIcsFile,
  openGoogleCalendarTemplate,
} from "@/lib/calendar-export";
import { upsertTripRegistry } from "@/lib/trip-registry";
import type {
  PackingTemplatePayload,
  SettlementTemplatePayload,
} from "@/lib/template-types";
import type { PaymentEntry, TripPayload } from "@/lib/trip-types";
import { syncMemberDoneChecks, syncPackingChecks } from "@/lib/trip-types";

type Props = {
  id: string;
  initialPayload: TripPayload;
  initialUpdatedAt: string;
};

type Transfer = {
  fromIndex: number;
  toIndex: number;
  amount: number;
};

type TripRemoteTemplate = {
  id: string;
  kind: "packing" | "settlement";
  name: string;
  payload: PackingTemplatePayload | SettlementTemplatePayload;
  updated_at: string;
};

function newEntityId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random()}`;
}

const YURU_TO_DEFAULT = "https://yuru-to.net/";

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function yen(v: number) {
  return `¥${Math.round(v).toLocaleString("ja-JP")}`;
}

function transferKey(t: Transfer) {
  return `${t.fromIndex}->${t.toIndex}:${round2(t.amount).toFixed(2)}`;
}

function computeTransfers(memberCount: number, entries: PaymentEntry[]): Transfer[] {
  const balances = Array.from({ length: memberCount }, () => 0);
  for (const p of entries) {
    if (!p.isFinalized) continue;
    if (p.payerMemberIndex === null) continue;
    if (p.amount <= 0) continue;
    const targets = p.targetMemberIndexes.filter((x) => x >= 0 && x < memberCount);
    if (targets.length === 0) continue;
    const share = p.amount / targets.length;
    balances[p.payerMemberIndex] += p.amount;
    for (const t of targets) balances[t] -= share;
  }

  const debtors = balances
    .map((b, i) => ({ i, v: b }))
    .filter((x) => x.v < -0.01)
    .map((x) => ({ ...x, need: -x.v }));
  const creditors = balances
    .map((b, i) => ({ i, v: b }))
    .filter((x) => x.v > 0.01)
    .map((x) => ({ ...x, recv: x.v }));

  const out: Transfer[] = [];
  let di = 0;
  let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const d = debtors[di];
    const c = creditors[ci];
    const amount = round2(Math.min(d.need, c.recv));
    if (amount > 0.01) out.push({ fromIndex: d.i, toIndex: c.i, amount });
    d.need = round2(d.need - amount);
    c.recv = round2(c.recv - amount);
    if (d.need <= 0.01) di++;
    if (c.recv <= 0.01) ci++;
  }
  return out;
}

export function TripPageClient({ id, initialPayload, initialUpdatedAt }: Props) {
  const { data: session } = useSession();
  const [packingTemplates, setPackingTemplates] = useState<TripRemoteTemplate[]>([]);
  const [settlementTemplates, setSettlementTemplates] = useState<TripRemoteTemplate[]>(
    [],
  );
  const [packingTemplateId, setPackingTemplateId] = useState("");
  const [settlementTemplateId, setSettlementTemplateId] = useState("");

  const [form, setForm] = useState<TripPayload>(initialPayload);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [copyDone, setCopyDone] = useState(false);
  const [yamapTitle, setYamapTitle] = useState("");
  const [yamapLoading, setYamapLoading] = useState(false);
  const [yamapError, setYamapError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirstAutosave = useRef(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setPackingTemplates([]);
      setSettlementTemplates([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/templates", { credentials: "include" });
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { templates: TripRemoteTemplate[] };
      const list = data.templates ?? [];
      setPackingTemplates(list.filter((t) => t.kind === "packing"));
      setSettlementTemplates(list.filter((t) => t.kind === "settlement"));
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const save = useCallback(
    async (payload: TripPayload) => {
      setSaving(true);
      setStatus("idle");
      try {
        const res = await fetch(`/api/trips/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload }),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
        }
        const data = (await res.json()) as { updated_at: string };
        setUpdatedAt(data.updated_at);
        setStatus("saved");
        upsertTripRegistry({
          id,
          title: payload.title.trim() || "無題の山行",
          planDate: payload.planDate.trim() || null,
          planEndDate: payload.planEndDate.trim() || null,
          updatedAt: data.updated_at,
        });
      } catch {
        setStatus("error");
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  useEffect(() => {
    upsertTripRegistry({
      id,
      title: form.title.trim() || "無題の山行",
      planDate: form.planDate.trim() || null,
      planEndDate: form.planEndDate.trim() || null,
      updatedAt,
    });
  }, [id, form.title, form.planDate, form.planEndDate, updatedAt]);

  useEffect(() => {
    if (skipFirstAutosave.current) {
      skipFirstAutosave.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(form), 2500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form, save]);

  useEffect(() => {
    const url = form.yamapUrl.trim();
    if (!url) {
      setYamapTitle("");
      setYamapError("");
      return;
    }
    if (!/^https?:\/\/(www\.)?yamap\.com\//.test(url)) {
      setYamapTitle("");
      setYamapError("YAMAPのURLを入れてください。");
      return;
    }
    const timer = setTimeout(async () => {
      setYamapLoading(true);
      setYamapError("");
      try {
        const res = await fetch(`/api/link-title?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as { title: string };
        setYamapTitle(data.title || "");
      } catch {
        setYamapTitle("");
        setYamapError("コース名を取得できませんでした。");
      } finally {
        setYamapLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.yamapUrl]);

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setStatus("error");
    }
  };

  const patch = <K extends keyof TripPayload>(key: K, value: TripPayload[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const adjustPaymentsByMemberRemove = (entries: PaymentEntry[], removedIndex: number) => {
    return entries.map((p) => {
      const payer =
        p.payerMemberIndex === null
          ? null
          : p.payerMemberIndex === removedIndex
            ? null
            : p.payerMemberIndex > removedIndex
              ? p.payerMemberIndex - 1
              : p.payerMemberIndex;
      const targets = p.targetMemberIndexes
        .filter((x) => x !== removedIndex)
        .map((x) => (x > removedIndex ? x - 1 : x));
      return { ...p, payerMemberIndex: payer, targetMemberIndexes: targets };
    });
  };

  const updateMember = (index: number, value: string) => {
    setForm((f) => {
      const members = f.members.map((m, i) => (i === index ? value : m));
      return {
        ...f,
        members,
        packingChecks: syncPackingChecks(f.packingChecks, f.packingList, members.length),
        memberPaymentDoneChecks: syncMemberDoneChecks(
          f.memberPaymentDoneChecks,
          members.length,
        ),
      };
    });
  };

  const addMember = () => {
    setForm((f) => {
      const nextLen = f.members.length + 1;
      return {
        ...f,
        members: [...f.members, ""],
        packingChecks: syncPackingChecks(f.packingChecks, f.packingList, nextLen),
        memberPaymentDoneChecks: syncMemberDoneChecks(
          f.memberPaymentDoneChecks,
          nextLen,
        ),
      };
    });
  };

  const removeMember = (index: number) => {
    setForm((f) => {
      const members = f.members.filter((_, i) => i !== index);
      const memberPaymentDoneChecks = f.memberPaymentDoneChecks.filter(
        (_, i) => i !== index,
      );
      return {
        ...f,
        members,
        packingChecks: syncPackingChecks(f.packingChecks, f.packingList, members.length),
        memberPaymentDoneChecks: syncMemberDoneChecks(
          memberPaymentDoneChecks,
          members.length,
        ),
        payments: adjustPaymentsByMemberRemove(f.payments, index),
        settlementChecks: {},
      };
    });
  };

  const addPackingItem = () => {
    const nid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `item_${Date.now()}`;
    setForm((f) => {
      const packingList = [...f.packingList, { id: nid, text: "" }];
      return {
        ...f,
        packingList,
        packingChecks: syncPackingChecks(f.packingChecks, packingList, f.members.length),
      };
    });
  };

  const updatePackingItem = (itemId: string, text: string) => {
    setForm((f) => ({
      ...f,
      packingList: f.packingList.map((it) =>
        it.id === itemId ? { ...it, text } : it,
      ),
    }));
  };

  const removePackingItem = (itemId: string) => {
    setForm((f) => {
      const packingList = f.packingList.filter((it) => it.id !== itemId);
      const rest = { ...f.packingChecks };
      delete rest[itemId];
      return {
        ...f,
        packingList,
        packingChecks: syncPackingChecks(rest, packingList, f.members.length),
      };
    });
  };

  const togglePacking = (itemId: string, memberIndex: number) => {
    setForm((f) => {
      const row = f.packingChecks[itemId] ?? Array(f.members.length).fill(false);
      const nextRow = row.map((v, i) => (i === memberIndex ? !v : v));
      return { ...f, packingChecks: { ...f.packingChecks, [itemId]: nextRow } };
    });
  };

  const applyPackingFromLines = (lines: string[]) => {
    const trimmed = lines.map((s) => s.trim()).filter(Boolean);
    if (trimmed.length === 0) return;
    setForm((f) => {
      const newItems = trimmed.map((text) => ({
        id: newEntityId(),
        text,
      }));
      const packingList = [...f.packingList, ...newItems];
      return {
        ...f,
        packingList,
        packingChecks: syncPackingChecks(f.packingChecks, packingList, f.members.length),
      };
    });
  };

  const applySettlementFromRows = (rows: { note: string; amount: number }[]) => {
    const clean = rows.filter((r) => r.note.trim() !== "" || r.amount > 0);
    if (clean.length === 0) return;
    setForm((f) => ({
      ...f,
      payments: [
        ...f.payments,
        ...clean.map((r) => ({
          id: newEntityId(),
          payerMemberIndex: null as number | null,
          targetMemberIndexes: [] as number[],
          amount: r.amount,
          note: r.note,
          isFinalized: false,
        })),
      ],
      settlementChecks: {},
    }));
  };

  const addPayment = () => {
    setForm((f) => ({
      ...f,
      payments: [
        ...f.payments,
        {
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `pay_${Date.now()}`,
          payerMemberIndex: null,
          targetMemberIndexes: [],
          amount: 0,
          note: "",
          isFinalized: false,
        },
      ],
      settlementChecks: {},
    }));
  };

  const patchPayment = (paymentId: string, updater: (p: PaymentEntry) => PaymentEntry) => {
    setForm((f) => ({
      ...f,
      payments: f.payments.map((p) => (p.id === paymentId ? updater(p) : p)),
      settlementChecks: {},
    }));
  };

  const removePayment = (paymentId: string) => {
    setForm((f) => ({
      ...f,
      payments: f.payments.filter((p) => p.id !== paymentId),
      settlementChecks: {},
    }));
  };

  const togglePaymentTarget = (paymentId: string, idx: number) => {
    patchPayment(paymentId, (p) => {
      const has = p.targetMemberIndexes.includes(idx);
      const next = has
        ? p.targetMemberIndexes.filter((x) => x !== idx)
        : [...p.targetMemberIndexes, idx];
      next.sort((a, b) => a - b);
      return { ...p, targetMemberIndexes: next };
    });
  };

  const finalizePayment = (paymentId: string) => {
    patchPayment(paymentId, (p) => ({ ...p, isFinalized: true }));
  };

  const editPayment = (paymentId: string) => {
    patchPayment(paymentId, (p) => ({ ...p, isFinalized: false }));
  };

  const transfers = useMemo(
    () => computeTransfers(form.members.length, form.payments),
    [form.members.length, form.payments],
  );

  const validFinalizedPayments = form.payments.filter(
    (p) =>
      p.isFinalized &&
      p.payerMemberIndex !== null &&
      p.amount > 0 &&
      p.targetMemberIndexes.length > 0,
  );
  const totalFinalizedAmount = validFinalizedPayments.reduce((a, b) => a + b.amount, 0);

  const allMembersInputDone =
    form.members.length > 0 &&
    form.members.every((m) => m.trim() !== "") &&
    form.memberPaymentDoneChecks.length === form.members.length &&
    form.memberPaymentDoneChecks.every(Boolean);

  const calendarDetails = [
    form.schedule.trim(),
    form.yamapUrl ? `YAMAP: ${form.yamapUrl}` : "",
    typeof window !== "undefined" ? `山行ページ: ${window.location.href}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const addToGoogleCalendar = () => {
    if (!form.planDate.trim()) {
      window.alert("「計画日（初日）」を入れてから使えます。");
      return;
    }
    openGoogleCalendarTemplate({
      title: form.title.trim() || "山行",
      details: calendarDetails,
      startYmd: form.planDate.trim(),
      endInclusiveYmd: form.planEndDate.trim() || null,
    });
  };

  const downloadCalendarIcs = () => {
    if (!form.planDate.trim()) {
      window.alert("「計画日（初日）」を入れてから使えます。");
      return;
    }
    const ics = buildIcsAllDayEvent({
      title: form.title.trim() || "山行",
      description: calendarDetails,
      startYmd: form.planDate.trim(),
      endInclusiveYmd: form.planEndDate.trim() || null,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    });
    const safe = (form.title.trim() || "mountaineering").replace(/[\\/:*?"<>|]/g, "_");
    downloadIcsFile(`${safe}.ics`, ics);
  };

  const planRangeShort = useMemo(() => {
    if (!form.planDate) return null;
    const a = form.planDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3");
    if (!form.planEndDate || form.planEndDate === form.planDate) return a;
    const b = form.planEndDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3");
    return `${a} 〜 ${b}`;
  }, [form.planDate, form.planEndDate]);

  const yuruToUrl = form.yuruToUrl.trim() || YURU_TO_DEFAULT;

  return (
    <div className="min-h-full bg-zinc-50 pb-32 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:pb-28">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-3xl flex-col gap-1 px-4 py-4">
          <Link
            href="/"
            className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            ← トップへ
          </Link>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            このURLを知っている人が編集できます（ログインなし）· 下のバーから保存
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              山行タイトル（メモ）
            </label>
            <input
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-lg font-semibold shadow-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
              value={form.title}
              onChange={(e) => patch("title", e.target.value)}
              placeholder="例：〇〇山（日帰り）"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                計画日（初日）
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
                value={form.planDate}
                onChange={(e) => patch("planDate", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                終了日（任意）
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
                value={form.planEndDate}
                min={form.planDate || undefined}
                onChange={(e) => patch("planEndDate", e.target.value)}
              />
            </div>
          </div>
        </div>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            日程・集合
          </h2>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.schedule}
            onChange={(e) => patch("schedule", e.target.value)}
            placeholder={"例：\n3/15（土）5:30 新宿駅南口\n駐車場：〇〇"}
          />
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            YAMAP（コース）
          </h2>
          <input
            type="url"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            value={form.yamapUrl}
            onChange={(e) => patch("yamapUrl", e.target.value)}
            placeholder="https://yamap.com/model-courses/209"
          />
          {form.yamapUrl ? (
            <a
              href={form.yamapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400"
            >
              YAMAP を別タブで開く
            </a>
          ) : null}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
            {yamapLoading ? <p className="text-zinc-500">コース名を取得中...</p> : null}
            {!yamapLoading && yamapTitle ? (
              <p>
                <span className="mr-2 text-xs text-zinc-500">コース名</span>
                <span className="font-medium">{yamapTitle}</span>
              </p>
            ) : null}
            {!yamapLoading && !yamapTitle && yamapError ? (
              <p className="text-amber-700 dark:text-amber-300">{yamapError}</p>
            ) : null}
            {!yamapLoading && !yamapTitle && !yamapError ? (
              <p className="text-zinc-500">リンクを入れるとコース名を表示します。</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
              メンバー
            </h2>
            <button
              type="button"
              onClick={addMember}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              追加
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {form.members.length === 0 ? (
              <li className="text-sm text-zinc-500">「追加」から名前を入れてください。</li>
            ) : null}
            {form.members.map((m, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
                  value={m}
                  onChange={(e) => updateMember(i, e.target.value)}
                  placeholder={`メンバー ${i + 1}`}
                  autoComplete="name"
                />
                <button
                  type="button"
                  className="shrink-0 text-xs text-red-600 hover:underline dark:text-red-400"
                  onClick={() => removeMember(i)}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            交通
          </h2>
          <textarea
            className="min-h-[100px] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.transport}
            onChange={(e) => patch("transport", e.target.value)}
            placeholder="往路・復路・駐車場・電車のメモ"
          />
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            タイムライン（ざっくり）
          </h2>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.timeline}
            onChange={(e) => patch("timeline", e.target.value)}
            placeholder="例：5:30 出発 → 10:00 登山口 → …"
          />
        </section>

        <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
              持ち物チェック
            </h2>
            <button
              type="button"
              onClick={addPackingItem}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              行を追加
            </button>
          </div>
          {session?.user ? (
            packingTemplates.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950/50">
                <label className="flex min-w-[10rem] flex-col gap-0.5">
                  <span className="text-xs text-zinc-500">テンプレから追加</span>
                  <select
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-900"
                    value={packingTemplateId}
                    onChange={(e) => setPackingTemplateId(e.target.value)}
                  >
                    <option value="">選んでください</option>
                    {packingTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                  onClick={() => {
                    const t = packingTemplates.find((x) => x.id === packingTemplateId);
                    if (!t || t.kind !== "packing") return;
                    applyPackingFromLines((t.payload as PackingTemplatePayload).lines);
                    setPackingTemplateId("");
                  }}
                >
                  リストに追加
                </button>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                トップで持ち物テンプレを登録すると、ここから一括追加できます。
              </p>
            )
          ) : (
            <p className="text-xs text-zinc-500">
              トップでログインすると、登録した持ち物テンプレを使えます。
            </p>
          )}
          {form.members.length === 0 ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              メンバーを先に入れてください。
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80">
                  <th className="px-2 py-2 text-left font-medium">アイテム</th>
                  {form.members.map((m, i) => (
                    <th
                      key={`${i}-${m}`}
                      className="min-w-[3.5rem] px-1 py-2 text-center text-xs font-medium"
                    >
                      {m || "—"}
                    </th>
                  ))}
                  <th className="w-10 px-1" />
                </tr>
              </thead>
              <tbody>
                {form.packingList.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-1">
                      <input
                        className="w-full min-w-[8rem] rounded border border-transparent bg-white px-1 py-1 text-sm outline-none focus:border-emerald-500 dark:bg-zinc-900"
                        value={item.text}
                        onChange={(e) => updatePackingItem(item.id, e.target.value)}
                        placeholder="雨具、ヘッドランプ…"
                      />
                    </td>
                    {form.members.map((_, mi) => (
                      <td key={mi} className="px-1 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-600"
                          checked={form.packingChecks[item.id]?.[mi] ?? false}
                          onChange={() => togglePacking(item.id, mi)}
                        />
                      </td>
                    ))}
                    <td className="px-1 text-center">
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                        onClick={() => removePackingItem(item.id)}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
              ゆるーと
            </h2>
            <button
              type="button"
              className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              onClick={() => patch("yuruToUrl", YURU_TO_DEFAULT)}
            >
              公式URLを入れる
            </button>
          </div>
          <input
            type="url"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            value={form.yuruToUrl}
            onChange={(e) => patch("yuruToUrl", e.target.value)}
            placeholder="https://yuru-to.net/ ..."
          />
          <button
            type="button"
            onClick={() => window.open(yuruToUrl, "_blank", "noopener,noreferrer")}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            温泉へGO！
          </button>
        </section>

        <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
              費用・割り勘（Walica 風）
            </h2>
            <button
              type="button"
              onClick={addPayment}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              支払いを追加
            </button>
          </div>
          {session?.user ? (
            settlementTemplates.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950/50">
                <label className="flex min-w-[10rem] flex-col gap-0.5">
                  <span className="text-xs text-zinc-500">テンプレから追加</span>
                  <select
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-900"
                    value={settlementTemplateId}
                    onChange={(e) => setSettlementTemplateId(e.target.value)}
                  >
                    <option value="">選んでください</option>
                    {settlementTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                  onClick={() => {
                    const t = settlementTemplates.find((x) => x.id === settlementTemplateId);
                    if (!t || t.kind !== "settlement") return;
                    applySettlementFromRows((t.payload as SettlementTemplatePayload).rows);
                    setSettlementTemplateId("");
                  }}
                >
                  支払い行を追加
                </button>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                トップで清算テンプレを登録すると、ここからたたき台を追加できます。
              </p>
            )
          ) : (
            <p className="text-xs text-zinc-500">
              トップでログインすると、登録した清算テンプレを使えます。
            </p>
          )}

          <div className="space-y-2">
            {form.payments.length === 0 ? (
              <p className="text-sm text-zinc-500">まだ支払いがありません。</p>
            ) : null}
            {form.payments.map((p, idx) =>
              p.isFinalized ? (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.note.trim() || `項目 ${idx + 1}`}</p>
                    <p className="text-xs text-zinc-500">{yen(p.amount)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-zinc-600 underline dark:text-zinc-300"
                      onClick={() => editPayment(p.id)}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-600 underline dark:text-red-400"
                      onClick={() => removePayment(p.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={p.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                      支払い {idx + 1}
                    </p>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                      onClick={() => removePayment(p.id)}
                    >
                      削除
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="text-xs text-zinc-600 dark:text-zinc-300">
                      誰が払った？
                      <select
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        value={p.payerMemberIndex ?? ""}
                        onChange={(e) =>
                          patchPayment(p.id, (row) => ({
                            ...row,
                            payerMemberIndex: e.target.value === "" ? null : Number(e.target.value),
                          }))
                        }
                      >
                        <option value="">選択してください</option>
                        {form.members.map((m, i) => (
                          <option key={i} value={i}>
                            {m || `メンバー${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-zinc-600 dark:text-zinc-300">
                      いくら？
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        value={p.amount || ""}
                        onChange={(e) =>
                          patchPayment(p.id, (row) => ({
                            ...row,
                            amount: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        placeholder="1200"
                      />
                    </label>
                  </div>
                  <label className="mt-2 block text-xs text-zinc-600 dark:text-zinc-300">
                    項目（店名など）
                    <input
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      value={p.note}
                      onChange={(e) =>
                        patchPayment(p.id, (row) => ({ ...row, note: e.target.value }))
                      }
                      placeholder="昼食 / 駐車場 / ガソリン"
                    />
                  </label>
                  <label className="mt-2 block text-xs text-zinc-600 dark:text-zinc-300">
                    誰の分？
                    <div className="mt-1 flex flex-wrap gap-2">
                      {form.members.map((m, i) => (
                        <label
                          key={i}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <input
                            type="checkbox"
                            checked={p.targetMemberIndexes.includes(i)}
                            onChange={() => togglePaymentTarget(p.id, i)}
                          />
                          {m || `メンバー${i + 1}`}
                        </label>
                      ))}
                    </div>
                  </label>
                  <button
                    type="button"
                    className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    onClick={() => finalizePayment(p.id)}
                  >
                    入力完了
                  </button>
                </div>
              ),
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              支払い入力完了チェック（メンバー別）
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              自分の支払い入力が終わったらチェックしてください。全員チェックで清算結果を表示します。
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.members.map((m, i) => (
                <label
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <input
                    type="checkbox"
                    checked={form.memberPaymentDoneChecks[i] ?? false}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = syncMemberDoneChecks(
                          f.memberPaymentDoneChecks,
                          f.members.length,
                        );
                        next[i] = e.target.checked;
                        return { ...f, memberPaymentDoneChecks: next };
                      })
                    }
                  />
                  {m || `メンバー${i + 1}`}
                </label>
              ))}
            </div>
          </div>

          {allMembersInputDone ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                清算結果
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                入力完了の支払い {validFinalizedPayments.length} 件 / 合計 {yen(totalFinalizedAmount)}
              </p>
              {transfers.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  清算は不要です（差額なし）。
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {transfers.map((t) => {
                    const key = transferKey(t);
                    const paid = form.settlementChecks[key] === true;
                    return (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-sm dark:bg-zinc-900"
                      >
                        <span>
                          <span className="font-medium">
                            {form.members[t.fromIndex] || `メンバー${t.fromIndex + 1}`}
                          </span>
                          {" -> "}
                          <span className="font-medium">
                            {form.members[t.toIndex] || `メンバー${t.toIndex + 1}`}
                          </span>
                          {" : "}
                          <span className="font-semibold">{yen(t.amount)}</span>
                        </span>
                        <label className="inline-flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={paid}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                settlementChecks: {
                                  ...f.settlementChecks,
                                  [key]: e.target.checked,
                                },
                              }))
                            }
                          />
                          送金済み
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              メンバー全員の「支払い入力完了チェック」が付くと清算結果を表示します。
            </p>
          )}

          <textarea
            className="min-h-[80px] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.expenses}
            onChange={(e) => patch("expenses", e.target.value)}
            placeholder="補足メモ（現金のみ・端数ルールなど）"
          />
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            その他メモ
          </h2>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.notes}
            onChange={(e) => patch("notes", e.target.value)}
            placeholder="連絡・締切・注意事項など"
          />
        </section>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          最終更新:{" "}
          {new Date(updatedAt).toLocaleString("ja-JP", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {status === "saved" && !saving ? " · 保存しました" : null}
          {status === "error" ? " · 保存に失敗しました（下のバーから再試行）" : null}
        </p>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white/95 px-3 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="min-w-0 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {form.title.trim() || "無題の山行"}
            </span>
            {planRangeShort ? (
              <span className="ml-2 text-zinc-500">· {planRangeShort}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save(form)}
              className="rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-70"
              disabled={saving}
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={onCopyLink}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {copyDone ? "コピー済み" : "リンクをコピー"}
            </button>
            <button
              type="button"
              onClick={addToGoogleCalendar}
              className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-900"
            >
              Googleカレンダー
            </button>
            <button
              type="button"
              onClick={downloadCalendarIcs}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            >
              .ics を保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
