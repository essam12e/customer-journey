import type { RawStoreData, Result } from "../types.ts";
import { fail } from "./http.ts";

// Zid: catalogue access goes through the official Zid Merchant API after the merchant authorizes
// our app (OAuth via Zid Partners). Not implemented yet — we return a clear, typed error instead of
// scraping the storefront. Docs: https://docs.zid.sa
export async function extractZid(_storeUrl: URL, accessToken?: string): Promise<Result<RawStoreData>> {
  if (!accessToken) {
    return fail("auth_required", "متاجر زد تتطلب ربط تطبيق رسمي عبر Zid Partners وموافقة التاجر (OAuth)");
  }
  return fail("unsupported", "محوّل زد قيد التطوير: يلزم التحقق من حقول Zid Merchant API قبل التفعيل");
}
