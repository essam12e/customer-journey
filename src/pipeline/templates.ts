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

export const TEMPLATES = [COZY_BOUTIQUE];

/** Stage 4 — 3D Store Template Selection. One template today; picks by capacity when more exist. */
export function selectTemplate(store: NormalizedStore): StoreTemplate {
  const need = Math.max(store.categories.length, 1);
  const fits = TEMPLATES.filter((t) => t.sections.length >= need);
  return fits[0] ?? TEMPLATES[TEMPLATES.length - 1];
}

export const capacity = (t: StoreTemplate) => t.sections.reduce((n, s) => n + s.levels * s.slotsPerLevel, 0);
