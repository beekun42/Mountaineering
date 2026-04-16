import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { hideTripFromUserCalendar } from "@/lib/db";
import { isValidTripId } from "@/lib/trip-id";

export const runtime = "nodejs";

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
  const tripId =
    body && typeof body === "object" && "tripId" in body
      ? (body as { tripId: unknown }).tripId
      : undefined;
  if (typeof tripId !== "string" || !isValidTripId(tripId)) {
    return NextResponse.json({ error: "invalid tripId" }, { status: 400 });
  }
  await hideTripFromUserCalendar(session.user.id, tripId);
  return NextResponse.json({ ok: true });
}
