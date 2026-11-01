// Deterministic asset pipeline: builds the cozy-stylized prop GLBs and product label SVGs.
// Geometry is authored with three.js primitives (rounded, chunky proportions) and written with glTF-Transform.
// Run: npm run assets   → public/models/*.glb, public/products/*.svg, assets/asset-manifest.json
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Document, NodeIO } from "@gltf-transform/core";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "public/models";
mkdirSync(OUT, { recursive: true });
mkdirSync("public/products", { recursive: true });
mkdirSync("assets", { recursive: true });

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b, 1]; }; // Color() → linear, as glTF expects

function makeAsset(name) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);
  const root = doc.createNode(name);
  scene.addChild(root);
  const mats = new Map();
  const mat = (mname, color, rough = 0.8, metal = 0) => {
    if (!mats.has(mname)) mats.set(mname, doc.createMaterial(mname).setBaseColorFactor(hex(color)).setRoughnessFactor(rough).setMetallicFactor(metal));
    return mats.get(mname);
  };
  const add = (partName, geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const g = geo.index ? geo : mergeVertices(geo);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const p = g.getAttribute("position"), n = g.getAttribute("normal");
    for (let i = 0; i < n.count; i++) { // glTF requires unit normals; repair degenerate pole normals
      const v = new THREE.Vector3().fromBufferAttribute(n, i);
      if (v.lengthSq() < 1e-8) v.set(0, 1, 0); else v.normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
    const prim = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(p.array)).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(n.array)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(g.index.array)).setBuffer(buffer))
      .setMaterial(material);
    const mesh = doc.createMesh(partName).addPrimitive(prim);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
    root.addChild(doc.createNode(partName).setMesh(mesh).setTranslation(pos).setRotation([q.x, q.y, q.z, q.w]).setScale(scale));
  };
  const write = async () => {
    const io = new NodeIO();
    await io.write(`${OUT}/${name}.glb`, doc);
  };
  return { mat, add, write };
}

const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
const manifest = [];
const record = (id, role, notes) => manifest.push({ id, file: `public/models/${id}.glb`, role, source: "scripts/build-assets.mjs (procedural, original)", license: "project-owned", collision: "proxy cuboid in engine (not mesh)", notes, status: "approved-prototype" });

// ---- Shelf: 3.6 m long, 0.55 m deep, 2.05 m tall. Origin: floor, centre. Front faces +Z.
{
  const a = makeAsset("shelf");
  const wood = a.mat("Wood", "#B9784A"), woodDark = a.mat("WoodDark", "#8C5634"), back = a.mat("Back", "#E8D9C4", 0.95);
  const L = 3.6, D = 0.55, H = 2.05, boards = [0.42, 0.98, 1.54];
  for (const sx of [-1, 1]) a.add(`Side${sx}`, rbox(0.07, H, D, 0.03), woodDark, [sx * (L / 2 - 0.035), H / 2, 0]);
  a.add("Back", rbox(L - 0.08, H - 0.12, 0.03, 0.01), back, [0, H / 2 + 0.03, -D / 2 + 0.03]);
  a.add("Plinth", rbox(L - 0.06, 0.12, D - 0.04, 0.02), woodDark, [0, 0.06, 0]);
  boards.forEach((y, i) => a.add(`Board${i}`, rbox(L - 0.12, 0.05, D - 0.02, 0.015), wood, [0, y, 0]));
  a.add("Crown", rbox(L + 0.06, 0.08, D + 0.04, 0.03), woodDark, [0, H, 0]);
  await a.write(); record("shelf", "section shelf (3 boards)", "back panel material 'Back' is tinted per category at runtime");
}

// ---- Counter / cashier: 2.4 x 1.0 x 0.7
{
  const a = makeAsset("counter");
  const wood = a.mat("Wood", "#B9784A"), top = a.mat("Top", "#F3EDE3", 0.5), tile = a.mat("Front", "#2E6E6A", 0.7);
  a.add("Body", rbox(2.4, 0.95, 0.7, 0.05), wood, [0, 0.475, 0]);
  a.add("FrontPanel", rbox(2.2, 0.7, 0.04, 0.02), tile, [0, 0.47, 0.36]);
  a.add("Top", rbox(2.5, 0.06, 0.8, 0.03), top, [0, 0.98, 0]);
  a.add("Register", rbox(0.4, 0.25, 0.32, 0.04), a.mat("Register", "#3B3A44", 0.6), [0.6, 1.13, -0.05]);
  a.add("Bell", new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), a.mat("Brass", "#D4A64A", 0.35, 0.8), [-0.6, 1.01, 0.1]);
  await a.write(); record("counter", "cashier counter", "");
}

// ---- Potted plant: chunky low-poly foliage
{
  const a = makeAsset("plant");
  const pot = a.mat("Pot", "#C96F4A", 0.85), soil = a.mat("Soil", "#4A3426"), leaf = a.mat("Leaf", "#5E9A5A", 0.9), leaf2 = a.mat("Leaf2", "#7DB86C", 0.9);
  a.add("Pot", new THREE.CylinderGeometry(0.28, 0.21, 0.48, 18), pot, [0, 0.24, 0]);
  a.add("Rim", new THREE.TorusGeometry(0.275, 0.035, 8, 20), pot, [0, 0.48, 0], [Math.PI / 2, 0, 0]);
  a.add("Soil", new THREE.CylinderGeometry(0.25, 0.25, 0.02, 18), soil, [0, 0.47, 0]);
  const blobs = [[0, 0.95, 0, 0.34, leaf], [0.18, 0.78, 0.1, 0.24, leaf2], [-0.17, 0.82, -0.06, 0.26, leaf2], [0.05, 1.22, -0.05, 0.22, leaf2], [-0.08, 0.7, 0.16, 0.2, leaf]];
  blobs.forEach(([x, y, z, r, m], i) => a.add(`Leaf${i}`, new THREE.IcosahedronGeometry(r, 1), m, [x, y, z]));
  await a.write(); record("plant", "decor plant", "");
}

// ---- Pendant lamp: cord + shade; bulb is emissive in engine (point lights added separately)
{
  const a = makeAsset("lamp");
  a.add("Cord", new THREE.CylinderGeometry(0.01, 0.01, 1.0, 6), a.mat("Cord", "#2B2A30"), [0, -0.5, 0]);
  a.add("Shade", new THREE.CylinderGeometry(0.1, 0.32, 0.3, 24, 1, true), a.mat("Shade", "#F2A541", 0.6), [0, -1.12, 0]);
  a.add("Cap", new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16), a.mat("Cap", "#2B2A30"), [0, -0.97, 0]);
  a.add("Bulb", new THREE.SphereGeometry(0.08, 16, 10), a.mat("Bulb", "#FFF3D6", 0.3), [0, -1.22, 0]);
  await a.write(); record("lamp", "pendant lamp (origin at ceiling)", "Shade is open-ended; engine sets side=DoubleSide");
}

// ---- Bench (outside)
{
  const a = makeAsset("bench");
  const wood = a.mat("Wood", "#B9784A"), iron = a.mat("Iron", "#3B3A44", 0.5, 0.6);
  for (let i = 0; i < 3; i++) a.add(`Slat${i}`, rbox(1.6, 0.05, 0.12, 0.02), wood, [0, 0.45, -0.16 + i * 0.16]);
  for (let i = 0; i < 2; i++) a.add(`Back${i}`, rbox(1.6, 0.12, 0.04, 0.02), wood, [0, 0.65 + i * 0.18, -0.26], [-0.15, 0, 0]);
  for (const sx of [-1, 1]) a.add(`Leg${sx}`, rbox(0.06, 0.45, 0.5, 0.02), iron, [sx * 0.7, 0.22, -0.02]);
  await a.write(); record("bench", "outdoor bench", "");
}

writeFileSync("assets/asset-manifest.json", JSON.stringify({ artDirection: "assets/art-direction.md", worldScale: "1 unit = 1 m", assets: manifest }, null, 2));

// ---- Product label art (SVG). Text stays code-native in the UI; labels carry a simple motif + name.
const products = [
  ["p01", "#6B4A3A", "#F2C77B", "bean"], ["p02", "#3E5A4C", "#E9B872", "bean"], ["p03", "#A0522D", "#F6D6A8", "dallah"],
  ["p04", "#E8E1F2", "#7A5C9E", "cup"], ["p05", "#7A4B2A", "#E8B87D", "date"], ["p06", "#DCE8C8", "#5E8C4A", "cookie"],
  ["p07", "#8E2F2F", "#F4C26B", "leaf"], ["p08", "#F3E7A6", "#6E8F3A", "flower"], ["p09", "#4A3A5E", "#F0B3C0", "flame"],
  ["p10", "#E3A13A", "#5A3A1A", "drop"],
];
const motif = {
  bean: (c) => `<ellipse cx="128" cy="120" rx="46" ry="62" fill="${c}"/><path d="M128 62 C108 100 148 140 128 182" stroke="rgba(0,0,0,.35)" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  dallah: (c) => `<path d="M92 176 L164 176 L156 112 Q128 70 100 112 Z" fill="${c}"/><path d="M156 120 Q196 108 204 78" stroke="${c}" stroke-width="12" fill="none" stroke-linecap="round"/><circle cx="128" cy="72" r="12" fill="${c}"/>`,
  cup: (c) => `<path d="M80 100 h96 l-10 70 q-38 18 -76 0 z" fill="${c}"/><path d="M96 80 q8 -14 0 -28 M128 80 q8 -14 0 -28 M160 80 q8 -14 0 -28" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  date: (c) => [[100, 110], [150, 104], [124, 150]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="26" ry="38" fill="${c}" transform="rotate(-20 ${x} ${y})"/>`).join(""),
  cookie: (c) => `<circle cx="128" cy="124" r="62" fill="${c}"/><circle cx="128" cy="124" r="40" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="6" stroke-dasharray="10 9"/>`,
  leaf: (c) => `<path d="M70 170 Q70 70 186 64 Q186 170 70 170 Z" fill="${c}"/><path d="M76 164 L170 78" stroke="rgba(0,0,0,.3)" stroke-width="6"/>`,
  flower: (c) => [0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="128" cy="86" rx="20" ry="36" fill="${c}" transform="rotate(${a} 128 124)"/>`).join("") + `<circle cx="128" cy="124" r="20" fill="#F4C26B"/>`,
  flame: (c) => `<rect x="94" y="120" width="68" height="64" rx="10" fill="${c}"/><path d="M128 58 Q150 88 128 112 Q106 88 128 58 Z" fill="#F4C26B"/>`,
  drop: (c) => `<path d="M128 56 Q176 118 176 140 A48 48 0 0 1 80 140 Q80 118 128 56 Z" fill="${c}"/>`,
};
for (const [id, bg, fg, m] of products) {
  writeFileSync(`public/products/${id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<rect width="256" height="256" rx="28" fill="${bg}"/><circle cx="128" cy="124" r="92" fill="rgba(255,255,255,.12)"/>${motif[m](fg)}
<rect x="40" y="206" width="176" height="14" rx="7" fill="${fg}" opacity=".7"/></svg>`);
}
writeFileSync("public/products/placeholder.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="28" fill="#D9D2E6"/><rect x="78" y="78" width="100" height="100" rx="18" fill="#9C8FB8"/></svg>`);
console.log("assets built:", manifest.map((m) => m.id).join(", "));
