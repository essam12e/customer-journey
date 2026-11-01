import type { Platform, RawStoreData, Result } from "../types.ts";
import { DEMO_STORE } from "../demoStore.ts";
import { fail, parseStoreUrl, type Fetcher } from "./http.ts";
import { extractShopify } from "./shopify.ts";
import { extractJsonLd } from "./jsonld.ts";
import { extractSalla } from "./salla.ts";
import { extractZid } from "./zid.ts";

export interface ExtractOptions {
  fetcher?: Fetcher;
  tokens?: { salla?: string; zid?: string };
}

export function detectPlatform(u: URL): Platform | "unknown" {
  const h = u.hostname.toLowerCase();
  if (h.endsWith(".myshopify.com")) return "shopify";
  if (h === "salla.sa" || h.endsWith(".salla.sa") || h === "salla.store" || h.endsWith(".salla.store")) return "salla";
  if (h.endsWith(".zid.store") || h === "zid.store") return "zid";
  return "unknown";
}

/** Stage 1 — Store Data Extraction. Tries only official or public, permitted sources. */
export async function extractStore(input: string, opts: ExtractOptions = {}): Promise<Result<RawStoreData>> {
  if (input.trim() === "" || input.startsWith("demo://")) return { ok: true, value: DEMO_STORE };
  const url = parseStoreUrl(input);
  if (!url) return fail("invalid_url", "الرابط غير صالح");
  const fetcher = opts.fetcher ?? fetch;

  const platform = detectPlatform(url);
  if (platform === "salla") return extractSalla(fetcher, url, opts.tokens?.salla);
  if (platform === "zid") return extractZid(url, opts.tokens?.zid);
  if (platform === "shopify") return extractShopify(fetcher, url.origin);

  // Unknown host (custom domains): Shopify public catalogue first, then schema.org JSON-LD.
  const shop = await extractShopify(fetcher, url.origin);
  if (shop.ok || shop.error.kind === "blocked") return shop;
  const ld = await extractJsonLd(fetcher, url);
  if (ld.ok) return ld;
  // Report the most informative failure.
  return ld.error.kind === "network" && shop.error.kind !== "network" ? shop : ld;
}
