import type { RawProduct, RawStoreData, Result } from "../types.ts";
import { fail, fetchClassified, ok, robotsAllows, type Fetcher } from "./http.ts";

// Shopify storefronts publish /products.json and /meta.json publicly unless the merchant disables them.
// This is public, unauthenticated catalogue data; we still honour robots.txt.

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  product_type?: string;
  images?: { src: string }[];
  variants?: { id: number; price: string; available?: boolean }[];
}

export async function extractShopify(fetcher: Fetcher, origin: string): Promise<Result<RawStoreData>> {
  if (!(await robotsAllows(fetcher, origin, "/products.json"))) {
    return fail("blocked", "robots.txt disallows /products.json for this store");
  }
  const res = await fetchClassified(fetcher, `${origin}/products.json?limit=60`);
  if (!res.ok) return res;
  let body: { products?: ShopifyProduct[] };
  try {
    body = await res.value.json();
  } catch {
    return fail("unsupported", "products.json is not JSON — probably not a Shopify store");
  }
  if (!Array.isArray(body.products)) return fail("unsupported", "no products array — not a Shopify storefront");
  if (body.products.length === 0) return fail("no_products", "the store has no public products");

  let storeName: string | undefined;
  let currency: string | undefined;
  const meta = await fetchClassified(fetcher, `${origin}/meta.json`, {}, 4000);
  if (meta.ok) {
    try {
      const m = await meta.value.json();
      storeName = m.name;
      currency = m.currency;
    } catch {
      /* optional */
    }
  }

  const products: RawProduct[] = body.products.map((p) => ({
    id: String(p.id),
    title: p.title,
    price: p.variants?.[0]?.price ?? null,
    imageUrl: p.images?.[0]?.src,
    category: p.product_type || undefined,
    description: (p.body_html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220),
    url: `${origin}/products/${p.handle}`,
    variantId: p.variants?.[0]?.id ? String(p.variants[0].id) : undefined,
    available: p.variants?.some((v) => v.available !== false) ?? true,
  }));

  return ok({
    platform: "shopify",
    sourceUrl: origin,
    storeName,
    currency,
    themeColorHints: [],
    products,
    checkoutHints: { shopifyDomain: new URL(origin).host },
  });
}
