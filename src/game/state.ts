"use client";
import { create } from "zustand";
import type { StoreLayout } from "@/pipeline/types";

export type Screen = "start" | "play";

interface GameState {
  screen: Screen;
  layout: StoreLayout | null;
  /** product currently in the interaction cone (event-driven HUD reads this) */
  focusedId: string | null;
  /** overlay stack: top-most open panel */
  overlay: "none" | "card" | "cart" | "checkout";
  cardId: string | null;
  pointerLocked: boolean;
  isTouch: boolean;
  toast: { id: number; text: string } | null;
  muted: boolean;
  enter: (layout: StoreLayout) => void;
  exitToStart: () => void;
  setFocused: (id: string | null) => void;
  openCard: (id: string) => void;
  openCart: () => void;
  openCheckout: () => void;
  closeOverlay: () => void;
  setPointerLocked: (v: boolean) => void;
  setTouch: (v: boolean) => void;
  showToast: (text: string) => void;
  toggleMute: () => void;
}

export const useGame = create<GameState>((set, get) => ({
  screen: "start",
  layout: null,
  focusedId: null,
  overlay: "none",
  cardId: null,
  pointerLocked: false,
  isTouch: false,
  toast: null,
  muted: false,
  enter: (layout) => set({ screen: "play", layout, overlay: "none", cardId: null, focusedId: null }),
  exitToStart: () => set({ screen: "start", overlay: "none", cardId: null, focusedId: null }),
  setFocused: (id) => get().focusedId !== id && set({ focusedId: id }),
  openCard: (id) => set({ overlay: "card", cardId: id }),
  openCart: () => set({ overlay: "cart" }),
  openCheckout: () => set({ overlay: "checkout" }),
  closeOverlay: () => set({ overlay: "none", cardId: null }),
  setPointerLocked: (v) => set({ pointerLocked: v }),
  setTouch: (v) => set({ isTouch: v }),
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
  toggleMute: () => set({ muted: !get().muted }),
}));

export const findProduct = (id: string | null) =>
  id ? useGame.getState().layout?.products.find((p) => p.product.id === id) ?? null : null;
