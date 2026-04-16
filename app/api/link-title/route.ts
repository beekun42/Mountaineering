import { NextResponse } from "next/server";

export const runtime = "nodejs";

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return "";
  return m[1]
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** og:image（ページが提供する場合） */
function extractOgImage(html: string, pageUrl: URL): string {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) {
      const raw = m[1].trim();
      if (!raw) continue;
      try {
        return new URL(raw, pageUrl).href;
      } catch {
        return raw;
      }
    }
  }
  return "";
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url")?.trim();
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return NextResponse.json({ error: "invalid protocol" }, { status: 400 });
  }
  if (!parsed.hostname.endsWith("yamap.com")) {
    return NextResponse.json({ error: "only yamap.com is supported" }, { status: 400 });
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; MountaineeringHub/1.0)",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "fetch failed" }, { status: 502 });
    }
    const html = await res.text();
    const title = extractTitle(html);
    const image = extractOgImage(html, parsed);
    if (!title) {
      return NextResponse.json({ error: "title not found" }, { status: 404 });
    }
    return NextResponse.json({ title, image: image || undefined });
  } catch {
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
}
