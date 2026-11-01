"use client";
import * as THREE from "three";

const fontsReady = () => (typeof document !== "undefined" && document.fonts ? document.fonts.ready : Promise.resolve());

/** Arabic-safe text label: drawn with the browser's 2D canvas (full RTL shaping), uploaded as a texture. */
export function makeLabelTexture(opts: {
  text: string; sub?: string; bg: string; fg: string; width?: number; height?: number; font?: string; radius?: number;
}) {
  const { text, sub, bg, fg, width = 512, height = 160, font = "Lalezar", radius = 36 } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    const g = canvas.getContext("2d")!;
    g.clearRect(0, 0, width, height);
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(4, 4, width - 8, height - 8, radius); g.fill();
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 4;
    g.beginPath(); g.roundRect(14, 14, width - 28, height - 28, radius - 10); g.stroke();
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; g.direction = "rtl";
    let size = Math.round(height * (sub ? 0.42 : 0.52));
    g.font = `${size}px ${font}, "IBM Plex Sans Arabic", system-ui, sans-serif`;
    while (g.measureText(text).width > width - 60 && size > 18) { size -= 2; g.font = `${size}px ${font}, system-ui, sans-serif`; }
    g.fillText(text, width / 2, sub ? height * 0.42 : height * 0.54);
    if (sub) { g.globalAlpha = 0.8; g.font = `${Math.round(height * 0.17)}px "IBM Plex Sans Arabic", system-ui, sans-serif`; g.fillText(sub, width / 2, height * 0.76); g.globalAlpha = 1; }
    tex.needsUpdate = true;
  };
  draw();
  void fontsReady().then(draw); // redraw once web fonts are in
  return tex;
}

/** Warm wooden plank floor, generated once (no download). */
export function makePlankTexture(base = "#C08A5B") {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const g = c.getContext("2d")!;
  const col = new THREE.Color(base);
  const rows = 8, h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = -((r * 137) % 200);
    while (x < 512) {
      const w = 160 + ((r * 31 + x) % 7) * 22;
      const v = 0.9 + (((r * 17 + Math.floor(x)) % 11) / 11) * 0.18;
      g.fillStyle = `#${col.clone().multiplyScalar(v).getHexString()}`;
      g.fillRect(x, r * h, w - 3, h - 3);
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Image texture that fails soft (CORS / 404 → coloured placeholder) instead of breaking the scene. */
const cache = new Map<string, THREE.Texture<HTMLCanvasElement | HTMLImageElement>>();
export function loadSafeTexture(url: string, fallback: string): THREE.Texture {
  const key = url + fallback;
  if (cache.has(key)) return cache.get(key)!;
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const g = c.getContext("2d")!; g.fillStyle = fallback; g.fillRect(0, 0, 8, 8);
  const tex = new THREE.Texture<HTMLCanvasElement | HTMLImageElement>(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.onload = () => { tex.image = img; tex.needsUpdate = true; };
  img.src = url;
  cache.set(key, tex);
  return tex;
}
