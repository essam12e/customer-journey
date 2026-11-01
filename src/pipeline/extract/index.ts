import type { Platform, RawProduct, RawStoreData, Result } from "../types.ts";
import { DEMO_STORE } from "../demoStore.ts";
import { fail, fetchClassified, ok, parseStoreUrl, type Fetcher } from "./http.ts";
import { extractShopify } from "./shopify.ts";
import { parseJsonLdHtml } from "./jsonld.ts";
import { extractSalla } from "./salla.ts";
import { extractZid } from "./zid.ts";
import { CRAWL, crawlProducts, discoverProductUrls, loadRobots } from "./crawl.ts";

export interface ExtractOptions {
  fetcher?: Fetcher;
  tokens?: { salla?: string; zid?: string };
  budgetMs?: number;
}

export function detectPlatform(u: URL): Platform | "unknown" {
  const h = u.hostname.toLowerCase();
  if (h.endsWith(".myshopify.com")) return "shopify";
  if (h === "salla.sa" || h.endsWith(".salla.sa") || h === "salla.store" || h.endsWith(".salla.store")) return "salla";
  if (h.endsWith(".zid.store") || h === "zid.store") return "zid";
  return "unknown";
}

/** Platform fingerprint from a storefront's HTML (custom domains). */
export function detectPlatformFromHtml(html: string): Platform | "unknown" {
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) return "shopify";
  if (/cdn\.salla\.(sa|network)|salla\.(sa|network)\/|twilight/i.test(html)) return "salla";
  if (/zid\.store|media\.zid\.(store|sa)|zidcdn/i.test(html)) return "zid";
  return "unknown";
}

const dedupe = (list: RawProduct[]) => {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = p.url ?? p.id ?? p.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Public, permitted data only: the page the merchant gave us + product pages listed in the
 * store's own sitemap, all filtered through robots.txt. Works for any platform.
 */
export async function extractPublic(fetcher: Fetcher, url: URL, platform: Platform | "unknown", deadline: number): Promise<Result<RawStoreData>> {
  const robots = await loadRobots(fetcher, url.origin);
  if (!robots.allows(url.pathname || "/")) return fail("blocked", "robots.txt disallows reading this store");

  const page = await fetchClassified(fetcher, url.toString(), { headers: { accept: "text/html" } });
  if (!page.ok) return page;
  const html = await page.value.text();
  const first = parseJsonLdHtml(html, url.toString());
  const detected = platform !== "unknown" ? platform : detectPlatformFromHtml(html);

  let products = first.products;
  if (products.length < 8 && Date.now() < deadline) {
    const urls = await discoverProductUrls(fetcher, url.origin, robots, deadline);
    if (urls.length) products = dedupe([...products, ...(await crawlProducts(fetcher, urls, deadline))]);
  }
  if (products.length === 0) {
    // Salla (Twilight) and Zid storefronts render the catalogue in the browser: the public HTML has
    // no product data, so the only correct path is the platform's official app (merchant OAuth).
    if (detected === "salla") return fail("auth_required", "هذا متجر على منصة سلة، وصفحاته لا تنشر بيانات المنتجات للقراءة العامة. لتحويله يلزم ربط تطبيق «رحلة العميل» من متجر تطبيقات سلة بموافقة التاجر.");
    if (detected === "zid") return fail("auth_required", "هذا متجر على منصة زد، وصفحاته لا تنشر بيانات المنتجات للقراءة العامة. لتحويله يلزم ربط تطبيق «رحلة العميل» من سوق تطبيقات زد بموافقة التاجر.");
    return fail("no_products", "the store publishes no schema.org Product data on its pages or sitemap");
  }
  return ok({
    ...first,
    platform: detected === "unknown" || detected === "shopify" ? "jsonld" : detected,
    sourceUrl: url.origin,
    products,
  });
}

/** Stage 1 — Store Data Extraction. Tries only official APIs or public, permitted sources. */
export async function extractStore(input: string, opts: ExtractOptions = {}): Promise<Result<RawStoreData>> {
  if (input.trim() === "" || input.startsWith("demo://")) return { ok: true, value: DEMO_STORE };
  const url = parseStoreUrl(input);
  if (!url) return fail("invalid_url", "الرابط غير صالح");
  const fetcher = opts.fetcher ?? fetch;
  const deadline = Date.now() + (opts.budgetMs ?? CRAWL.BUDGET_MS);

  const platform = detectPlatform(url);

  // Official merchant APIs when the merchant has authorized us; otherwise public data.
  if (platform === "salla" || platform === "zid") {
    const token = platform === "salla" ? opts.tokens?.salla : opts.tokens?.zid;
    if (token) return platform === "salla" ? extractSalla(fetcher, url, token) : extractZid(url, token);
    const pub = await extractPublic(fetcher, url, platform, deadline);
    if (pub.ok) return pub;
    return platform === "salla" ? extractSalla(fetcher, url) : extractZid(url); // explains auth_required
  }

  // Shopify (or a custom domain that might be Shopify): public catalogue JSON first.
  const shop = await extractShopify(fetcher, url.origin);
  if (shop.ok) {
    const home = await fetchClassified(fetcher, url.origin, { headers: { accept: "text/html" } }, 5000);
    if (home.ok) {
      const meta = parseJsonLdHtml(await home.value.text(), url.origin);
      shop.value.storeName ??= meta.storeName;
      shop.value.themeColorHints = meta.themeColorHints;
      shop.value.locale ??= meta.locale;
    }
    return shop;
  }
  if (shop.error.kind === "blocked" && platform === "shopify") return shop;

  const pub = await extractPublic(fetcher, url, platform, deadline);
  if (pub.ok) return pub;
  // Report the most informative failure.
  return pub.error.kind === "network" && shop.error.kind !== "network" && shop.error.kind !== "unsupported" && shop.error.kind !== "not_found" ? shop : pub;
}
