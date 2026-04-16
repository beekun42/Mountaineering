"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildIcsAllDayEvent,
  downloadIcsFile,
  openGoogleCalendarTemplate,
} from "@/lib/calendar-export";
import { upsertTripRegistry } from "@/lib/trip-registry";
import type { TripPayload } from "@/lib/trip-types";
import { syncPackingChecks } from "@/lib/trip-types";

type Props = {
  id: string;
  initialPayload: TripPayload;
  initialUpdatedAt: string;
};

function isEmbedUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const YURU_TO_DEFAULT = "https://yuru-to.net/";

export function TripPageClient({ id, initialPayload, initialUpdatedAt }: Props) {
  const [form, setForm] = useState<TripPayload>(initialPayload);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [copyDone, setCopyDone] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirstAutosave = useRef(true);

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
    debounceRef.current = setTimeout(() => {
      save(form);
    }, 2500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form, save]);

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

  const updateMember = (index: number, value: string) => {
    setForm((f) => {
      const members = f.members.map((m, i) => (i === index ? value : m));
      const packingChecks = syncPackingChecks(
        f.packingChecks,
        f.packingList,
        members.length,
      );
      return { ...f, members, packingChecks };
    });
  };

  const addMember = () => {
    setForm((f) => ({
      ...f,
      members: [...f.members, ""],
      packingChecks: syncPackingChecks(
        f.packingChecks,
        f.packingList,
        f.members.length + 1,
      ),
    }));
  };

  const removeMember = (index: number) => {
    setForm((f) => {
      const members = f.members.filter((_, i) => i !== index);
      const packingChecks = syncPackingChecks(
        f.packingChecks,
        f.packingList,
        members.length,
      );
      return { ...f, members, packingChecks };
    });
  };

  const addPackingItem = () => {
    const nid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `item_${Date.now()}`;
    setForm((f) => {
      const packingList = [...f.packingList, { id: nid, text: "" }];
      const packingChecks = syncPackingChecks(
        f.packingChecks,
        packingList,
        f.members.length,
      );
      return { ...f, packingList, packingChecks };
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
      const packingChecks = syncPackingChecks(rest, packingList, f.members.length);
      return { ...f, packingList, packingChecks };
    });
  };

  const togglePacking = (itemId: string, memberIndex: number) => {
    setForm((f) => {
      const row =
        f.packingChecks[itemId] ?? Array(f.members.length).fill(false);
      const nextRow = row.map((v, i) => (i === memberIndex ? !v : v));
      return {
        ...f,
        packingChecks: { ...f.packingChecks, [itemId]: nextRow },
      };
    });
  };

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
    const safe = (form.title.trim() || "mountaineering").replace(
      /[\\/:*?"<>|]/g,
      "_",
    );
    downloadIcsFile(`${safe}.ics`, ics);
  };

  const planRangeShort = useMemo(() => {
    if (!form.planDate) return null;
    const a = form.planDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3");
    if (!form.planEndDate || form.planEndDate === form.planDate) return a;
    const b = form.planEndDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3");
    return `${a} 〜 ${b}`;
  }, [form.planDate, form.planEndDate]);

  const yuruSrc = form.yuruToUrl.trim() || YURU_TO_DEFAULT;

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
                計画日（初日・カレンダー用）
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
                終了日（任意・複数日）
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
                value={form.planEndDate}
                min={form.planDate || undefined}
                onChange={(e) => patch("planEndDate", e.target.value)}
              />
              <p className="text-xs text-zinc-500">
                2泊3日などは「初日」と「最終日（帰宅日）」を入れると、トップのカレンダーに全日マークされます。Google
                カレンダー登録もこの期間になります。
              </p>
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
            placeholder="https://yamap.com/..."
          />
          {form.yamapUrl ? (
            <>
              <a
                href={form.yamapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400"
              >
                YAMAP を別タブで開く
              </a>
              {isEmbedUrl(form.yamapUrl) ? (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500">
                    共有ページによっては埋め込みが拒否されることがあります。
                  </p>
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
                    <iframe
                      title="YAMAP"
                      src={form.yamapUrl}
                      className="absolute inset-0 h-full w-full"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox"
                    />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
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
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            1人につき1行の入力欄です（スマホでも改行で困りません）。
          </p>
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
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            メンバー列は上の順に並びます。
          </p>
          {form.packingList.length === 0 ? (
            <p className="text-sm text-zinc-500">「行を追加」でアイテムを入れてください。</p>
          ) : null}
          {form.members.length === 0 ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              メンバーを1人以上入れると、チェック列が表示されます。
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80">
                  <th className="px-2 py-2 text-left font-medium">アイテム</th>
                  {form.members.map((m, i) => (
                    <th
                      key={`h-${i}-${m}`}
                      className="min-w-[3.5rem] px-1 py-2 text-center text-xs font-medium leading-tight"
                    >
                      {m || `—`}
                    </th>
                  ))}
                  <th className="w-10 px-1" />
                </tr>
              </thead>
              <tbody>
                {form.packingList.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-2 py-1 align-middle">
                      <input
                        className="w-full min-w-[8rem] rounded border border-transparent bg-white px-1 py-1 text-sm outline-none focus:border-emerald-500 dark:bg-zinc-900"
                        value={item.text}
                        onChange={(e) => updatePackingItem(item.id, e.target.value)}
                        placeholder="雨具、ヘッドランプ…"
                      />
                    </td>
                    {form.members.map((_, mi) => (
                      <td key={mi} className="px-1 text-center align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-600"
                          checked={form.packingChecks[item.id]?.[mi] ?? false}
                          onChange={() => togglePacking(item.id, mi)}
                          aria-label={`${item.text || "アイテム"} ${form.members[mi]}`}
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
          <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            温泉・メモ
          </h2>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.onsen}
            onChange={(e) => patch("onsen", e.target.value)}
            placeholder="候補・営業時間・予約のメモ"
          />
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
              ゆるーと（埋め込み）
            </h2>
            <button
              type="button"
              className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              onClick={() => patch("yuruToUrl", YURU_TO_DEFAULT)}
            >
              公式URLを入れる
            </button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <a
              href={YURU_TO_DEFAULT}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 underline dark:text-emerald-400"
            >
              ゆるーと
            </a>
            （全国日帰り温泉マップ）を埋め込み表示します。空欄のときは公式トップを表示します。
          </p>
          <input
            type="url"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            value={form.yuruToUrl}
            onChange={(e) => patch("yuruToUrl", e.target.value)}
            placeholder="https://yuru-to.net/ ..."
          />
          {isEmbedUrl(yuruSrc) ? (
            <div className="space-y-2">
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
                <iframe
                  title="ゆるーと埋め込み"
                  src={yuruSrc}
                  className="absolute inset-0 h-full w-full"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox"
                />
              </div>
              <a
                href={yuruSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="inline text-sm font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
              >
                新しいタブで開く
              </a>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            費用・割り勘（Walica など）
          </h2>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.expenses}
            onChange={(e) => patch("expenses", e.target.value)}
            placeholder="Walica のリンクURL・概算のメモ"
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
          <p className="text-[11px] leading-snug text-zinc-500">
            「Googleカレンダー」はブラウザで開きます。「.ics」は iPhone
            のファイルアプリやOutlookでも取り込めます。
          </p>
        </div>
      </div>
    </div>
  );
}
