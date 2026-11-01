import type { NormalizedStore, StoreTemplate } from "./types.ts";

// Metrics (level-design): eye height 1.6 m, capsule radius 0.3 m, aisles ≥ 2.4 m.
const HALF_PI = Math.PI / 2;

export const COZY_BOUTIQUE: StoreTemplate = {
  id: "cozy-boutique",
  name: "بوتيك دافئ",
  width: 16,
  depth: 20,
  height: 4.2,
  entrance: { x: 0, z: 10, doorWidth: 2.6 },
  sections: [
    { id: "back-left", x: -3.6, z: -9.45, rotationY: 0, shelfLength: 3.6, levels: 3, slotsPerLevel: 4 },
    { id: "back-right", x: 3.6, z: -9.45, rotationY: 0, shelfLength: 3.6, levels: 3, slotsPerLevel: 4 },
    { id: "left-wall", x: -7.45, z: -2.5, rotationY: HALF_PI, shelfLength: 3.6, levels: 3, slotsPerLevel: 4 },
    { id: "right-wall", x: 7.45, z: -2.5, rotationY: -HALF_PI, shelfLength: 3.6, levels: 3, slotsPerLevel: 4 },
    { id: "island-left", x: -3.2, z: -2.5, rotationY: 0, shelfLength: 3.2, levels: 3, slotsPerLevel: 4 },
    { id: "island-right", x: 3.2, z: -2.5, rotationY: 0, shelfLength: 3.2, levels: 3, slotsPerLevel: 4 },
  ],
};

/**
 * Same building footprint, denser fit-out for real catalogues: 12 shelves × 3 boards × 6 slots = 216.
 * Aisles stay ≥ 2.4 m (islands at z −6 and −2.5; wall runs at z −7, −2.5, +2.5).
 */
export const COZY_MARKET: StoreTemplate = {
  id: "cozy-market",
  name: "سوق دافئ",
  width: 16,
  depth: 20,
  height: 4.2,
  entrance: { x: 0, z: 10, doorWidth: 2.6 },
  sections: [
    { id: "back-left", x: -3.6, z: -9.45, rotationY: 0, shelfLength: 3.6, levels: 3, slotsPerLevel: 6 },
    { id: "back-right", x: 3.6, z: -9.45, rotationY: 0, shelfLength: 3.6, levels: 3, slotsPerLevel: 6 },
    { id: "island-left", x: -3.2, z: -2.5, rotationY: 0, shelfLength: 3.2, levels: 3, slotsPerLevel: 6 },
    { id: "island-right", x: 3.2, z: -2.5, rotationY: 0, shelfLength: 3.2, levels: 3, slotsPerLevel: 6 },
    { id: "island-left-back", x: -3.2, z: -6, rotationY: 0, shelfLength: 3.2, levels: 3, slotsPerLevel: 6 },
    { id: "island-right-back", x: 3.2, z: -6, rotationY: 0, shelfLength: 3.2, levels: 3, slotsPerLevel: 6 },
    { id: "left-wall", x: -7.45, z: -2.5, rotationY: HALF_PI, shelfLength: 3.6, levels: 3, slotsPerLevel: 6 },
    { id: "right-wall", x: 7.45, z: -2.5, rotationY: -HALF_PI, shelfLength: 3.6, levels: 3, slotsPerLevel: 6 },
    { id: "left-wall-back", x: -7.45, z: -6.9, rotationY: HALF_PI, shelfLength: 3.4, levels: 3, slotsPerLevel: 6 },
    { id: "right-wall-back", x: 7.45, z: -6.9, rotationY: -HALF_PI, shelfLength: 3.4, levels: 3, slotsPerLevel: 6 },
    { id: "left-wall-front", x: -7.45, z: 2.4, rotationY: HALF_PI, shelfLength: 3.6, levels: 3, slotsPerLevel: 6 },
    { id: "right-wall-front", x: 7.45, z: 1.9, rotationY: -HALF_PI, shelfLength: 3.0, levels: 3, slotsPerLevel: 6 },
  ],
};

export const TEMPLATES = [COZY_BOUTIQUE, COZY_MARKET];

export const capacityOf = (t: StoreTemplate) => t.sections.reduce((n, s) => n + s.levels * s.slotsPerLevel, 0);

/** Stage 4 — 3D Store Template Selection: the smallest template that fits the catalogue. */
export function selectTemplate(store: NormalizedStore): StoreTemplate {
  const fits = TEMPLATES.filter((t) => capacityOf(t) >= store.products.length && t.sections.length >= store.categories.length);
  return fits[0] ?? TEMPLATES[TEMPLATES.length - 1];
}

export const capacity = capacityOf;
