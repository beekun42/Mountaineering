"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  readTripRegistry,
  removeTripRegistry,
  type TripRegistryEntry,
} from "@/lib/trip-registry";
import { CreateTripButton } from "./create-trip-button";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function HomeDashboard() {
  const [entries, setEntries] = useState<TripRegistryEntry[]>([]);
  const [view, setView] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setEntries(readTripRegistry());
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => refresh());
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.includes("trip-registry")) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const byDate = useMemo(() => {
    const m = new Map<string, TripRegistryEntry[]>();
    for (const t of entries) {
      if (!t.planDate) continue;
      const list = m.get(t.planDate) ?? [];
      list.push(t);
      m.set(t.planDate, list);
    }
    return m;
  }, [entries]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = useMemo(() => {
    const list: { key: string; day: number | null; ymd: string | null }[] = [];
    for (let i = 0; i < firstDow; i++) {
      list.push({ key: `pad-${i}`, day: null, ymd: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${year}-${pad(month + 1)}-${pad(d)}`;
      list.push({ key: ymd, day: d, ymd });
    }
    while (list.length % 7 !== 0) {
      list.push({ key: `end-${list.length}`, day: null, ymd: null });
    }
    return list;
  }, [year, month, firstDow, daysInMonth]);

  const selectedTrips =
    selectedYmd && byDate.has(selectedYmd) ? byDate.get(selectedYmd)! : [];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-10">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Mountaineering Hub
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          登山の計画を、ひとつのページにまとめる
        </h1>
        <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          YAMAP・ゆらーく・Walica などのリンクや、日程・持ち物・交通のメモを共有します。
          アカウントは不要で、URL を知っている仲間だけが編集できます。
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          開いたブラウザにだけ履歴とカレンダー表示が保存されます（別の端末とは同期されません）。
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            計画カレンダー
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600"
              onClick={() => setView(new Date(year, month - 1, 1))}
            >
              ←
            </button>
            <span className="min-w-[8rem] text-center text-sm font-medium">
              {year}年 {month + 1}月
            </span>
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600"
              onClick={() => setView(new Date(year, month + 1, 1))}
            >
              →
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-500">
          {weekdays.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => {
            if (c.day === null || !c.ymd) {
              return <div key={c.key} className="min-h-[2.5rem]" />;
            }
            const has = byDate.has(c.ymd);
            const sel = selectedYmd === c.ymd;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setSelectedYmd(c.ymd)}
                className={`relative min-h-[2.5rem] rounded-lg border text-sm transition ${
                  sel
                    ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                    : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {c.day}
                {has ? (
                  <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-500" />
                ) : null}
              </button>
            );
          })}
        </div>
        {selectedYmd ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {selectedYmd.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3")}{" "}
              の予定
            </p>
            {selectedTrips.length === 0 ? (
              <p className="text-sm text-zinc-500">この日の計画はありません。</p>
            ) : (
              <ul className="space-y-2">
                {selectedTrips.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/t/${t.id}`}
                      className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                    >
                      {t.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            日付をタップすると、その日の山行ページへジャンプできます。
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          最近の山行（このブラウザ）
        </h2>
        {entries.length === 0 ? (
          <p className="text-sm text-zinc-500">
            まだありません。下のボタンでページを作成するとここに並びます。
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {entries.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/t/${t.id}`}
                    className="block truncate font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                  >
                    {t.title}
                  </Link>
                  <p className="truncate text-xs text-zinc-500">
                    {t.planDate
                      ? t.planDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3")
                      : "日付未設定"}
                    {" · "}
                    {new Date(t.updatedAt).toLocaleString("ja-JP", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                  onClick={() => {
                    removeTripRegistry(t.id);
                    refresh();
                  }}
                >
                  履歴から消す
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateTripButton />
    </div>
  );
}
