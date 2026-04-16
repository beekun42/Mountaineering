import { neon } from "@neondatabase/serverless";
import { randomBytes } from "crypto";
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
        CREATE TABLE IF NOT EXISTS trips (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
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

export async function createTrip(): Promise<{ id: string }> {
  await ensureSchema();
  const sql = getSql();
  const id = randomBytes(16).toString("hex");
  const payload = defaultTripPayload();
  await sql`
    INSERT INTO trips (id, payload)
    VALUES (${id}, ${JSON.stringify(payload)}::jsonb)
  `;
  return { id };
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
