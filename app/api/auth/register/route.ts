import { NextResponse } from "next/server";
import { createUser } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const username =
    body && typeof body === "object" && "username" in body
      ? (body as { username: unknown }).username
      : undefined;
  if (typeof username !== "string") {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  const result = await createUser(username);
  if (result.status === "invalid") {
    return NextResponse.json(
      { error: "invalid", detail: result.reason },
      { status: 400 },
    );
  }
  if (result.status === "taken") {
    return NextResponse.json({ error: "taken" }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    id: result.user.id,
    username: result.user.username,
  });
}
