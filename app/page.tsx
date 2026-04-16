import { CreateTripButton } from "./create-trip-button";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-emerald-50 to-zinc-50 text-zinc-900 dark:from-zinc-950 dark:to-zinc-900 dark:text-zinc-100">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-6 py-16">
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
        </div>

        <CreateTripButton />
      </main>
    </div>
  );
}
