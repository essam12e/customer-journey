"use client";
// Picks a render tier and detects crash/reload loops (mobile browsers kill pages that use too much
// GPU memory and reload them). After repeated boots in a short window we start in "safe" mode.
export type Tier = "high" | "low" | "safe";

const KEY = "cj-boots";
const read = (): number[] => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const write = (v: number[]) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };

let decided: { tier: Tier; reason: string } | null = null;

export function decideTier(): { tier: Tier; reason: string } {
  if (decided) return decided;
  const now = Date.now();
  const boots = read().filter((t) => now - t < 60_000);
  boots.push(now);
  write(boots);
  // a clean 15 s run clears the history
  setTimeout(() => write([]), 15_000);
  const coarse = matchMedia("(pointer: coarse)").matches;
  const forced = /[?#&]safe\b/.test(location.href);
  if (forced || boots.length >= 3) decided = { tier: "safe", reason: forced ? "forced" : "reload-loop" };
  else if (coarse || (navigator.hardwareConcurrency ?? 8) <= 4) decided = { tier: "low", reason: coarse ? "touch" : "cpu" };
  else decided = { tier: "high", reason: "default" };
  return decided;
}

export function forceSafe() {
  decided = { tier: "safe", reason: "error" };
}

export const TIER = {
  high: { dprMax: 1.5, shadows: true, shadowMap: 2048, lamps: 4, antialias: true },
  low: { dprMax: 1, shadows: true, shadowMap: 512, lamps: 2, antialias: false },
  safe: { dprMax: 0.75, shadows: false, shadowMap: 256, lamps: 0, antialias: false },
} as const;
