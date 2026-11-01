import { NextResponse } from "next/server";
import { extractStore } from "@/pipeline/extract";
import { buildLayout } from "@/pipeline";

export const runtime = "nodejs";

// Small in-memory cache so repeated imports don't hammer the merchant's store.
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 10 * 60 * 1000;

export async function POST(req: Request) {
  let url = "";
  try { url = String((await req.json()).url ?? ""); } catch { /* fallthrough */ }
  if (!url || url.length > 300) return NextResponse.json({ ok: false, error: { kind: "invalid_url", message: "الرابط غير صالح" } }, { status: 400 });

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);

  // Platform tokens come from the merchant's OAuth grant. Env vars are for single-merchant dev only.
  const result = await extractStore(url, { tokens: { salla: process.env.SALLA_ACCESS_TOKEN, zid: process.env.ZID_ACCESS_TOKEN } });
  const body = result.ok ? { ok: true, layout: buildLayout(result.value) } : { ok: false, error: result.error };
  if (result.ok) cache.set(url, { at: Date.now(), body });
  return NextResponse.json(body, { status: result.ok ? 200 : 422 });
}
