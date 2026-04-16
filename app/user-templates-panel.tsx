"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import type {
  PackingTemplatePayload,
  SettlementTemplatePayload,
  TemplateKind,
} from "@/lib/template-types";

type TemplateDto = {
  id: string;
  kind: TemplateKind;
  name: string;
  payload: PackingTemplatePayload | SettlementTemplatePayload;
  updated_at: string;
};

export function UserTemplatesPanel() {
  const { data: session, status } = useSession();
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user?.id) {
      setTemplates([]);
      return;
    }
    setErr(null);
    try {
      const res = await fetch("/api/templates", { credentials: "include" });
      if (!res.ok) {
        setErr("テンプレ一覧を読めませんでした。");
        return;
      }
      const data = (await res.json()) as { templates: TemplateDto[] };
      setTemplates(data.templates ?? []);
    } catch {
      setErr("テンプレ一覧を読めませんでした。");
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") return null;

  if (!session?.user) {
    return (
      <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
          持ち物・清算テンプレ
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          ログインすると、トップでテンプレを保存でき、山行ページから一覧に追加できます。
        </p>
      </section>
    );
  }

  const packing = templates.filter((t) => t.kind === "packing");
  const settlement = templates.filter((t) => t.kind === "settlement");

  return (
    <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          持ち物・清算テンプレ
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          よく使うリストを登録しておき、山行ページの「テンプレから追加」から反映できます。
        </p>
      </div>
      {err ? <p className="text-sm text-amber-800 dark:text-amber-200">{err}</p> : null}

      <PackingBlock
        items={packing}
        busy={busy}
        setBusy={setBusy}
        onChanged={() => void load()}
      />
      <SettlementBlock
        items={settlement}
        busy={busy}
        setBusy={setBusy}
        onChanged={() => void load()}
      />
    </section>
  );
}

function PackingBlock({
  items,
  busy,
  setBusy,
  onChanged,
}: {
  items: TemplateDto[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");

  function startEdit(t: TemplateDto) {
    if (t.kind !== "packing") return;
    const p = t.payload as PackingTemplatePayload;
    setEditId(t.id);
    setEditName(t.name);
    setEditBody(p.lines.join("\n"));
  }

  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setEditBody("");
  }

  async function saveNew() {
    const lines = body
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim() || lines.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "packing",
          name: name.trim(),
          payload: { lines },
        }),
      });
      if (res.ok) {
        setName("");
        setBody("");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editId) return;
    const lines = editBody
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!editName.trim() || lines.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${editId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          payload: { lines },
        }),
      });
      if (res.ok) {
        cancelEdit();
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("このテンプレを削除しますか？")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">持ち物</h3>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">まだありません。</p>
      ) : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
            >
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{t.name}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="text-emerald-700 hover:underline dark:text-emerald-400"
                  disabled={busy}
                  onClick={() => startEdit(t)}
                >
                  編集
                </button>
                <button
                  type="button"
                  className="text-red-600 hover:underline dark:text-red-400"
                  disabled={busy}
                  onClick={() => void remove(t.id)}
                >
                  削除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {editId ? (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-xs font-medium text-emerald-900 dark:text-emerald-200">編集</p>
          <input
            className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="テンプレ名"
          />
          <textarea
            className="min-h-[100px] w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            placeholder={"1行に1アイテム（例：レインウェア）"}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => void saveEdit()}
            >
              更新
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              onClick={cancelEdit}
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/50">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">新規追加</p>
        <input
          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="テンプレ名（例：日帰り冬山）"
        />
        <textarea
          className="min-h-[100px] w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"1行に1アイテム"}
        />
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-200 dark:text-zinc-900"
          onClick={() => void saveNew()}
        >
          持ち物テンプレを保存
        </button>
      </div>
    </div>
  );
}

function emptySettlementRows(): { note: string; amount: number }[] {
  return [{ note: "", amount: 0 }];
}

function SettlementBlock({
  items,
  busy,
  setBusy,
  onChanged,
}: {
  items: TemplateDto[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<{ note: string; amount: number }[]>(() =>
    emptySettlementRows(),
  );
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRows, setEditRows] = useState<{ note: string; amount: number }[]>([]);

  function startEdit(t: TemplateDto) {
    if (t.kind !== "settlement") return;
    const p = t.payload as SettlementTemplatePayload;
    setEditId(t.id);
    setEditName(t.name);
    setEditRows(
      p.rows.length > 0 ? p.rows.map((r) => ({ ...r })) : emptySettlementRows(),
    );
  }

  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setEditRows([]);
  }

  async function saveNew() {
    const clean = rows.filter((r) => r.note.trim() !== "" || r.amount > 0);
    if (!name.trim() || clean.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "settlement",
          name: name.trim(),
          payload: { rows: clean },
        }),
      });
      if (res.ok) {
        setName("");
        setRows(emptySettlementRows());
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editId) return;
    const clean = editRows.filter((r) => r.note.trim() !== "" || r.amount > 0);
    if (!editName.trim() || clean.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${editId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          payload: { rows: clean },
        }),
      });
      if (res.ok) {
        cancelEdit();
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("このテンプレを削除しますか？")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">清算（支払い行のたたき台）</h3>
      <p className="text-xs text-zinc-500">
        項目名と金額だけ入れておきます。山行ページでは「未確定の支払い」として追加され、あとから立替・割り勘を設定できます。
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">まだありません。</p>
      ) : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
            >
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{t.name}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="text-emerald-700 hover:underline dark:text-emerald-400"
                  disabled={busy}
                  onClick={() => startEdit(t)}
                >
                  編集
                </button>
                <button
                  type="button"
                  className="text-red-600 hover:underline dark:text-red-400"
                  disabled={busy}
                  onClick={() => void remove(t.id)}
                >
                  削除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {editId ? (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-xs font-medium text-emerald-900 dark:text-emerald-200">編集</p>
          <input
            className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="テンプレ名"
          />
          <div className="space-y-2">
            {editRows.map((r, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input
                  className="min-w-[8rem] flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                  value={r.note}
                  onChange={(e) => {
                    const next = [...editRows];
                    next[i] = { ...next[i], note: e.target.value };
                    setEditRows(next);
                  }}
                  placeholder="項目（例：山小屋夕食）"
                />
                <input
                  type="number"
                  min={0}
                  className="w-28 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                  value={r.amount || ""}
                  onChange={(e) => {
                    const next = [...editRows];
                    const v = Number(e.target.value);
                    next[i] = { ...next[i], amount: Number.isFinite(v) && v >= 0 ? v : 0 };
                    setEditRows(next);
                  }}
                  placeholder="金額"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            className="text-sm text-emerald-800 underline dark:text-emerald-300"
            onClick={() => setEditRows([...editRows, { note: "", amount: 0 }])}
          >
            行を追加
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => void saveEdit()}
            >
              更新
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              onClick={cancelEdit}
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/50">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">新規追加</p>
        <input
          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="テンプレ名"
        />
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input
                className="min-w-[8rem] flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                value={r.note}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], note: e.target.value };
                  setRows(next);
                }}
                placeholder="項目"
              />
              <input
                type="number"
                min={0}
                className="w-28 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                value={r.amount || ""}
                onChange={(e) => {
                  const next = [...rows];
                  const v = Number(e.target.value);
                  next[i] = { ...next[i], amount: Number.isFinite(v) && v >= 0 ? v : 0 };
                  setRows(next);
                }}
                placeholder="金額"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="text-sm text-emerald-800 underline dark:text-emerald-300"
          onClick={() => setRows([...rows, { note: "", amount: 0 }])}
        >
          行を追加
        </button>
        <button
          type="button"
          disabled={busy}
          className="block rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-200 dark:text-zinc-900"
          onClick={() => void saveNew()}
        >
          清算テンプレを保存
        </button>
      </div>
    </div>
  );
}
