import type { RawProduct, RawStoreData, Result } from "../types.ts";
import { fail, fetchClassified, ok, robotsAllows, type Fetcher } from "./http.ts";

// Generic, platform-neutral path: read the public schema.org Product data that stores publish
// for search engines (JSON-LD), plus <meta name="theme-color"> and og:site_name.

type Json = Record<string, unknown>;

function* walk(node: unknown): Generator<Json> {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === "object") {
    const o = node as Json;
    yield o;
    for (const k of ["@graph", "itemListElement", "item", "mainEntity"]) if (k in o) yield* walk(o[k]);
  }
}

const isType = (o: Json, t: string) => {
  const ty = o["@type"];
  return ty === t || (Array.isArray(ty) && ty.includes(t));
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(v: string): string {
  return v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m);
}

/** <meta property|name="x" content="y"> in any attribute order, quote style or line layout. */
export function metaContent(html: string, name: string): string | undefined {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!new RegExp(`(?:property|name|itemprop)\\s*=\\s*["']${esc}["']`, "i").test(tag)) continue;
    const c = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (c) return decodeEntities((c[1] ?? c[2] ?? "").trim());
  }
  return undefined;
}

export function parseJsonLdHtml(html: string, pageUrl: string): Omit<RawStoreData, "platform"> & { platform: "jsonld" } {
  const products: RawProduct[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const o of walk(data)) {
      // Product, or ProductGroup (product with variants, e.g. newer Shopify themes)
      if (!isType(o, "Product") && !isType(o, "ProductGroup")) continue;
      if (isType(o, "Product") && o.isVariantOf) continue; // a variant listed inside its group
      const variant = (Array.isArray(o.hasVariant) ? o.hasVariant[0] : undefined) as Json | undefined;
      const offerSrc = o.offers ?? variant?.offers;
      const offers = (Array.isArray(offerSrc) ? offerSrc[0] : offerSrc) as Json | undefined;
      const imgSrc = o.image ?? variant?.image;
      const img = Array.isArray(imgSrc) ? imgSrc[0] : imgSrc;
      const imageUrl = typeof img === "string" ? img : (img as Json | undefined)?.url as string | undefined;
      products.push({
        id: String(o.sku ?? o.productID ?? o["@id"] ?? `${products.length + 1}`),
        title: decodeEntities(String(o.name ?? "منتج")),
        price: (offers?.price ?? offers?.lowPrice ?? null) as string | number | null,
        currency: offers?.priceCurrency as string | undefined,
        imageUrl: imageUrl ? new URL(imageUrl, pageUrl).toString() : undefined,
        category: typeof o.category === "string" ? o.category : undefined,
        description: typeof o.description === "string" ? o.description.slice(0, 220) : undefined,
        url: typeof o.url === "string" ? new URL(o.url, pageUrl).toString() : undefined,
        available: typeof offers?.availability === "string" ? !/OutOfStock/i.test(offers.availability) : true,
      });
    }
  }
  const meta = (name: string) => metaContent(html, name);
  // Open Graph fallback: product pages that carry og:type=product + og:price:* but no JSON-LD
  if (products.length === 0 && /product/i.test(meta("og:type") ?? "")) {
    const price = meta("og:price:amount") ?? meta("product:price:amount");
    const title = meta("og:title");
    if (title && price) {
      const img = meta("og:image:secure_url") ?? meta("og:image");
      products.push({
        id: meta("product:retailer_item_id") ?? meta("og:url") ?? pageUrl,
        title,
        price,
        currency: meta("og:price:currency") ?? meta("product:price:currency"),
        imageUrl: img ? new URL(img, pageUrl).toString() : undefined,
        description: meta("og:description")?.slice(0, 220),
        url: meta("og:url") ?? pageUrl,
        available: !/out ?of ?stock|oos/i.test(meta("product:availability") ?? meta("og:availability") ?? ""),
      });
    }
  }
  return {
    platform: "jsonld",
    sourceUrl: pageUrl,
    storeName: meta("og:site_name") ?? html.match(/<title>([^<]{1,80})<\/title>/i)?.[1]?.trim(),
    themeColorHints: [meta("theme-color")].filter(Boolean) as string[],
    locale: html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1],
    products,
  };
}

export async function extractJsonLd(fetcher: Fetcher, url: URL): Promise<Result<RawStoreData>> {
  if (!(await robotsAllows(fetcher, url.origin, url.pathname || "/"))) {
    return fail("blocked", "robots.txt disallows reading this page");
  }
  const res = await fetchClassified(fetcher, url.toString());
  if (!res.ok) return res;
  const html = await res.value.text();
  const data = parseJsonLdHtml(html, url.toString());
  if (data.products.length === 0) {
    return fail("no_products", "the page publishes no schema.org Product data; open a category or product page, or connect the platform API");
  }
  return ok(data);
}
