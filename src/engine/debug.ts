"use client";
// Test hooks used by Playwright (tests/e2e.mjs). Harmless in production.
export const debug: {
  player?: () => { x: number; y: number; z: number; yaw: number; pitch: number; speed: number; grounded: boolean };
  teleport?: (x: number, z: number, yaw?: number, pitch?: number) => void;
  renderInfo?: () => { calls: number; triangles: number; dpr: number };
  fps: number;
  doorOpen: number;
} = { fps: 0, doorOpen: 0 };
