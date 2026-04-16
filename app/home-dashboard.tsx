"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDaysToYmd } from "@/lib/calendar-export";
import {
  readTripRegistry,
  removeTripRegistry,
  type TripRegistryEntry,
} from "@/lib/trip-registry";
import { CreateTripButton } from "./create-trip-button";
import { UserAuthPanel } from "./user-auth-panel";
import { UserTemplatesPanel } from "./user-templates-panel";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

/** カレンダー日付マス内の山行名（視認性のため文字数制限） */
const CAL_TITLE_MAX_CHARS = 7;

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function truncateCalTitle(title: string): string {
  const t = (title.trim() || "無題").replace(/\s+/g, " ");
  const arr = [...t];
  if (arr.length <= CAL_TITLE_MAX_CHARS) return t;
  return arr.slice(0, CAL_TITLE_MAX_CHARS).join("") + "…";
}

function CalendarDayDots({
  trips,
  loggedIn,
}: {
  trips: TripRegistryEntry[];
  loggedIn: boolean;
}) {
  if (!loggedIn) {
    return (
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
    );
  }
  const hasIn = trips.some((t) => t.participating === true);
  const hasOut = trips.some((t) => t.participating === false);
  if (hasIn && hasOut) {
    return (
      <span className="flex items-center gap-0.5" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="参加" />
        <span
          className="box-border h-1.5 w-1.5 rounded-full border-2 border-zinc-500 bg-transparent dark:border-zinc-400"
          title="不参加"
        />
      </span>
    );
  }
  if (hasIn) {
    return <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden title="参加" />;
  }
  if (hasOut) {
    return (
      <span
        className="box-border h-1.5 w-1.5 rounded-full border-2 border-amber-600 bg-transparent dark:border-amber-500"
        aria-hidden
        title="メンバーに含まれない"
      />
    );
  }
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-emerald-400/90"
      aria-hidden
      title="メンバー未確認（山行ページを開くと更新）"
    />
  );
}

export function HomeDashboard() {
  const { data: session, status } = useSession();
  const loggedIn = !!session?.user;

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
      if (e.key === null || e.key?.includes("trip-registry")) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const byDate = useMemo(() => {
    const m = new Map<string, TripRegistryEntry[]>();
    for (const t of entries) {
      if (!t.planDate) continue;
      const end =
        t.planEndDate && t.planEndDate >= t.planDate ? t.planEndDate : t.planDate;
      let cur = t.planDate;
      for (;;) {
        const list = m.get(cur) ?? [];
        list.push(t);
        m.set(cur, list);
        if (cur >= end) break;
        cur = addDaysToYmd(cur, 1);
      }
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

  const dashboardAfterLogin =
    status !== "loading" && loggedIn ? (
      <>
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
          <p className="mb-2 text-xs text-zinc-500">
            複数日にまたぐ山行は、終了日まで点が付きます。ログイン時は
            <span className="mx-0.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
            参加・
            <span className="mx-0.5 inline-block box-border h-1.5 w-1.5 rounded-full border-2 border-amber-600 align-middle dark:border-amber-500" />
            不参加が区別されます（山行ページでメンバーと同期）。
          </p>
          <p className="mb-2 text-xs text-zinc-500">
            日付の下に山行名を最大 {CAL_TITLE_MAX_CHARS}
            文字まで表示します（それ以上は「…」）。
          </p>
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
                return <div key={c.key} className="min-h-[5rem]" />;
              }
              const dayTrips = byDate.get(c.ymd) ?? [];
              const has = dayTrips.length > 0;
              const sel = selectedYmd === c.ymd;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setSelectedYmd(c.ymd)}
                  className={`flex min-h-[5rem] flex-col items-stretch gap-0.5 rounded-lg border px-0.5 py-1 text-sm transition ${
                    sel
                      ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                      : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="shrink-0 text-center text-sm leading-tight">{c.day}</span>
                  {has ? (
                    <>
                      <div className="flex min-h-[0.875rem] shrink-0 items-center justify-center">
                        <CalendarDayDots trips={dayTrips} loggedIn={loggedIn} />
                      </div>
                      <div className="mt-auto flex min-w-0 flex-col gap-0.5">
                        {dayTrips.slice(0, 2).map((t) => (
                          <p
                            key={t.id}
                            className="line-clamp-1 w-full break-all text-left text-[9px] leading-tight text-zinc-600 dark:text-zinc-400"
                            title={t.title}
                          >
                            {truncateCalTitle(t.title)}
                          </p>
                        ))}
                        {dayTrips.length > 2 ? (
                          <p className="text-[9px] leading-tight text-zinc-400">
                            +{dayTrips.length - 2}
                          </p>
                        ) : null}
                      </div>
                    </>
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
                      {t.planDate ? (
                        <p className="text-xs text-zinc-500">
                          {formatRangeLabel(t.planDate, t.planEndDate)}
                        </p>
                      ) : null}
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
              まだありません。「山へ行く」でページを作成するとここに並びます。
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
                        ? formatRangeLabel(t.planDate, t.planEndDate)
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

        <UserTemplatesPanel />
      </>
    ) : null;

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
          YAMAP・
          <a
            href="https://yuru-to.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            ゆるーと
          </a>
          ・Walica などのリンクや、日程・持ち物・交通のメモを共有します。
          URL を知っている仲間だけが編集できます。
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          {loggedIn ? (
            <>
              履歴とカレンダー上の表示は、このブラウザに保存されます。別端末と揃えるには同じユーザー名でログインしてください。
            </>
          ) : (
            <>
              まず下でユーザー名にログインすると、計画カレンダー・「山へ行く」・テンプレが使えます。
            </>
          )}
        </p>
      </div>

      <UserAuthPanel />

      {status === "loading" ? (
        <p className="text-sm text-zinc-500">読み込み中…</p>
      ) : !loggedIn ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-400">
          ログイン後に、カレンダー・最近の山行・山へ行く・テンプレが表示されます。
        </p>
      ) : (
        dashboardAfterLogin
      )}
    </div>
  );
}

function formatRangeLabel(start: string, end: string | null) {
  const a = start.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3");
  if (!end || end === start) return a;
  const b = end.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3");
  return `${a} 〜 ${b}`;
}
