// Shared contracts between pipeline stages. Each stage only depends on the previous stage's output.

export type Platform = "demo" | "shopify" | "salla" | "zid" | "jsonld";

/** Stage 1 output: whatever the source gave us, lightly typed. */
export interface RawStoreData {
  platform: Platform;
  sourceUrl: string;
  storeName?: string;
  logoUrl?: string;
  themeColorHints: string[]; // e.g. <meta name="theme-color">, brand colors from API
  currency?: string;
  locale?: string;
  products: RawProduct[];
  checkoutHints?: { shopifyDomain?: string };
}

export interface RawProduct {
  id: string;
  title: string;
  price: number | string | null;
  currency?: string;
  imageUrl?: string;
  category?: string;
  description?: string;
  url?: string;
  variantId?: string; // needed for real checkout links (Shopify)
  available?: boolean;
}

export type ExtractErrorKind =
  | "invalid_url"
  | "blocked" // robots / CORS / 403 — the store does not allow it
  | "auth_required" // official API needs merchant authorization (Salla/Zid)
  | "not_found"
  | "no_products"
  | "unsupported"
  | "network";

export type Result<T> = { ok: true; value: T } | { ok: false; error: { kind: ExtractErrorKind; message: string } };

/** Stage 2 output */
export interface NormalizedProduct {
  id: string;
  name: string;
  price: number; // in major units, e.g. 129.5
  currency: string;
  image: string; // always present (placeholder if missing)
  categoryId: string;
  description: string;
  url?: string;
  variantId?: string;
  available: boolean;
}

export interface NormalizedCategory {
  id: string;
  name: string;
}

export interface NormalizedStore {
  platform: Platform;
  sourceUrl: string;
  name: string;
  currency: string;
  locale: string;
  categories: NormalizedCategory[];
  products: NormalizedProduct[];
  themeColorHints: string[];
  checkoutHints?: RawStoreData["checkoutHints"];
}

/** Stage 3 output */
export interface StoreTheme {
  primary: string;
  accent: string;
  wall: string;
  floor: string;
  wood: string;
  mood: "warm" | "fresh" | "calm";
}

/** Stage 4 output */
export interface StoreTemplate {
  id: string;
  name: string;
  width: number; // X (m)
  depth: number; // Z (m)
  height: number;
  entrance: { x: number; z: number; doorWidth: number };
  /** Aisle slots that can each host one category. */
  sections: SectionSlot[];
}

export interface SectionSlot {
  id: string;
  x: number;
  z: number;
  rotationY: number; // radians, shelf front faces +Z rotated by this
  shelfLength: number;
  levels: number; // shelf boards
  slotsPerLevel: number;
}

/** Stage 5 output — the ONLY thing the game engine consumes. */
export interface StoreLayout {
  store: { name: string; currency: string; platform: Platform; sourceUrl: string };
  theme: StoreTheme;
  template: StoreTemplate;
  sections: PlacedSection[];
  products: PlacedProduct[];
  spawn: { x: number; z: number; yaw: number };
}

export interface PlacedSection {
  slotId: string;
  categoryId: string;
  title: string;
  color: string;
}

export interface PlacedProduct {
  product: NormalizedProduct;
  position: [number, number, number];
  rotationY: number;
  shape: "box" | "bottle" | "jar" | "bag";
  color: string;
}
