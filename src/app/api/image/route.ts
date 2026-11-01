import { parseStoreUrl } from "@/pipeline/extract/http";

export const runtime = "nodejs";

// Same-origin image proxy so product photos from other stores can be used as WebGL textures
// (browsers block cross-origin images without CORS headers from being uploaded to the GPU).
const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url") ?? "";
  const u = parseStoreUrl(target);
  if (!u || !/^https?:$/.test(u.protocol)) return new Response("bad url", { status: 400 });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(u, { signal: ctrl.signal, headers: { accept: "image/*" }, redirect: "follow" });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return new Response("not an image", { status: 415 });
    if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) return new Response("too large", { status: 413 });
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new Response("too large", { status: 413 });
    return new Response(buf, {
      headers: { "content-type": type, "cache-control": "public, max-age=86400, s-maxage=604800, immutable", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("upstream failed", { status: 502 });
  } finally {
    clearTimeout(t);
  }
}
