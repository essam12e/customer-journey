import type { Platform } from "@/pipeline/types";
import type { CartLine } from "./cartStore";

// Stage 8 — Checkout Integration. Each provider states honestly what it can do.
export type CheckoutPlan =
  | { kind: "demo"; message: string }
  | { kind: "redirect"; url: string; message: string }
  | { kind: "unavailable"; message: string };

export function planCheckout(platform: Platform, lines: CartLine[], hints?: { shopifyDomain?: string }): CheckoutPlan {
  if (lines.length === 0) return { kind: "unavailable", message: "السلة فارغة" };
  if (platform === "demo") {
    return { kind: "demo", message: "هذا متجر تجريبي: لن يتم تنفيذ أي عملية شراء أو دفع حقيقية." };
  }
  if (platform === "shopify" && hints?.shopifyDomain && lines.every((l) => l.variantId)) {
    // Shopify cart permalinks: https://{domain}/cart/{variant_id}:{qty},{variant_id}:{qty}
    const items = lines.map((l) => `${l.variantId}:${l.qty}`).join(",");
    return {
      kind: "redirect",
      url: `https://${hints.shopifyDomain}/cart/${items}`,
      message: "سيتم نقلك إلى صفحة الدفع الرسمية للمتجر لإكمال الشراء هناك.",
    };
  }
  return {
    kind: "unavailable",
    message: "إتمام الشراء لهذا المتجر يحتاج ربطًا رسميًا مع المنصة. يمكنك فتح صفحات المنتجات في المتجر الأصلي.",
  };
}
