import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { deleteUserTemplate, updateUserTemplate } from "@/lib/db";
import { normalizeTemplatePayload } from "@/lib/template-types";
import { isValidTripId } from "@/lib/trip-id";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function validateName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const t = name.trim();
  if (t.length < 1 || t.length > 80) return null;
  return t;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isValidTripId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
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
  const patch: { name?: string; payload?: unknown } = {};
  if ("name" in o) {
    const name = validateName(o.name);
    if (!name) {
      return NextResponse.json({ error: "invalid name" }, { status: 400 });
    }
    patch.name = name;
  }
  if ("payload" in o) {
    patch.payload = o.payload;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const row = await updateUserTemplate(id, session.user.id, patch);
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    template: {
      id: row.id,
      kind: row.kind,
      name: row.name,
      payload: normalizeTemplatePayload(row.kind, row.payload),
      updated_at: row.updated_at,
    },
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isValidTripId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const ok = await deleteUserTemplate(id, session.user.id);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
