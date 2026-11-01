import type { RawProduct } from "../types.ts";
import { fetchClassified, type Fetcher } from "./http.ts";
import { decodeEntities, metaContent, parseJsonLdHtml } from "./jsonld.ts";

// Polite public-catalogue crawler for stores that publish schema.org Product data on product pages
// (Salla, Zid, WooCommerce, Shopify and most custom stores do, for search engines).
// Rules: robots.txt is honoured for every URL, at most MAX_PAGES pages, CONCURRENCY parallel
// requests, and a hard time budget. Nothing behind a login is ever requested.

export const CRAWL = { MAX_PAGES: 36, CONCURRENCY: 4, BUDGET_MS: 25_000, MAX_SITEMAPS: 6 };

export interface Robots { allows: (path: string) => boolean; sitemaps: string[] }

export async function loadRobots(fetcher: Fetcher, origin: string): Promise<Robots> {
  const r = await fetchClassified(fetcher, `${origin}/robots.txt`, {}, 5000);
  const text = r.ok ? await r.value.text() : "";
  const disallow: string[] = [], allow: string[] = [], sitemaps: string[] = [];
  let applies = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "sitemap" && val) sitemaps.push(val);
    else if (key === "user-agent") applies = val === "*" || /customerjourney/i.test(val);
    else if (applies && key === "disallow" && val) disallow.push(val);
    else if (applies && key === "allow" && val) allow.push(val);
  }
  const toRe = (rule: string) => new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  const match = (rules: string[], path: string) => Math.max(-1, ...rules.filter((r) => toRe(r).test(path)).map((r) => r.length));
  return { allows: (path) => match(allow, path) >= match(disallow, path), sitemaps };
}

const PRODUCT_URL = /\/(p\d{3,}|products?\/[^/?#]+|item\/[^/?#]+)(?:[/?#]|$)/i;

export function extractLocs(xml: string): string[] {
  return extractEntries(xml).map((e) => e.loc);
}

/** <url>/<sitemap> entries with their optional <lastmod>, in document order. */
export function extractEntries(xml: string): { loc: string; lastmod: number }[] {
  const out: { loc: string; lastmod: number }[] = [];
  for (const m of xml.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/gi)) {
    const loc = m[2].match(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/i)?.[1];
    if (!loc) continue;
    const lm = Date.parse(m[2].match(/<lastmod>\s*([^<\s]+)/i)?.[1] ?? "");
    out.push({ loc: loc.replace(/&amp;/g, "&"), lastmod: Number.isFinite(lm) ? lm : 0 });
  }
  if (out.length === 0) for (const m of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)) out.push({ loc: m[1].replace(/&amp;/g, "&"), lastmod: 0 });
  return out;
}

/** Finds product page URLs from robots.txt sitemaps (or /sitemap.xml), following sitemap indexes. */
export async function discoverProductUrls(fetcher: Fetcher, origin: string, robots: Robots, deadline: number): Promise<string[]> {
  const queue = robots.sitemaps.length ? [...robots.sitemaps] : [`${origin}/sitemap.xml`];
  // product sitemaps first (e.g. sitemap_products_1.xml, product-sitemap.xml)
  const seen = new Set<string>();
  const products: { url: string; lastmod: number; order: number }[] = [];
  let fetched = 0;
  while (queue.length && fetched < CRAWL.MAX_SITEMAPS && Date.now() < deadline && products.length < CRAWL.MAX_PAGES * 3) {
    queue.sort((a, b) => Number(/product/i.test(b)) - Number(/product/i.test(a)));
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    let u: URL;
    try { u = new URL(url, origin); } catch { continue; }
    // follow the merchant's own sitemap index, including platform-hosted child sitemaps (e.g. salla.sa/<store>/sitemap-1.xml)
    const platformHost = /(^|\.)(salla\.sa|zid\.store|myshopify\.com)$/i.test(u.hostname);
    if (u.origin !== origin && !u.hostname.endsWith(new URL(origin).hostname) && !platformHost) continue;
    const r = await fetchClassified(fetcher, u.toString(), { headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.5" } }, 6000);
    fetched++;
    if (!r.ok) continue;
    const xml = await r.value.text();
    const entries = extractEntries(xml);
    if (/<sitemapindex/i.test(xml)) { queue.push(...entries.map((e) => e.loc)); continue; }
    for (const e of entries) {
      try {
        const lu = new URL(e.loc);
        if (PRODUCT_URL.test(lu.pathname) && robots.allows(lu.pathname)) products.push({ url: lu.toString(), lastmod: e.lastmod, order: products.length });
      } catch { /* skip */ }
    }
  }
  // newest first (sitemaps are usually oldest-first, which surfaces discontinued items)
  products.sort((a, b) => b.lastmod - a.lastmod || b.order - a.order);
  return [...new Set(products.map((p) => p.url))];
}

/** Reads schema.org Product (+ BreadcrumbList category) from product pages, politely. */
export async function crawlProducts(fetcher: Fetcher, urls: string[], deadline: number): Promise<RawProduct[]> {
  const out: RawProduct[] = [];
  const list = urls.slice(0, CRAWL.MAX_PAGES);
  let i = 0;
  const worker = async () => {
    while (i < list.length && Date.now() < deadline) {
      const url = list[i++];
      const r = await fetchClassified(fetcher, url, { headers: { accept: "text/html" } }, 7000);
      if (!r.ok) continue;
      const html = await r.value.text();
      const page = parseJsonLdHtml(html, url);
      const crumb = breadcrumbCategory(html);
      const ogImage = metaContent(html, "og:image:secure_url") ?? metaContent(html, "og:image");
      for (const p of page.products.slice(0, 1)) {
        out.push({
          ...p,
          url: p.url ?? url,
          category: p.category ?? crumb,
          imageUrl: p.imageUrl ?? (ogImage ? new URL(ogImage, url).toString() : undefined),
          description: p.description ? decodeEntities(p.description) : undefined,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: CRAWL.CONCURRENCY }, worker));
  return out;
}

/** Category = the breadcrumb item just before the product itself. */
export function breadcrumbCategory(html: string): string | undefined {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const nodes = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const n of nodes) {
        if (n?.["@type"] !== "BreadcrumbList" || !Array.isArray(n.itemListElement)) continue;
        const items = [...n.itemListElement].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const names = items.map((it) => it.name ?? it.item?.name).filter(Boolean) as string[];
        if (names.length >= 3) return names[names.length - 2];
        if (names.length === 2) return undefined; // Home › Product: no category
      }
    } catch { /* malformed block */ }
  }
  return undefined;
}
