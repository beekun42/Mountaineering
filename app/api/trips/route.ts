import { NextResponse } from "next/server";
import { createTrip } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { id } = await createTrip();
    return NextResponse.json({ id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
