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
      if (!isType(o, "Product")) continue;
      const offers = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Json | undefined;
      const img = Array.isArray(o.image) ? o.image[0] : o.image;
      const imageUrl = typeof img === "string" ? img : (img as Json | undefined)?.url as string | undefined;
      products.push({
        id: String(o.sku ?? o.productID ?? o["@id"] ?? `${products.length + 1}`),
        title: String(o.name ?? "منتج"),
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
  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1];
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
