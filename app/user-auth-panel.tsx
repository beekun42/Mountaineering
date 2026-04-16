"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

type CloudTrip = {
  id: string;
  title: string;
  planDate: string | null;
  planEndDate: string | null;
  updated_at: string;
};

function formatRangeLabel(start: string | null, end: string | null) {
  if (!start) return "日付未設定";
  const a = start.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3");
  if (!end || end === start) return a;
  const b = end.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3");
  return `${a} 〜 ${b}`;
}

export function UserAuthPanel() {
  const { data: session, status } = useSession();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cloudTrips, setCloudTrips] = useState<CloudTrip[]>([]);

  const loadCloud = useCallback(async () => {
    if (!session?.user?.id) {
      setCloudTrips([]);
      return;
    }
    try {
      const res = await fetch("/api/trips/mine", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { trips: CloudTrip[] };
      setCloudTrips(data.trips ?? []);
    } catch {
      setCloudTrips([]);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void loadCloud();
  }, [loadCloud]);

  async function onRegister() {
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (res.status === 409) {
        setMessage("そのユーザー名はすでに使われています。ログインするか、別の名前にしてください。");
        return;
      }
      if (!res.ok) {
        setMessage("2〜32文字のユーザー名を入力してください。");
        return;
      }
      const sign = await signIn("username", {
        username,
        redirect: false,
      });
      if (sign?.error) {
        setMessage("登録はできましたがログインに失敗しました。もう一度「ログイン」を試してください。");
        return;
      }
      setUsername("");
      await loadCloud();
    } finally {
      setBusy(false);
    }
  }

  async function onLogin() {
    setMessage(null);
    setBusy(true);
    try {
      const sign = await signIn("username", {
        username,
        redirect: false,
      });
      if (sign?.error) {
        setMessage("ユーザーが見つかりません。新規登録するか、名前のスペル・英大文字小文字を確認してください。");
        return;
      }
      setUsername("");
      await loadCloud();
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
        <p className="text-sm text-zinc-500">読み込み中…</p>
      </section>
    );
  }

  if (session?.user) {
    return (
      <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-zinc-800 dark:text-zinc-200">
            <span className="font-semibold text-emerald-900 dark:text-emerald-100">
              {session.user.name ?? "ユーザー"}
            </span>
            としてログイン中
          </p>
          <button
            type="button"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            ログアウト
          </button>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          パスワードはありません。名前を知っている人なら同じアカウントに入れます（仲間内利用向け）。
        </p>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            このユーザーで作った山行
          </h3>
          {cloudTrips.length === 0 ? (
            <p className="text-sm text-zinc-500">まだありません。下のボタンでページを作成するとここにも出ます。</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {cloudTrips.map((t) => (
                <li key={t.id} className="px-3 py-2.5">
                  <Link
                    href={`/t/${t.id}`}
                    className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                  >
                    {t.title}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {formatRangeLabel(t.planDate, t.planEndDate)}
                    {" · "}
                    {new Date(t.updated_at).toLocaleString("ja-JP", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        ユーザー名（任意）
      </h2>
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        登録すると、別の端末から同じユーザー名でログインして、自分が作った山行一覧を再表示できます。パスワードはありません。
      </p>
      <label className="block text-sm text-zinc-700 dark:text-zinc-300">
        ユーザー名（2〜32文字）
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950"
          placeholder="例：やまだ"
        />
      </label>
      {message ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">{message}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRegister()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "処理中…" : "新規登録"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onLogin()}
          className="rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-800"
        >
          ログイン
        </button>
      </div>
    </section>
  );
}
