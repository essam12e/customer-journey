import type { RawStoreData, Result } from "../types.ts";
import { fail, fetchClassified, ok, type Fetcher } from "./http.ts";

// Salla: the product catalogue is read through the official Merchant API, which needs an OAuth
// access token that the merchant grants by installing our app from the Salla Partners portal.
// A store link alone is NOT enough, and we do not scrape Salla storefronts.
// Docs: https://docs.salla.dev  — verify field names against the current API version before shipping.

interface SallaProduct {
  id: number | string;
  name: string;
  price?: { amount: number; currency: string };
  main_image?: string;
  thumbnail?: string;
  description?: string;
  url?: string;
  urls?: { customer?: string };
  categories?: { name: string }[];
  status?: string;
}

export async function extractSalla(fetcher: Fetcher, storeUrl: URL, accessToken?: string): Promise<Result<RawStoreData>> {
  if (!accessToken) {
    return fail("auth_required", "متاجر سلة تتطلب ربط تطبيق رسمي عبر Salla Partners وموافقة التاجر (OAuth)");
  }
  const res = await fetchClassified(fetcher, "https://api.salla.dev/admin/v2/products?per_page=60", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return res;
  const body = (await res.value.json()) as { data?: SallaProduct[] };
  const list = body.data ?? [];
  if (list.length === 0) return fail("no_products", "Salla API returned no products");
  return ok({
    platform: "salla",
    sourceUrl: storeUrl.origin,
    themeColorHints: [],
    currency: list[0].price?.currency,
    products: list.map((p) => ({
      id: String(p.id),
      title: p.name,
      price: p.price?.amount ?? null,
      currency: p.price?.currency,
      imageUrl: p.main_image ?? p.thumbnail,
      category: p.categories?.[0]?.name,
      description: p.description?.replace(/<[^>]+>/g, " ").trim().slice(0, 220),
      url: p.urls?.customer ?? p.url,
      available: p.status !== "out",
    })),
  });
}
