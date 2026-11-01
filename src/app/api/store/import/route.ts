import { NextResponse } from "next/server";
import { extractStore } from "@/pipeline/extract";
import { buildLayout } from "@/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60; // crawling a sitemap can take ~25 s

// Small in-memory cache so repeated imports don't hammer the merchant's store.
const cache = new Map<string, { at: number; body: { ok: boolean } }>();
const TTL = 10 * 60 * 1000;

async function handle(url: string) {
  if (!url || url.length > 300) return NextResponse.json({ ok: false, error: { kind: "invalid_url", message: "الرابط غير صالح" } }, { status: 400 });
  const key = url.trim().toLowerCase().replace(/\/+$/, "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);

  // Platform tokens come from the merchant's OAuth grant. Env vars are for single-merchant dev only.
  const result = await extractStore(url, { tokens: { salla: process.env.SALLA_ACCESS_TOKEN, zid: process.env.ZID_ACCESS_TOKEN } });
  const body = result.ok
    ? { ok: true, layout: buildLayout(result.value), stats: { found: result.value.products.length, platform: result.value.platform } }
    : { ok: false, error: result.error };
  if (result.ok) cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body, { status: result.ok ? 200 : 422 });
}

export async function POST(req: Request) {
  let url = "";
  try { url = String((await req.json()).url ?? ""); } catch { /* invalid body */ }
  return handle(url);
}

/** GET /api/store/import?url=… — same result, handy for sharing and diagnostics. */
export async function GET(req: Request) {
  return handle(new URL(req.url).searchParams.get("url") ?? "");
}
