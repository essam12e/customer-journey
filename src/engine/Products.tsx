"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { PlacedProduct, StoreLayout } from "@/pipeline/types";
import { useGame } from "@/game/state";
import { input } from "@/input/input";
import { loadSafeTexture } from "./textures";
import { sfx } from "@/audio/audio";

const SIZE: Record<PlacedProduct["shape"], { w: number; h: number; d: number }> = {
  bag: { w: 0.24, h: 0.32, d: 0.12 },
  box: { w: 0.22, h: 0.28, d: 0.14 },
  jar: { w: 0.17, h: 0.2, d: 0.17 },
  bottle: { w: 0.13, h: 0.3, d: 0.13 },
};

function ProductModel({ pp }: { pp: PlacedProduct }) {
  const { w, h, d } = SIZE[pp.shape];
  const tex = useMemo(() => loadSafeTexture(pp.product.image, pp.color), [pp.product.image, pp.color]);
  const body = new THREE.Color(pp.color).offsetHSL(0, -0.05, -0.12).getStyle();
  return (
    <group>
      {pp.shape === "bag" || pp.shape === "box" ? (
        <RoundedBox args={[w, h, d]} radius={pp.shape === "bag" ? 0.04 : 0.015} smoothness={3} position={[0, h / 2, 0]} castShadow>
          <meshStandardMaterial color={body} roughness={0.75} />
        </RoundedBox>
      ) : (
        <>
          <mesh position={[0, h / 2, 0]} castShadow>
            <cylinderGeometry args={[w / 2, w / 2, h, 20]} />
            <meshStandardMaterial color={pp.shape === "jar" ? "#F3E2C4" : body} roughness={0.35} />
          </mesh>
          <mesh position={[0, h + (pp.shape === "jar" ? 0.02 : 0.05), 0]} castShadow>
            <cylinderGeometry args={pp.shape === "jar" ? [w / 2 + 0.008, w / 2 + 0.008, 0.04, 20] : [0.025, 0.035, 0.1, 12]} />
            <meshStandardMaterial color={pp.color} roughness={0.6} />
          </mesh>
        </>
      )}
      {pp.shape === "bag" && (
        <RoundedBox args={[w * 0.9, 0.05, d * 0.7]} radius={0.015} position={[0, h + 0.01, 0]}>
          <meshStandardMaterial color={pp.color} roughness={0.8} />
        </RoundedBox>
      )}
      {/* front label shows the product art (same image as the details card) */}
      <mesh position={[0, h * 0.5, (pp.shape === "jar" || pp.shape === "bottle" ? w / 2 : d / 2) + 0.004]}>
        <planeGeometry args={[w * 0.8, Math.min(h * 0.62, w * 0.8)]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
    </group>
  );
}

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _n = new THREE.Vector3();

/** One product on a shelf + its focus/hover animation. */
function ShelfProduct({ pp, index }: { pp: PlacedProduct; index: number }) {
  const g = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);
  const k = useRef(0);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const focused = useGame.getState().focusedId === pp.product.id;
    k.current += ((focused ? 1 : 0) - k.current) * (1 - Math.exp(-10 * dt)); // eased, frame-rate independent
    const t = state.clock.elapsedTime;
    if (g.current) {
      const s = 1.35 * (1 + k.current * 0.12); // products read larger than filler stock
      g.current.scale.setScalar(s);
      g.current.position.y = pp.position[1] + k.current * (0.04 + Math.sin(t * 3) * 0.01);
      g.current.rotation.y = pp.rotationY + Math.sin(t * 1.6 + index) * 0.05 * k.current;
    }
    if (marker.current) {
      marker.current.visible = k.current > 0.02;
      marker.current.position.y = pp.position[1] + 0.5 + Math.sin(t * 4) * 0.03;
      marker.current.scale.setScalar(k.current);
      marker.current.rotation.y = t * 2;
    }
  });
  return (
    <>
      <group
        ref={g}
        position={pp.position}
        rotation={[0, pp.rotationY, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (useGame.getState().pointerLocked) return; // locked: E / click handled by the interaction loop
          if (e.distance < 4) { sfx.open(); useGame.getState().openCard(pp.product.id); }
        }}
      >
        <ProductModel pp={pp} />
      </group>
      <group ref={marker} position={[pp.position[0], pp.position[1] + 0.5, pp.position[2]]} visible={false}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.06, 0.12, 4]} />
          <meshStandardMaterial color="#F2A541" emissive="#F2A541" emissiveIntensity={0.6} />
        </mesh>
      </group>
    </>
  );
}

/** Interaction cone: picks the product the player is looking at (≤ 2.4 m, front-facing). */
function InteractionSystem({ layout }: { layout: StoreLayout }) {
  const camera = useThree((s) => s.camera);
  const frame = useRef(0);
  useFrame(() => {
    const g = useGame.getState();
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
  return null;
}

export function Products({ layout }: { layout: StoreLayout }) {
  return (
    <>
      {layout.products.map((pp, i) => <ShelfProduct key={pp.product.id} pp={pp} index={i} />)}
      <InteractionSystem layout={layout} />
    </>
  );
}
