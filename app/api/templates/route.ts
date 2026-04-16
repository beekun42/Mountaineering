import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { createUserTemplate, listUserTemplates } from "@/lib/db";
import type { TemplateKind } from "@/lib/template-types";
import { normalizeTemplatePayload } from "@/lib/template-types";

export const runtime = "nodejs";

function parseKind(q: string | null): TemplateKind | undefined {
  if (q === "packing" || q === "settlement") return q;
  return undefined;
}

function validateName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const t = name.trim();
  if (t.length < 1 || t.length > 80) return null;
  return t;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const kind = parseKind(searchParams.get("kind"));
  const rows = await listUserTemplates(session.user.id, kind);
  const templates = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    payload: normalizeTemplatePayload(r.kind, r.payload),
    updated_at: r.updated_at,
  }));
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const kindRaw = o.kind;
  const kind: TemplateKind | null =
    kindRaw === "packing" || kindRaw === "settlement" ? kindRaw : null;
  if (!kind) {
    return NextResponse.json({ error: "kind required" }, { status: 400 });
  }
  const name = validateName(o.name);
  if (!name) {
    return NextResponse.json({ error: "invalid name" }, { status: 400 });
  }
  try {
    const row = await createUserTemplate(session.user.id, kind, name, o.payload);
    return NextResponse.json({
      template: {
        id: row.id,
        kind: row.kind,
        name: row.name,
        payload: normalizeTemplatePayload(row.kind, row.payload),
        updated_at: row.updated_at,
      },
    });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
