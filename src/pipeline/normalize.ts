import type { NormalizedStore, RawStoreData, NormalizedProduct } from "./types.ts";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function parsePrice(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, ".").replace(/[^\d.,-]/g, "");
  // "1,299.00" → 1299.00 ; "1.299,00" → 1299.00
  const norm = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : null;
}

export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "") || "general";
}

const PLACEHOLDER = "products/placeholder.svg";

/** Stage 2 — Store Data Normalization. Pure function. */
export function normalizeStore(raw: RawStoreData, maxProducts = 216): NormalizedStore {
  const currency = (raw.currency ?? raw.products.find((p) => p.currency)?.currency ?? "SAR").toUpperCase();
  const seen = new Set<string>();
  const products: NormalizedProduct[] = [];
  const categories = new Map<string, string>();

  for (const p of raw.products) {
    const price = parsePrice(p.price);
    const name = (p.title ?? "").trim();
    if (!name || price == null || price < 0) continue; // unusable record
    const id = p.id || slug(name);
    if (seen.has(id)) continue;
    seen.add(id);
    const catName = (p.category ?? "").trim() || "منتجات مختارة";
    const catId = slug(catName);
    categories.set(catId, catName);
    products.push({
      id,
      name: name.slice(0, 80),
      price: Math.round(price * 100) / 100,
      currency: (p.currency ?? currency).toUpperCase(),
      image: p.imageUrl || (raw.platform === "demo" ? `products/${id}.svg` : PLACEHOLDER),
      categoryId: catId,
      description: (p.description ?? "").slice(0, 220),
      url: p.url,
      variantId: p.variantId,
      available: p.available !== false,
    });
    if (products.length >= maxProducts) break;
  }

  return {
    platform: raw.platform,
    sourceUrl: raw.sourceUrl,
    name: (raw.storeName ?? "").trim() || new URL(raw.sourceUrl.replace(/^demo:/, "https:")).hostname,
    currency,
    locale: raw.locale ?? "ar-SA",
    categories: [...categories].map(([id, name]) => ({ id, name })),
    products,
    themeColorHints: raw.themeColorHints,
    checkoutHints: raw.checkoutHints,
  };
}
