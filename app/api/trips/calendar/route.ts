import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { listTripsForUserCalendar } from "@/lib/db";
import { participatingFromMembers } from "@/lib/trip-registry";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.name?.trim()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await listTripsForUserCalendar(session.user.id, session.user.name);
  const entries = rows.map((row) => {
    const p = row.payload;
    return {
      id: row.id,
      title: p.title.trim() || "無題の山行",
      planDate: p.planDate.trim() || null,
      planEndDate: p.planEndDate.trim() || null,
      updatedAt: row.updated_at,
      participating: participatingFromMembers(session.user.name, p.members),
    };
  });
  return NextResponse.json({ entries });
}
