import type { NormalizedStore, PlacedProduct, PlacedSection, StoreLayout, StoreTemplate, StoreTheme, SectionSlot } from "./types.ts";
import { hexToHsl, hsl } from "./theme.ts";

// Shelf geometry contract (shared with the engine's Shelf component).
export const SHELF = { depth: 0.55, boardHeights: [0.42, 0.98, 1.54], boardThickness: 0.05 };

const SHAPES: { re: RegExp; shape: PlacedProduct["shape"] }[] = [
  { re: /قهوة|بن|coffee|bean/i, shape: "bag" },
  { re: /شاي|أعشاب|tea|herb/i, shape: "box" },
  { re: /عسل|مربى|honey|jam|جرة/i, shape: "jar" },
  { re: /عطر|زيت|perfume|oil|bottle|شمعة/i, shape: "jar" },
  { re: /شراب|ماء|juice|drink|bottle/i, shape: "bottle" },
];

function shapeFor(name: string, category: string): PlacedProduct["shape"] {
  for (const s of SHAPES) if (s.re.test(name)) return s.shape;
  for (const s of SHAPES) if (s.re.test(category)) return s.shape;
  return "box";
}

/** World position of a slot on a shelf section (on top of a board, at the front lip). */
export function slotPosition(sec: SectionSlot, level: number, index: number, count: number): [number, number, number] {
  const spacing = sec.shelfLength / count;
  const localX = -sec.shelfLength / 2 + spacing * (index + 0.5);
  const localZ = 0.06; // slightly toward the front
  const c = Math.cos(sec.rotationY), s = Math.sin(sec.rotationY);
  // rotate local (x, z) by rotationY around Y
  const wx = sec.x + localX * c + localZ * s;
  const wz = sec.z - localX * s + localZ * c;
  return [wx, SHELF.boardHeights[level] + SHELF.boardThickness / 2, wz];
}

function sectionColor(theme: StoreTheme, i: number): string {
  const p = hexToHsl(theme.accent) ?? { h: 35, s: 0.7, l: 0.6 };
  return hsl({ h: (p.h + i * 47) % 360, s: 0.5, l: 0.66 });
}

/**
 * Stage 5 — Product Placement Engine. Deterministic: same store → same layout.
 * Categories fill sections in order (biggest first); products prefer eye-level boards (1, then 2, then 0).
 */
export function placeProducts(store: NormalizedStore, template: StoreTemplate, theme: StoreTheme): StoreLayout {
  const byCat = new Map(store.categories.map((c) => [c.id, store.products.filter((p) => p.categoryId === c.id)]));
  const cats = [...store.categories].sort((a, b) => (byCat.get(b.id)!.length - byCat.get(a.id)!.length) || a.name.localeCompare(b.name));

  // Front-facing, most visible slots first: back wall, then islands, then side walls.
  const order = ["back-left", "back-right", "island-left", "island-right", "left-wall", "right-wall"];
  const slots = [...template.sections].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  const sections: PlacedSection[] = [];
  const products: PlacedProduct[] = [];
  const levelPref = [1, 2, 0];

  // Assign each category to one slot; overflow categories share the last slots round-robin.
  cats.forEach((cat, ci) => {
    const sec = slots[ci % slots.length];
    const color = sectionColor(theme, ci);
    if (ci < slots.length) sections.push({ slotId: sec.id, categoryId: cat.id, title: cat.name, color });
    const items = byCat.get(cat.id)!;
    const perLevel = sec.slotsPerLevel;
    items.slice(0, sec.levels * perLevel).forEach((p, i) => {
      const level = levelPref[Math.floor(i / perLevel)];
      // spread a small count evenly across the shelf instead of bunching left
      const onThisLevel = Math.min(perLevel, items.length - Math.floor(i / perLevel) * perLevel);
      const idx = i % perLevel;
      products.push({
        product: p,
        position: slotPosition(sec, level, idx, onThisLevel),
        rotationY: sec.rotationY,
        shape: shapeFor(p.name, cat.name),
        color,
      });
    });
  });

  return {
    store: { name: store.name, currency: store.currency, platform: store.platform, sourceUrl: store.sourceUrl },
    theme,
    template,
    sections,
    products,
    spawn: { x: template.entrance.x, z: template.entrance.z + 4.5, yaw: 0 },
  };
}
