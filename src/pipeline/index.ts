import type { RawStoreData, StoreLayout } from "./types.ts";
import { normalizeStore } from "./normalize.ts";
import { detectTheme } from "./theme.ts";
import { capacity, selectTemplate } from "./templates.ts";
import { placeProducts } from "./placement.ts";
import { DEMO_STORE } from "./demoStore.ts";

/** Stages 2 → 5. Extraction (stage 1) is async and lives in ./extract. */
export function buildLayout(raw: RawStoreData): StoreLayout {
  const store = normalizeStore(raw);
  const template = selectTemplate(store);
  const theme = detectTheme(store);
  const trimmed = { ...store, products: store.products.slice(0, capacity(template)) };
  return placeProducts(trimmed, template, theme);
}

export const demoLayout = () => buildLayout(DEMO_STORE);
export type { StoreLayout } from "./types.ts";
