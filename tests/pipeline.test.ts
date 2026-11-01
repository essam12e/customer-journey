// Run: npm run test:pipeline   (node --experimental-strip-types)
import assert from "node:assert/strict";
import { buildLayout } from "../src/pipeline/index.ts";
import { DEMO_STORE } from "../src/pipeline/demoStore.ts";
import { normalizeStore, parsePrice } from "../src/pipeline/normalize.ts";
import { detectTheme } from "../src/pipeline/theme.ts";
import { extractStore, detectPlatform } from "../src/pipeline/extract/index.ts";
import { parseJsonLdHtml } from "../src/pipeline/extract/jsonld.ts";
import { robotsAllows } from "../src/pipeline/extract/http.ts";

let passed = 0;
async function t(name: string, fn: () => unknown) {
  try { await fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", (e as Error).message); process.exitCode = 1; }
}

const res = (body: unknown, status = 200, type = "application/json") =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": type } });
const mockFetch = (routes: Record<string, () => Response>) => async (url: string) => {
  for (const [k, v] of Object.entries(routes)) if (url.includes(k)) return v();
  return res("nope", 404, "text/plain");
};

console.log("pipeline");
await t("parsePrice handles Arabic digits and separators", () => {
  assert.equal(parsePrice("٥٨٫٥٠ ر.س"), 58.5);
  assert.equal(parsePrice("1,299.00"), 1299);
  assert.equal(parsePrice("1.299,00"), 1299);
  assert.equal(parsePrice("abc"), null);
});
await t("normalize keeps 10 demo products in 4 categories", () => {
  const s = normalizeStore(DEMO_STORE);
  assert.equal(s.products.length, 10);
  assert.equal(s.categories.length, 4);
  assert.ok(s.products.every((p) => p.image.endsWith(".svg")));
});
await t("normalize drops products without name or price and dedupes ids", () => {
  const s = normalizeStore({ ...DEMO_STORE, products: [
    { id: "a", title: "x", price: "10" }, { id: "a", title: "dup", price: "1" },
    { id: "b", title: "", price: "5" }, { id: "c", title: "no price", price: null },
  ] });
  assert.deepEqual(s.products.map((p) => p.id), ["a"]);
  assert.equal(s.products[0].categoryId, "منتجات-مختارة");
});
await t("theme keeps hue but stays in a soft range", () => {
  const th = detectTheme(normalizeStore({ ...DEMO_STORE, themeColorHints: ["#ff0000"] }));
  assert.match(th.primary, /^#[0-9a-f]{6}$/);
  assert.equal(th.mood, "warm");
});
await t("layout places every product inside the store bounds, on a board, with no overlaps", () => {
  const L = buildLayout(DEMO_STORE);
  assert.equal(L.products.length, 10);
  assert.equal(L.sections.length, 4);
  const hw = L.template.width / 2, hd = L.template.depth / 2;
  for (const p of L.products) {
    assert.ok(Math.abs(p.position[0]) < hw && Math.abs(p.position[2]) < hd, `${p.product.id} outside`);
    assert.ok([0.445, 1.005, 1.565].some((y) => Math.abs(p.position[1] - y) < 1e-6), `${p.product.id} not on board`);
  }
  for (let i = 0; i < L.products.length; i++) for (let j = i + 1; j < L.products.length; j++) {
    const a = L.products[i].position, b = L.products[j].position;
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 0.3, "products overlap");
  }
  assert.ok(L.spawn.z > L.template.depth / 2, "spawn is outside the entrance");
});
await t("layout is deterministic", () => {
  assert.deepEqual(buildLayout(DEMO_STORE), buildLayout(DEMO_STORE));
});

console.log("extraction");
await t("detectPlatform", () => {
  assert.equal(detectPlatform(new URL("https://x.myshopify.com")), "shopify");
  assert.equal(detectPlatform(new URL("https://salla.sa/my-store")), "salla");
  assert.equal(detectPlatform(new URL("https://abc.zid.store")), "zid");
  assert.equal(detectPlatform(new URL("https://example.com")), "unknown");
});
await t("invalid and private URLs are rejected", async () => {
  for (const u of ["not a url", "http://localhost:3000", "http://192.168.1.4", "ftp://x.com"]) {
    const r = await extractStore(u, { fetcher: mockFetch({}) });
    assert.ok(!r.ok && r.error.kind === "invalid_url", u);
  }
});
await t("salla and zid without merchant authorization → auth_required", async () => {
  const s = await extractStore("https://salla.sa/shop", { fetcher: mockFetch({}) });
  assert.ok(!s.ok && s.error.kind === "auth_required");
  const z = await extractStore("https://shop.zid.store", { fetcher: mockFetch({}) });
  assert.ok(!z.ok && z.error.kind === "auth_required");
});
await t("shopify public catalogue is mapped (incl. variant id for checkout)", async () => {
  const r = await extractStore("https://demo.myshopify.com", { fetcher: mockFetch({
    "/products.json": () => res({ products: [{ id: 1, title: "Mug", handle: "mug", product_type: "Kitchen",
      images: [{ src: "https://cdn/x.jpg" }], variants: [{ id: 99, price: "12.50", available: true }] }] }),
    "/meta.json": () => res({ name: "Demo", currency: "USD" }),
  }) });
  assert.ok(r.ok);
  const L = buildLayout(r.value);
  assert.equal(L.store.name, "Demo");
  assert.equal(L.products[0].product.variantId, "99");
  assert.equal(L.products[0].product.price, 12.5);
});
await t("robots.txt Disallow is respected → blocked", async () => {
  const r = await extractStore("https://demo.myshopify.com", { fetcher: mockFetch({
    "/robots.txt": () => res("User-agent: *\nDisallow: /", 200, "text/plain"),
  }) });
  assert.ok(!r.ok && r.error.kind === "blocked");
  assert.equal(await robotsAllows(mockFetch({ "/robots.txt": () => res("User-agent: *\nDisallow: /admin", 200, "text/plain") }), "https://a.com", "/products.json"), true);
});
await t("403 from store → blocked; network error → network", async () => {
  const r = await extractStore("https://shop.example.com", { fetcher: mockFetch({ "example.com": () => res("x", 403, "text/plain") }) });
  assert.ok(!r.ok && r.error.kind === "blocked", JSON.stringify(r));
  const n = await extractStore("https://shop.example.com", { fetcher: async () => { throw new Error("ECONNRESET"); } });
  assert.ok(!n.ok && n.error.kind === "network");
});
await t("generic store via schema.org JSON-LD", async () => {
  const html = `<html lang="ar"><head><title>متجر ورد</title><meta name="theme-color" content="#7a3b69">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"باقة ورد","sku":"r1",
    "image":"/img/r1.jpg","offers":{"@type":"Offer","price":"120","priceCurrency":"SAR","availability":"https://schema.org/InStock"}}]}</script></head></html>`;
  const parsed = parseJsonLdHtml(html, "https://ward.example/shop");
  assert.equal(parsed.products[0].imageUrl, "https://ward.example/img/r1.jpg");
  const r = await extractStore("https://ward.example/shop", { fetcher: mockFetch({ "/products.json": () => res("<html>", 200, "text/html"), "ward.example/shop": () => res(html, 200, "text/html") }) });
  assert.ok(r.ok, JSON.stringify(r));
  const L = buildLayout(r.value);
  assert.equal(L.store.name, "متجر ورد");
  assert.equal(L.products.length, 1);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
