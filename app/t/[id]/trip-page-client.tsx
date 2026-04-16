"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TripPayload } from "@/lib/trip-types";

type Props = {
  id: string;
  initialPayload: TripPayload;
  initialUpdatedAt: string;
};

function membersToText(members: string[]) {
  return members.join("\n");
}

function textToMembers(text: string) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function TripPageClient({ id, initialPayload, initialUpdatedAt }: Props) {
  const [form, setForm] = useState<TripPayload>(initialPayload);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [copyDone, setCopyDone] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirstAutosave = useRef(true);

  const membersText = useMemo(() => membersToText(form.members), [form.members]);

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
      } catch {
        setStatus("error");
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

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

  return (
    <div className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <Link
              href="/"
              className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              ← トップへ
            </Link>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              このURLを知っている人が編集できます（ログインなし）
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save(form)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {saving ? "保存中…" : "今すぐ保存"}
            </button>
            <button
              type="button"
              onClick={onCopyLink}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              {copyDone ? "コピーしました" : "リンクをコピー"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8">
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
            <a
              href={form.yamapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400"
            >
              YAMAP を開く
            </a>
          ) : null}
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            メンバー（1行に1人）
          </h2>
          <textarea
            className="min-h-[100px] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={membersText}
            onChange={(e) => patch("members", textToMembers(e.target.value))}
            placeholder={"太郎\n花子（車運転）"}
          />
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

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            持ち物
          </h2>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.packing}
            onChange={(e) => patch("packing", e.target.value)}
            placeholder="共有・個人のメモ"
          />
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            温泉（ゆらーくなど）
          </h2>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.onsen}
            onChange={(e) => patch("onsen", e.target.value)}
            placeholder="候補URL・営業時間・予約のメモ"
          />
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
          {status === "error" ? " · 保存に失敗しました（再試行してください）" : null}
        </p>
      </main>
    </div>
  );
}
