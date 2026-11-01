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
 * 1. If there are more categories than shelves, the smallest ones merge into «منوعات».
 * 2. Every category gets one shelf; spare shelves go to the categories that overflow most.
 * 3. Within a shelf, products prefer eye-level boards (1, then 2, then 0).
 */
export function placeProducts(store: NormalizedStore, template: StoreTemplate, theme: StoreTheme): StoreLayout {
  const order = ["back-left", "back-right", "island-left", "island-right", "island-left-back", "island-right-back",
    "left-wall", "right-wall", "left-wall-back", "right-wall-back", "left-wall-front", "right-wall-front"];
  const slots = [...template.sections].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  let groups = store.categories
    .map((c) => ({ id: c.id, name: c.name, items: store.products.filter((p) => p.categoryId === c.id) }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  // shelf allocation: keep as many categories as possible such that every product still fits
  const cap = (s: SectionSlot) => s.levels * s.slotsPerLevel;
  const avgCap = slots.length ? cap(slots[0]) : 1;
  const need = (n: number) => Math.max(1, Math.ceil(n / avgCap));
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const fits = (k: number) => {
    const kept = groups.slice(0, k).reduce((n, g) => n + need(g.items.length), 0);
    const rest = groups.slice(k).reduce((n, g) => n + g.items.length, 0);
    return kept + (rest ? need(rest) : 0) <= slots.length;
  };
  if (groups.length > slots.length || !fits(groups.length)) {
    let k = Math.min(groups.length, slots.length - 1);
    while (k > 0 && !fits(k)) k--;
    if (total <= slots.length * avgCap || k > 0) {
      const rest = groups.slice(k);
      groups = [...groups.slice(0, k), ...(rest.length ? [{ id: "mixed", name: "منوعات", items: rest.flatMap((g) => g.items) }] : [])];
    }
  }
  const alloc = groups.map((g) => need(g.items.length));
  // shrink if still over (catalogue bigger than the store): trim the largest allocations
  while (alloc.reduce((a, b) => a + b, 0) > slots.length) alloc[alloc.indexOf(Math.max(...alloc))]--;
  let free = slots.length - alloc.reduce((a, b) => a + b, 0);
  while (free > 0) {
    let best = -1, bestOver = 0;
    groups.forEach((g, i) => {
      const over = g.items.length - alloc[i] * avgCap;
      if (over > bestOver) { bestOver = over; best = i; }
    });
    if (best < 0) break;
    alloc[best]++;
    free--;
  }

  const sections: PlacedSection[] = [];
  const products: PlacedProduct[] = [];
  const levelPref = [1, 2, 0];
  let si = 0;
  groups.forEach((g, gi) => {
    const color = sectionColor(theme, gi);
    let queue = g.items;
    for (let k = 0; k < alloc[gi] && si < slots.length; k++) {
      const sec = slots[si++];
      sections.push({ slotId: sec.id, categoryId: g.id, title: g.name, color });
      const here = queue.slice(0, cap(sec));
      queue = queue.slice(cap(sec));
      const perLevel = sec.slotsPerLevel;
      here.forEach((p, i) => {
        const row = Math.floor(i / perLevel);
        const onThisLevel = Math.min(perLevel, here.length - row * perLevel);
        products.push({
          product: p,
          position: slotPosition(sec, levelPref[row], i % perLevel, onThisLevel),
          rotationY: sec.rotationY,
          shape: shapeFor(p.name, g.name),
          color,
        });
      });
    }
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
