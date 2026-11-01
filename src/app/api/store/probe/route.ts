import { NextResponse } from "next/server";
import { parseStoreUrl } from "@/pipeline/extract/http";

export const runtime = "nodejs";

/** Diagnostics: which structured data does a public page expose? (types + product meta tags only) */
export async function GET(req: Request) {
  const u = parseStoreUrl(new URL(req.url).searchParams.get("url") ?? "");
  if (!u) return NextResponse.json({ error: "bad url" }, { status: 400 });
  const r = await fetch(u, { headers: { accept: "text/html", "user-agent": "CustomerJourneyBot/0.1" } });
  const html = await r.text();
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => {
    try {
      const d = JSON.parse(m[1].trim());
      const nodes = Array.isArray(d) ? d : d["@graph"] ?? [d];
      return nodes.map((n: Record<string, unknown>) => ({ type: n["@type"], keys: Object.keys(n).slice(0, 14) }));
    } catch (e) { return { parseError: (e as Error).message, head: m[1].trim().slice(0, 160) }; }
  });
  const metas = [...html.matchAll(/<meta[^>]+>/gi)].map((m) => m[0]).filter((t) => /og:|product:|price|currency|twitter:/i.test(t)).slice(0, 25);
  return NextResponse.json({ status: r.status, bytes: html.length, jsonld: blocks, metas, itemprop: (html.match(/itemprop=["'](price|name|image|priceCurrency)["']/gi) ?? []).slice(0, 10) });
}
