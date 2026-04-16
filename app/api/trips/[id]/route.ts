import { NextResponse } from "next/server";
import { getTrip, updateTrip } from "@/lib/db";
import { isValidTripId } from "@/lib/trip-id";
import { normalizePayload } from "@/lib/trip-types";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isValidTripId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const trip = await getTrip(id);
    if (!trip) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(trip);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
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
  if (!body || typeof body !== "object" || !("payload" in body)) {
    return NextResponse.json({ error: "payload required" }, { status: 400 });
  }
  const payload = normalizePayload((body as { payload: unknown }).payload);
  try {
    const trip = await updateTrip(id, payload);
    return NextResponse.json(trip);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message === "not_found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
