import { neon } from "@neondatabase/serverless";
import { randomBytes } from "crypto";
import { parseUsername } from "./username";
import type { TemplateKind } from "./template-types";
import {
  normalizeTemplatePayload,
} from "./template-types";
import type { TripPayload } from "./trip-types";
import { defaultTripPayload, normalizePayload } from "./trip-types";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL が設定されていません。Neon の接続文字列を .env.local に追加してください。");
  }
  return neon(url);
}

let schemaReady: Promise<void> | null = null;

function ensureSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          username_key TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS trips (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        ALTER TABLE trips ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users (id) ON DELETE SET NULL
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS user_templates (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT user_templates_kind_chk CHECK (kind IN ('packing', 'settlement'))
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_user_templates_user_kind ON user_templates (user_id, kind)
      `;
    })();
  }
  return schemaReady;
}

export type TripRow = {
  id: string;
  payload: TripPayload;
  updated_at: string;
};

export type UserRow = {
  id: string;
  username: string;
};

export async function createUser(
  rawUsername: string,
): Promise<
  | { status: "ok"; user: UserRow }
  | { status: "invalid"; reason: "empty" | "length" }
  | { status: "taken" }
> {
  const parsed = parseUsername(rawUsername);
  if (!parsed.ok) {
    return { status: "invalid", reason: parsed.reason };
  }
  await ensureSchema();
  const sql = getSql();
  const id = randomBytes(16).toString("hex");
  try {
    await sql`
      INSERT INTO users (id, username, username_key)
      VALUES (${id}, ${parsed.display}, ${parsed.key})
    `;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (code === "23505") {
      return { status: "taken" };
    }
    throw e;
  }
  return { status: "ok", user: { id, username: parsed.display } };
}

export async function getUserByUsernameKey(
  usernameKey: string,
): Promise<UserRow | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, username
    FROM users
    WHERE username_key = ${usernameKey}
    LIMIT 1
  `;
  const row = rows[0] as { id: string; username: string } | undefined;
  if (!row) return null;
  return { id: row.id, username: row.username };
}

export async function createTrip(ownerId?: string | null): Promise<{ id: string }> {
  await ensureSchema();
  const sql = getSql();
  const id = randomBytes(16).toString("hex");
  const payload = defaultTripPayload();
  const owner = ownerId?.trim() || null;
  await sql`
    INSERT INTO trips (id, payload, owner_id)
    VALUES (${id}, ${JSON.stringify(payload)}::jsonb, ${owner})
  `;
  return { id };
}

export type UserTemplateRow = {
  id: string;
  user_id: string;
  kind: TemplateKind;
  name: string;
  payload: unknown;
  updated_at: string;
};

export async function listUserTemplates(
  userId: string,
  kindFilter?: TemplateKind,
): Promise<UserTemplateRow[]> {
  await ensureSchema();
  const sql = getSql();
  const rows =
    kindFilter === "packing" || kindFilter === "settlement"
      ? await sql`
          SELECT id, user_id, kind, name, payload, updated_at
          FROM user_templates
          WHERE user_id = ${userId} AND kind = ${kindFilter}
          ORDER BY updated_at DESC
          LIMIT 100
        `
      : await sql`
          SELECT id, user_id, kind, name, payload, updated_at
          FROM user_templates
          WHERE user_id = ${userId}
          ORDER BY updated_at DESC
          LIMIT 200
        `;
  return rows.map((row) => {
    const r = row as {
      id: string;
      user_id: string;
      kind: string;
      name: string;
      payload: unknown;
      updated_at: string | Date;
    };
    return {
      id: r.id,
      user_id: r.user_id,
      kind: r.kind === "settlement" ? "settlement" : "packing",
      name: r.name,
      payload: r.payload,
      updated_at:
        typeof r.updated_at === "string"
          ? r.updated_at
          : new Date(r.updated_at).toISOString(),
    };
  });
}

export async function createUserTemplate(
  userId: string,
  kind: TemplateKind,
  name: string,
  payloadRaw: unknown,
): Promise<UserTemplateRow> {
  await ensureSchema();
  const sql = getSql();
  const id = randomBytes(16).toString("hex");
  const payload = normalizeTemplatePayload(kind, payloadRaw);
  await sql`
    INSERT INTO user_templates (id, user_id, kind, name, payload)
    VALUES (
      ${id},
      ${userId},
      ${kind},
      ${name},
      ${JSON.stringify(payload)}::jsonb
    )
  `;
  const row = await getUserTemplateByIdForUser(id, userId);
  if (!row) throw new Error("create_failed");
  return row;
}

export async function getUserTemplateByIdForUser(
  id: string,
  userId: string,
): Promise<UserTemplateRow | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, user_id, kind, name, payload, updated_at
    FROM user_templates
    WHERE id = ${id} AND user_id = ${userId}
    LIMIT 1
  `;
  const r = rows[0] as
    | {
        id: string;
        user_id: string;
        kind: string;
        name: string;
        payload: unknown;
        updated_at: string | Date;
      }
    | undefined;
  if (!r) return null;
  return {
    id: r.id,
    user_id: r.user_id,
    kind: r.kind === "settlement" ? "settlement" : "packing",
    name: r.name,
    payload: r.payload,
    updated_at:
      typeof r.updated_at === "string"
        ? r.updated_at
        : new Date(r.updated_at).toISOString(),
  };
}

export async function updateUserTemplate(
  id: string,
  userId: string,
  patch: { name?: string; payload?: unknown },
): Promise<UserTemplateRow | null> {
  await ensureSchema();
  const existing = await getUserTemplateByIdForUser(id, userId);
  if (!existing) return null;
  const kind = existing.kind;
  const nextName =
    typeof patch.name === "string" ? patch.name.trim() : existing.name;
  const nextPayload =
    patch.payload !== undefined
      ? normalizeTemplatePayload(kind, patch.payload)
      : normalizeTemplatePayload(kind, existing.payload);
  const sql = getSql();
  await sql`
    UPDATE user_templates
    SET
      name = ${nextName},
      payload = ${JSON.stringify(nextPayload)}::jsonb,
      updated_at = NOW()
    WHERE id = ${id} AND user_id = ${userId}
  `;
  return getUserTemplateByIdForUser(id, userId);
}

export async function deleteUserTemplate(
  id: string,
  userId: string,
): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    DELETE FROM user_templates
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function listTripsByOwner(ownerId: string): Promise<TripRow[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, payload, updated_at
    FROM trips
    WHERE owner_id = ${ownerId}
    ORDER BY updated_at DESC
    LIMIT 100
  `;
  return rows.map((row) => {
    const r = row as {
      id: string;
      payload: unknown;
      updated_at: string;
    };
    return {
      id: r.id,
      payload: normalizePayload(r.payload),
      updated_at:
        typeof r.updated_at === "string"
          ? r.updated_at
          : new Date(r.updated_at as Date).toISOString(),
    };
  });
}

export async function getTrip(id: string): Promise<TripRow | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, payload, updated_at
    FROM trips
    WHERE id = ${id}
    LIMIT 1
  `;
  const row = rows[0] as
    | { id: string; payload: unknown; updated_at: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    payload: normalizePayload(row.payload),
    updated_at:
      typeof row.updated_at === "string"
        ? row.updated_at
        : new Date(row.updated_at as Date).toISOString(),
  };
}

export async function updateTrip(id: string, payload: TripPayload): Promise<TripRow> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE trips
    SET payload = ${JSON.stringify(payload)}::jsonb,
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, payload, updated_at
  `;
  const row = rows[0] as
    | { id: string; payload: unknown; updated_at: string }
    | undefined;
  if (!row) {
    throw new Error("not_found");
  }
  return {
    id: row.id,
    payload: normalizePayload(row.payload),
    updated_at:
      typeof row.updated_at === "string"
        ? row.updated_at
        : new Date(row.updated_at as Date).toISOString(),
  };
}
