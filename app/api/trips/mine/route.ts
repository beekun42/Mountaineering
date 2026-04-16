import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { listTripsByOwner } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await listTripsByOwner(session.user.id);
  const trips = rows.map((t) => ({
    id: t.id,
    title: t.payload.title.trim() || "無題の山行",
    planDate: t.payload.planDate.trim() || null,
    planEndDate: t.payload.planEndDate.trim() || null,
    updated_at: t.updated_at,
  }));
  return NextResponse.json({ trips });
}
