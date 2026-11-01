// Run: npm run test:pipeline   (node --experimental-strip-types)
import assert from "node:assert/strict";
import { buildLayout } from "../src/pipeline/index.ts";
import { DEMO_STORE } from "../src/pipeline/demoStore.ts";
import { inferCategories, normalizeStore, parsePrice } from "../src/pipeline/normalize.ts";
import { detectTheme } from "../src/pipeline/theme.ts";
import { extractStore, detectPlatform } from "../src/pipeline/extract/index.ts";
import { parseJsonLdHtml } from "../src/pipeline/extract/jsonld.ts";
import { robotsAllows } from "../src/pipeline/extract/http.ts";
import { breadcrumbCategory, loadRobots } from "../src/pipeline/extract/crawl.ts";
import { detectPlatformFromHtml } from "../src/pipeline/extract/index.ts";
import type { RawStoreData } from "../src/pipeline/types.ts";

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

await t("real-world shapes: Shopify ProductGroup JSON-LD and Open Graph-only pages", () => {
  // structure observed on a live Shopify product page (allbirds.com), trimmed
  const group = `<script type="application/ld+json">{"@context":"http://schema.org/","@type":"ProductGroup","productGroupID":"1","name":"Men&#39;s Wool Runner",
    "image":["https://cdn/x.png"],"offers":{"@type":"AggregateOffer","lowPrice":"110.00","priceCurrency":"USD"},
    "hasVariant":[{"@type":"Product","name":"v1","isVariantOf":{"@id":"#g"},"offers":{"@type":"Offer","price":"110.00","priceCurrency":"USD"}}]}</script>`;
  const a = parseJsonLdHtml(group, "https://shop.example/products/x");
  assert.equal(a.products.length, 1);
  assert.equal(a.products[0].title, "Men's Wool Runner");
  assert.equal(a.products[0].price, "110.00");
  const og = `<meta property='og:site_name' content='Allbirds'><meta property='og:type' content='product'>
    <meta property='og:title' content='Men&#39;s Tree Runner'><meta
      property='og:price:amount'
      content='98.00'
    ><meta property='og:price:currency' content='USD'><meta property='og:image:secure_url' content='https://cdn/y.png'>`;
  const b = parseJsonLdHtml(og, "https://shop.example/products/y");
  assert.equal(b.storeName, "Allbirds");
  assert.deepEqual([b.products[0].title, b.products[0].price, b.products[0].currency, b.products[0].imageUrl], ["Men's Tree Runner", "98.00", "USD", "https://cdn/y.png"]);
});

await t("Salla storefront on a custom domain with no public product data → clear auth_required", async () => {
  const r = await extractStore("https://oud.example", { fetcher: mockFetch({
    "/sitemap.xml": () => res(`<sitemapindex><sitemap><loc>https://salla.sa/oud/sitemap-1.xml</loc></sitemap></sitemapindex>`, 200, "application/xml"),
    "salla.sa/oud/sitemap-1.xml": () => res(`<urlset><url><loc>https://salla.sa/oud/category/abc</loc></url></urlset>`, 200, "application/xml"),
    "oud.example/": () => res(`<html><head><meta property="og:type" content="store"><link href="https://cdn.salla.network/t.css"></head></html>`, 200, "text/html"),
  }) });
  assert.ok(!r.ok && r.error.kind === "auth_required" && r.error.message.includes("سلة"), JSON.stringify(r));
});

await t("uncategorised catalogues get sections from product names; tiny CDN thumbnails are upscaled", () => {
  const names = ["Women's Wool Runner", "Women's Tree Runner", "Women's Tree Piper", "Men's Wool Runner", "Men's Tree Runner",
    "Men's Tree Skipper", "Women's Tree Breezer", "Smallbirds Wool Loungers", "Anytime Crew Sock", "Women's Tree Dasher", "Men's Canvas Pacer", "Women's Tree Skipper", "Men's Tree Dasher"];
  const s = normalizeStore({ platform: "jsonld", sourceUrl: "https://x.com", themeColorHints: [], products: names.map((n, i) => ({ id: `${i}`, title: n, price: 10, imageUrl: "https://x.com/cdn/shop/files/a.png?v=1&width=100" })) });
  assert.deepEqual(s.categories.map((c) => c.name).sort(), ["Men's", "Women's", "منوعات"].sort());
  assert.match(s.products[0].image, /width=600/);
  const ar = inferCategories(["عطر الورد", "عطر العود", "دهن عود كمبودي", "دهن عود هندي", "بخور معطر", "بخور ملكي", "مسك أبيض"]);
  assert.deepEqual(ar, ["عطر", "عطر", "دهن", "دهن", "بخور", "بخور", "منوعات"]);
});

console.log("crawler + large catalogues");
const productPage = (i: number, cat: string) => `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"منتج ${i}","sku":"s${i}","image":"https://cdn.x/${i}.jpg",
"offers":{"@type":"Offer","price":"${10 + i}","priceCurrency":"SAR"}}</script>
<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"position":1,"name":"الرئيسية"},{"position":2,"name":"${cat}"},{"position":3,"name":"منتج ${i}"}]}</script></head></html>`;
const sallaSite = (n: number, robots = "User-agent: *\nDisallow: /cart\nDisallow: /*/p9*\nSitemap: https://shop.salla.sa/sitemap.xml") => mockFetch({
  "/robots.txt": () => res(robots, 200, "text/plain"),
  "/sitemap.xml": () => res(`<sitemapindex><sitemap><loc>https://shop.salla.sa/sitemap-pages.xml</loc></sitemap><sitemap><loc>https://shop.salla.sa/sitemap-products.xml</loc></sitemap></sitemapindex>`, 200, "application/xml"),
  "/sitemap-products.xml": () => res(`<urlset>${Array.from({ length: n }, (_, i) => `<url><loc>https://shop.salla.sa/item-${i}/p${1000 + i}</loc></url>`).join("")}<url><loc>https://shop.salla.sa/x/p9999</loc></url></urlset>`, 200, "application/xml"),
  "/sitemap-pages.xml": () => res(`<urlset><url><loc>https://shop.salla.sa/about</loc></url></urlset>`, 200, "application/xml"),
  "/p": () => { return res(productPage(0, "x"), 200, "text/html"); },
  "shop.salla.sa": () => res(`<html><head><title>متجر الورد</title><meta name="theme-color" content="#7a3b69"><script src="https://cdn.salla.network/x.js"></script></head></html>`, 200, "text/html"),
});
await t("salla store without OAuth: public sitemap + schema.org pages, robots respected", async () => {
  let calls: string[] = [];
  const base = sallaSite(12);
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push(url);
    const m = url.match(/item-(\d+)\/p\d+/);
    if (m) return res(productPage(+m[1], +m[1] % 2 ? "عطور" : "ورد"), 200, "text/html");
    return base(url);
  };
  const r = await extractStore("https://shop.salla.sa", { fetcher });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.value.platform, "salla");
  assert.equal(r.value.products.length, 12);
  assert.ok(!calls.some((c) => c.includes("p9999")), "fetched a robots-disallowed page");
  const L = buildLayout(r.value);
  assert.deepEqual(new Set(L.sections.map((s) => s.title)), new Set(["عطور", "ورد"]));
  const h = (await import("../src/pipeline/theme.ts")).hexToHsl(L.theme.primary)!.h;
  assert.ok(Math.abs(h - 315) < 3, `store hue lost: ${h}`); // brand colour #7a3b69 is kept
});
await t("crawler stops at the page cap", async () => {
  let pages = 0;
  const base = sallaSite(200);
  const fetcher = async (url: string) => { if (/item-\d+/.test(url)) { pages++; return res(productPage(pages, "ورد"), 200, "text/html"); } return base(url); };
  const r = await extractStore("https://shop.salla.sa", { fetcher });
  assert.ok(r.ok);
  assert.ok(pages <= 36, `${pages} pages fetched`);
});
await t("robots wildcard rules and breadcrumb categories", async () => {
  const rb = await loadRobots(mockFetch({ "/robots.txt": () => res("User-agent: *\nDisallow: /*?sort=\nAllow: /products/\nDisallow: /", 200, "text/plain") }), "https://a.com");
  assert.equal(rb.allows("/products/x"), true);
  assert.equal(rb.allows("/about"), false);
  assert.equal(breadcrumbCategory(productPage(1, "قهوة")), "قهوة");
  assert.equal(detectPlatformFromHtml('<script src="https://cdn.shopify.com/s.js">'), "shopify");
});
const bigStore = (n: number, cats: number): RawStoreData => ({
  platform: "jsonld", sourceUrl: "https://big.example", storeName: "كبير", themeColorHints: [], products:
    Array.from({ length: n }, (_, i) => ({ id: `b${i}`, title: `منتج ${i}`, price: 10 + i, category: `قسم ${i % cats}` })),
});
await t("80 products in one category span several shelves of the market template", () => {
  const L = buildLayout(bigStore(80, 1));
  assert.equal(L.template.id, "cozy-market");
  assert.equal(L.products.length, 80);
  assert.ok(L.sections.length >= 5, `${L.sections.length} shelves`);
});
await t("216 products / 20 categories: fills every shelf, extra categories merge into منوعات, no overlaps", () => {
  const L = buildLayout(bigStore(216, 20));
  assert.equal(L.products.length, 216);
  assert.equal(L.sections.length, 12);
  assert.ok(L.sections.some((s) => s.title === "منوعات"));
  const key = (p: { position: number[] }) => p.position.map((v) => v.toFixed(2)).join(",");
  assert.equal(new Set(L.products.map(key)).size, 216, "two products share a slot");
  const hw = L.template.width / 2, hd = L.template.depth / 2;
  assert.ok(L.products.every((p) => Math.abs(p.position[0]) < hw && Math.abs(p.position[2]) < hd));
});
await t("market shelves do not overlap each other (2D footprints)", () => {
  const secs = buildLayout(bigStore(216, 12)).template.sections;
  const rect = (s: typeof secs[number]) => {
    const along = Math.abs(Math.cos(s.rotationY)) > 0.5; // runs along X
    const hx = along ? s.shelfLength / 2 : 0.28, hz = along ? 0.28 : s.shelfLength / 2;
    return [s.x - hx, s.x + hx, s.z - hz, s.z + hz];
  };
  for (let i = 0; i < secs.length; i++) for (let j = i + 1; j < secs.length; j++) {
    const a = rect(secs[i]), b = rect(secs[j]);
    const overlap = a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3];
    assert.ok(!overlap, `${secs[i].id} overlaps ${secs[j].id}`);
  }
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
