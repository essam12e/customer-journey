"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { PlacedProduct, StoreLayout } from "@/pipeline/types";
import { useGame } from "@/game/state";
import { input } from "@/input/input";
import { loadSafeTexture } from "./textures";
import { sfx } from "@/audio/audio";

// performance-optimization: products are drawn as ONE InstancedMesh per part (bodies, lids, folds),
// so 10 or 216 products cost the same handful of draw calls. Only the nearest few get a label
// texture (images stream in progressively as the player walks).

const SCALE = 1.35; // products read larger than filler stock
const SIZE: Record<PlacedProduct["shape"], { w: number; h: number; d: number }> = {
  bag: { w: 0.24, h: 0.32, d: 0.12 },
  box: { w: 0.22, h: 0.28, d: 0.14 },
  jar: { w: 0.17, h: 0.2, d: 0.17 },
  bottle: { w: 0.13, h: 0.3, d: 0.13 },
};
const LABEL_COUNT = 16;
const LABEL_RANGE = 6;

type Part = { key: string; geo: THREE.BufferGeometry; rough: number; members: (pp: PlacedProduct) => boolean; color: (pp: PlacedProduct) => string };

function useParts(): Part[] {
  return useMemo(() => {
    const unitRounded = (r: number) => new RoundedBoxGeometry(1, 1, 1, 1, r).translate(0, 0.5, 0);
    const cyl = (seg: number) => new THREE.CylinderGeometry(0.5, 0.5, 1, seg).translate(0, 0.5, 0);
    const darker = (c: string) => `#${new THREE.Color(c).offsetHSL(0, -0.05, -0.12).getHexString()}`;
    return [
      { key: "bag", geo: unitRounded(0.16), rough: 0.75, members: (p) => p.shape === "bag", color: (p) => darker(p.color) },
      { key: "box", geo: unitRounded(0.06), rough: 0.75, members: (p) => p.shape === "box", color: (p) => darker(p.color) },
      { key: "jar", geo: cyl(12), rough: 0.35, members: (p) => p.shape === "jar", color: () => "#F3E2C4" },
      { key: "bottle", geo: cyl(10), rough: 0.35, members: (p) => p.shape === "bottle", color: (p) => darker(p.color) },
      { key: "lid", geo: cyl(12), rough: 0.6, members: (p) => p.shape === "jar" || p.shape === "bottle" || p.shape === "bag", color: (p) => p.color },
    ];
  }, []);
}

/** Local transform of a product's part (in the product's own frame, before the product matrix). */
function partLocal(part: string, pp: PlacedProduct, m: THREE.Matrix4) {
  const { w, h, d } = SIZE[pp.shape];
  if (part === "lid") {
    if (pp.shape === "jar") return m.compose(new THREE.Vector3(0, h, 0), new THREE.Quaternion(), new THREE.Vector3(w + 0.016, 0.04, w + 0.016));
    if (pp.shape === "bottle") return m.compose(new THREE.Vector3(0, h, 0), new THREE.Quaternion(), new THREE.Vector3(0.06, 0.1, 0.06));
    return m.compose(new THREE.Vector3(0, h - 0.015, 0), new THREE.Quaternion(), new THREE.Vector3(w * 0.9, 0.05, d * 0.7)); // bag fold
  }
  return m.compose(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(w, h, pp.shape === "jar" || pp.shape === "bottle" ? w : d));
}

/** World matrix of a product, including its focus animation (k ∈ [0,1]). */
function productMatrix(pp: PlacedProduct, k: number, t: number, i: number, out: THREE.Matrix4) {
  const s = SCALE * (1 + k * 0.12);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pp.rotationY + Math.sin(t * 1.6 + i) * 0.05 * k);
  return out.compose(new THREE.Vector3(pp.position[0], pp.position[1] + k * (0.04 + Math.sin(t * 3) * 0.01), pp.position[2]), q, new THREE.Vector3(s, s, s));
}

const _m = new THREE.Matrix4();
const _l = new THREE.Matrix4();

function InstancedProducts({ layout, anim }: { layout: StoreLayout; anim: React.RefObject<Map<string, number>> }) {
  const parts = useParts();
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const groups = useMemo(() => parts.map((part) => layout.products.map((pp, i) => ({ pp, i })).filter(({ pp }) => part.members(pp))), [parts, layout]);
  const materials = useMemo(() => parts.map((p) => new THREE.MeshStandardMaterial({ roughness: p.rough })), [parts]);

  const write = (pi: number, j: number, k: number, t: number) => {
    const { pp, i } = groups[pi][j];
    productMatrix(pp, k, t, i, _m).multiply(partLocal(parts[pi].key, pp, _l));
    refs.current[pi]!.setMatrixAt(j, _m);
  };

  useLayoutEffect(() => {
    const c = new THREE.Color();
    parts.forEach((part, pi) => {
      const mesh = refs.current[pi];
      if (!mesh) return;
      groups[pi].forEach(({ pp }, j) => { write(pi, j, 0, 0); mesh.setColorAt(j, c.set(part.color(pp))); });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [groups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only animated (focused / easing-out) products are rewritten each frame.
  useFrame((state) => {
    const A = anim.current!;
    if (A.size === 0) return;
    const t = state.clock.elapsedTime;
    parts.forEach((_, pi) => {
      let dirty = false;
      groups[pi].forEach(({ pp }, j) => {
        const k = A.get(pp.product.id);
        if (k === undefined) return;
        write(pi, j, k, t);
        dirty = true;
      });
      if (dirty) refs.current[pi]!.instanceMatrix.needsUpdate = true;
    });
  });

  const onClick = (pi: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (useGame.getState().pointerLocked || e.instanceId === undefined) return;
    const pp = groups[pi][e.instanceId]?.pp;
    if (pp && e.distance < 4) { sfx.open(); useGame.getState().openCard(pp.product.id); }
  };

  return (
    <>
      {parts.map((part, pi) => groups[pi].length > 0 && (
        <instancedMesh key={part.key + layout.store.sourceUrl} ref={(m) => { refs.current[pi] = m; }} args={[part.geo, materials[pi], groups[pi].length]} castShadow onClick={onClick(pi)} />
      ))}
    </>
  );
}

/** Front label (product image) for one product; follows the same animated transform. */
function Label({ pp, index, anim }: { pp: PlacedProduct; index: number; anim: React.RefObject<Map<string, number>> }) {
  const ref = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => loadSafeTexture(pp.product.image, pp.color), [pp.product.image, pp.color]);
  const { w, h, d } = SIZE[pp.shape];
  const front = (pp.shape === "jar" || pp.shape === "bottle" ? w : d) / 2 + 0.004;
  const local = useMemo(() => new THREE.Matrix4().compose(new THREE.Vector3(0, h * 0.5, front), new THREE.Quaternion(), new THREE.Vector3(w * 0.8, Math.min(h * 0.62, w * 0.8), 1)), [w, h, front]);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    productMatrix(pp, anim.current!.get(pp.product.id) ?? 0, state.clock.elapsedTime, index, m.matrix).multiply(local);
    m.matrixWorldNeedsUpdate = true;
  });
  return (
    <mesh ref={ref} matrixAutoUpdate={false}>
      <planeGeometry />
      <meshStandardMaterial map={tex} roughness={0.6} />
    </mesh>
  );
}

const _c = new THREE.Vector3();
/** Picks the nearest products to the camera (throttled) so only those carry a label texture. */
function NearLabels({ layout, anim }: { layout: StoreLayout; anim: React.RefObject<Map<string, number>> }) {
  const camera = useThree((s) => s.camera);
  const [near, setNear] = useState<number[]>([]);
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 12 !== 0) return;
    _c.copy(camera.position);
    const ranked = layout.products
      .map((pp, i) => ({ i, d: Math.hypot(pp.position[0] - _c.x, pp.position[2] - _c.z) }))
      .filter((x) => x.d < LABEL_RANGE)
      .sort((a, b) => a.d - b.d)
      .slice(0, LABEL_COUNT)
      .map((x) => x.i)
      .sort((a, b) => a - b);
    if (ranked.join() !== near.join()) setNear(ranked);
  });
  return <>{near.map((i) => <Label key={layout.products[i].product.id} pp={layout.products[i]} index={i} anim={anim} />)}</>;
}

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Interaction cone: picks the product the player is looking at (≤ 2.4 m, front-facing) and drives focus easing. */
function InteractionSystem({ layout, anim }: { layout: StoreLayout; anim: React.RefObject<Map<string, number>> }) {
  const camera = useThree((s) => s.camera);
  const frame = useRef(0);
  const marker = useRef<THREE.Mesh>(null);
  const byId = useMemo(() => new Map(layout.products.map((p) => [p.product.id, p])), [layout]);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = useGame.getState();
    // focus easing (game-feel): eased, frame-rate independent, returns to rest
    const A = anim.current!;
    if (g.focusedId && !A.has(g.focusedId)) A.set(g.focusedId, 0);
    for (const [id, k] of A) {
      const target = id === g.focusedId ? 1 : 0;
      const nk = k + (target - k) * (1 - Math.exp(-10 * dt));
      if (target === 0 && nk < 0.002) A.delete(id); else A.set(id, nk);
    }
    const fp = g.focusedId ? byId.get(g.focusedId) : null;
    if (marker.current) {
      const k = fp ? A.get(fp.product.id) ?? 0 : 0;
      marker.current.visible = !!fp && k > 0.02;
      if (fp) {
        const t = state.clock.elapsedTime;
        marker.current.position.set(fp.position[0], fp.position[1] + 0.55 + Math.sin(t * 4) * 0.03, fp.position[2]);
        marker.current.rotation.set(Math.PI, t * 2, 0);
        marker.current.scale.setScalar(Math.max(k, 0.001));
      }
    }

    if (g.screen !== "play") return;
    if (g.overlay !== "none") { input.interact = false; return; }
    if (frame.current++ % 3 === 0) {
      camera.getWorldDirection(_f);
      let best: string | null = null, bestScore = -Infinity;
      for (const pp of layout.products) {
        _v.set(pp.position[0], pp.position[1] + 0.15, pp.position[2]).sub(camera.position);
        const dist = _v.length();
        if (dist > 2.4) continue;
        _v.divideScalar(dist);
        const dot = _v.dot(_f);
        if (dot < 0.8) continue;
        _n.set(Math.sin(pp.rotationY), 0, Math.cos(pp.rotationY)); // product front
        if (_n.dot(_v) > 0.1) continue; // looking from behind the shelf
        const score = dot * 2 - dist * 0.25;
        if (score > bestScore) { bestScore = score; best = pp.product.id; }
      }
      if (best !== g.focusedId) { if (best) sfx.focus(); g.setFocused(best); }
    }
    if (input.interact) {
      input.interact = false;
      const id = useGame.getState().focusedId;
      if (id) { sfx.open(); useGame.getState().openCard(id); }
    }
  });
  return (
    <mesh ref={marker} visible={false}>
      <coneGeometry args={[0.06, 0.12, 4]} />
      <meshStandardMaterial color="#F2A541" emissive="#F2A541" emissiveIntensity={0.6} />
    </mesh>
  );
}

export function Products({ layout }: { layout: StoreLayout }) {
  const anim = useRef(new Map<string, number>());
  return (
    <>
      <InstancedProducts layout={layout} anim={anim} />
      <NearLabels layout={layout} anim={anim} />
      <InteractionSystem layout={layout} anim={anim} />
    </>
  );
}
