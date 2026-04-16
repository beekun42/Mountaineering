import { HomeDashboard } from "./home-dashboard";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-emerald-50 to-zinc-50 text-zinc-900 dark:from-zinc-950 dark:to-zinc-900 dark:text-zinc-100">
      <main className="mx-auto flex flex-1 flex-col items-center px-6 py-12 sm:py-16">
        <HomeDashboard />
      </main>
    </div>
  );
}
