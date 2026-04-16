import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        ページが見つかりません
      </h1>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        URL が間違っているか、ページが削除された可能性があります。
      </p>
      <Link
        href="/"
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        トップへ戻る
      </Link>
    </div>
  );
}
