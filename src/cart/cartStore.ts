"use client";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { NormalizedProduct } from "@/pipeline/types";

export interface CartLine {
  id: string;
  name: string;
  price: number;
  currency: string;
  image: string;
  qty: number;
  variantId?: string;
  url?: string;
}

interface CartState {
  storeKey: string; // cart is scoped to one store
  lines: CartLine[];
  lastAddedAt: number;
  bindStore: (key: string) => void;
  add: (p: NormalizedProduct, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
}

// localStorage can be unavailable (private mode, blocked storage) — never let that break the game.
const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const MAX_QTY = 20;

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      storeKey: "",
      lines: [],
      lastAddedAt: 0,
      bindStore: (key) => { if (get().storeKey !== key) set({ storeKey: key, lines: [] }); },
      add: (p, qty = 1) => {
        const lines = [...get().lines];
        const i = lines.findIndex((l) => l.id === p.id);
        if (i >= 0) lines[i] = { ...lines[i], qty: Math.min(MAX_QTY, lines[i].qty + qty) };
        else lines.push({ id: p.id, name: p.name, price: p.price, currency: p.currency, image: p.image, qty, variantId: p.variantId, url: p.url });
        set({ lines, lastAddedAt: Date.now() });
      },
      setQty: (id, qty) => set({ lines: get().lines.flatMap((l) => (l.id !== id ? [l] : qty <= 0 ? [] : [{ ...l, qty: Math.min(MAX_QTY, qty) }])) }),
      remove: (id) => set({ lines: get().lines.filter((l) => l.id !== id) }),
      clear: () => set({ lines: [] }),
    }),
    { name: "cj-cart-v1", storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ storeKey: s.storeKey, lines: s.lines }) },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);
// integer minor units to avoid float drift (0.1 + 0.2)
export const cartTotal = (lines: CartLine[]) => lines.reduce((n, l) => n + Math.round(l.price * 100) * l.qty, 0) / 100;

export function formatPrice(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("ar-SA", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}
