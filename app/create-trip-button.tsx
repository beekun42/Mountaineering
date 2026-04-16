"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateTripButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function onCreate() {
    setError(false);
    setPending(true);
    try {
      const res = await fetch("/api/trips", { method: "POST" });
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { id: string };
      router.push(`/t/${data.id}`);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <button
        type="button"
        disabled={pending}
        onClick={onCreate}
        className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "作成中…" : "新しい山行ページを作る"}
      </button>
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        <p>保存先は Neon（Postgres）です。アカウント不要・URL が鍵です。</p>
        {error ? (
          <p className="mt-2 text-amber-800 dark:text-amber-200">
            作成に失敗しました。環境変数 DATABASE_URL（Neon の接続文字列）を設定して再デプロイしてください。
          </p>
        ) : null}
      </div>
    </div>
  );
}
