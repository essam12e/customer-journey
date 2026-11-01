import type { NormalizedStore, StoreTheme } from "./types.ts";

type HSL = { h: number; s: number; l: number };

export function hexToHsl(hex: string): HSL | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hh = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
  }
  return { h: hh, s, l };
}

export function hsl({ h, s, l }: HSL): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

/** Stage 3 — Store Theme Detection. Keeps the store's hue but pulls it into a cozy, soft range. */
export function detectTheme(store: NormalizedStore): StoreTheme {
  const hints = store.themeColorHints.map(hexToHsl).filter((c): c is HSL => !!c && c.s > 0.15);
  const base = hints[0] ?? { h: 176, s: 0.5, l: 0.25 };
  const accentSrc = hints[1] ?? { h: (base.h + 200) % 360, s: 0.8, l: 0.6 };
  const mood: StoreTheme["mood"] = base.h < 70 || base.h > 320 ? "warm" : base.h < 190 ? "fresh" : "calm";
  return {
    primary: hsl({ h: base.h, s: Math.min(base.s, 0.55), l: Math.min(Math.max(base.l, 0.24), 0.36) }),
    accent: hsl({ h: accentSrc.h, s: Math.min(accentSrc.s, 0.8), l: 0.62 }),
    wall: hsl({ h: 34, s: 0.42, l: 0.86 }), // warm plaster; brand colour goes on wainscot/signage
    floor: hsl({ h: 30, s: 0.35, l: 0.58 }),
    wood: hsl({ h: 28, s: 0.42, l: 0.46 }),
    mood,
  };
}
