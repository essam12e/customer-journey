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

/** Thumbnails in structured data are often tiny (e.g. Shopify `width=100`); ask the CDN for 600px. */
export function upscaleImage(url: string): string {
  try {
    const u = new URL(url);
    if (/cdn\.shopify\.com$/.test(u.hostname) || u.pathname.includes("/cdn/shop/")) {
      if (u.searchParams.has("width")) u.searchParams.set("width", "600");
      u.pathname = u.pathname.replace(/_(\d+)x(\d*)(\.\w+)$/, "_600x$3");
      return u.toString();
    }
    if (/cdn\.salla\.(sa|network)$/.test(u.hostname)) return url.replace(/\/(?:thumbnail|small)\//, "/");
    return url;
  } catch {
    return url;
  }
}

const STOP = new Set(["the", "a", "new", "best", "set", "pack", "جديد", "طقم", "مجموعة", "من", "في", "و"]);
/**
 * When a store publishes no categories at all, infer sections from the leading word of product names
 * (Arabic catalogues: «عطر…», «دهن…», «بخور…»; English: «Women's…», «Men's…»). Only applied when it
 * yields 2–8 groups that cover most products; otherwise everything stays in one section.
 */
export function inferCategories(names: string[]): string[] | null {
  const first = names.map((n) => {
    const w = n.trim().split(/\s+/).find((x) => !STOP.has(x.toLowerCase())) ?? "";
    return w.replace(/[^\p{L}\p{N}'’-]/gu, "");
  });
  const counts = new Map<string, number>();
  first.forEach((w) => w && counts.set(w, (counts.get(w) ?? 0) + 1));
  const groups = [...counts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const covered = groups.reduce((n, [, c]) => n + c, 0);
  if (groups.length < 2 || covered < names.length * 0.6) return null;
  const keep = new Set(groups.map(([w]) => w));
  return first.map((w) => (keep.has(w) ? w : "منوعات"));
}

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
      image: p.imageUrl ? upscaleImage(p.imageUrl) : raw.platform === "demo" ? `products/${id}.svg` : PLACEHOLDER,
      categoryId: catId,
      description: (p.description ?? "").slice(0, 220),
      url: p.url,
      variantId: p.variantId,
      available: p.available !== false,
    });
    if (products.length >= maxProducts) break;
  }

  // no categories published at all → try inferring sections from product names
  if (categories.size === 1 && categories.has("منتجات-مختارة") && products.length > 12) {
    const inferred = inferCategories(products.map((p) => p.name));
    if (inferred) {
      categories.clear();
      products.forEach((p, i) => { p.categoryId = slug(inferred[i]); categories.set(p.categoryId, inferred[i]); });
    }
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
