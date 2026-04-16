# Mountaineering

登山計画を **ひとつのページ（ハブ）** にまとめる Web アプリです。YAMAP・温泉（ゆらーく等）・Walica などのリンクや、日程・持ち物・交通のメモを共有します。**ログインは不要**で、URL（推測しにくい ID）を知っている人だけが編集できます。

## 必要なもの

- Node.js（npm 同梱）
- [Neon](https://neon.tech/) の無料枠で十分なことが多い **Postgres** データベース

## ローカル環境

1. リポジトリを clone し、依存関係を入れる。

   ```bash
   npm install
   ```

2. `.env.example` を `.env.local` にコピーし、Neon の **接続文字列** を `DATABASE_URL` に設定する。

3. 開発サーバを起動する。

   ```bash
   npm run dev
   ```

4. ブラウザで [http://localhost:3000](http://localhost:3000) を開き、「新しい山行ページを作る」から作成。

初回アクセス時に `trips` テーブルが自動作成されます（手動マイグレーション不要）。

### 機能の要点

- **計画日**を入れると、トップの**カレンダー**に点が付き、日付タップでその日の山行へジャンプできます。
- **履歴**は同一ブラウザの `localStorage` に保存されます（URL を失くしてもトップから開き直せます）。
- **持ち物**はメンバー列付きのチェック表（メンバーの順番＝列）。
- **ゆらーくURL**を貼ると**埋め込み表示**を試せます（サイトによっては拒否されます。その場合はリンクから開いてください）。
- **保存**は画面下の固定バーからも実行できます（自動保存も引き続き動作）。

## Vercel に載せる

1. GitHub に push する（既存の Vercel プロジェクトと連携済みなら自動デプロイ）。
2. Vercel の **Project → Settings → Environment Variables** に `DATABASE_URL` を **Production / Preview / Development** すべてに登録する。
3. 再デプロイする。

## 料金について（目安）

- **GitHub** と **Git** 自体に、一般的な個人利用の範囲で料金がかかることはほぼありません。
- **Neon / Vercel** は無料枠がありますが、利用量やプランによっては **ホスティング側** のみ課金があり得ます。無料枠の上限や請求は、各サービスの公式ダッシュボードで確認してください。心配な時点で一度確認するのがおすすめです。

## 技術スタック

Next.js（App Router）、TypeScript、Tailwind CSS、Neon（`@neondatabase/serverless`）。

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js deployment](https://nextjs.org/docs/app/building-your-application/deploying)
