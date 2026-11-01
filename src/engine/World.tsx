"use client";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import type { StoreLayout, SectionSlot } from "@/pipeline/types";
import { SHELF } from "@/pipeline/placement";
import { makeLabelTexture, makePlankTexture } from "./textures";
import { MODEL, useMergedGLB } from "./useMergedGLB";
import { sfx } from "@/audio/audio";
import { debug } from "./debug";
import { playerPos } from "./playerPos";

const WALL_T = 0.3;
const DOOR_H = 2.7;

type Xf = { p: [number, number, number]; r?: number; s?: [number, number, number]; color?: string };

/** N copies of a GLB prop → one InstancedMesh per material (few draw calls). */
function InstancedGLB({ url, items, tintMaterial, cast = true }: { url: string; items: Xf[]; tintMaterial?: string; cast?: boolean }) {
  const parts = useMergedGLB(url);
  return (
    <>
      {parts.map((part) => (
        <InstancedPart key={part.name} part={part} items={items} tinted={part.name === tintMaterial} cast={cast} />
      ))}
    </>
  );
}

function InstancedPart({ part, items, tinted, cast }: { part: ReturnType<typeof useMergedGLB>[number]; items: Xf[]; tinted: boolean; cast: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => {
    const m = part.material.clone();
    if (tinted) m.color.set("#ffffff");
    if (part.name === "Shade") m.side = THREE.DoubleSide;
    if (part.name === "Bulb") { m.emissive.set("#FFE2A8"); m.emissiveIntensity = 2.2; }
    return m;
  }, [part, tinted]);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.rotation.set(0, it.r ?? 0, 0);
      o.scale.set(...(it.s ?? [1, 1, 1]));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (tinted) mesh.setColorAt(i, c.set(it.color ?? "#ffffff"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, tinted]);
  return <instancedMesh ref={ref} args={[part.geometry, material, items.length]} castShadow={cast} receiveShadow />;
}

/** Shown until the GLB streams in (progressive loading): same footprint, flat colour. */
function ShelfPlaceholder({ sections }: { sections: SectionSlot[] }) {
  return (
    <>
      {sections.map((s) => (
        <mesh key={s.id} position={[s.x, 1.02, s.z]} rotation={[0, s.rotationY, 0]}>
          <boxGeometry args={[s.shelfLength, 2.05, SHELF.depth]} />
          <meshStandardMaterial color="#C9A27E" roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

function Box({ p, s, color, cast = false, rough = 0.9, ...rest }: { p: [number, number, number]; s: [number, number, number]; color: string; cast?: boolean; rough?: number; transparent?: boolean; opacity?: number; glow?: string }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} roughness={rough} transparent={rest.transparent} opacity={rest.opacity ?? 1} depthWrite={!rest.transparent} emissive={rest.glow ?? "#000000"} emissiveIntensity={rest.glow ? 0.35 : 0} />
    </mesh>
  );
}

/** Builds wall boxes (visual + matching collider) for the room shell, with door + windows on the front. */
function useShell(layout: StoreLayout) {
  return useMemo(() => {
    const { width: W, depth: D, height: H } = layout.template;
    const hw = W / 2, hd = D / 2, dw = layout.template.entrance.doorWidth / 2;
    const walls: { p: [number, number, number]; s: [number, number, number] }[] = [
      { p: [0, H / 2, -hd - WALL_T / 2], s: [W + WALL_T * 2, H, WALL_T] }, // back
      { p: [-hw - WALL_T / 2, H / 2, 0], s: [WALL_T, H, D] }, // left
      { p: [hw + WALL_T / 2, H / 2, 0], s: [WALL_T, H, D] }, // right
    ];
    const fz = hd + WALL_T / 2;
    const win = { x0: 2.3, x1: 6.5, y0: 0.9, y1: 2.6 };
    for (const sgn of [-1, 1]) {
      const c = (a: number, b: number) => (sgn * (a + b)) / 2;
      walls.push({ p: [c(hw, win.x1), H / 2, fz], s: [hw - win.x1, H, WALL_T] }); // outer pillar
      walls.push({ p: [c(win.x0, dw), H / 2, fz], s: [win.x0 - dw, H, WALL_T] }); // pillar by door
      walls.push({ p: [c(win.x0, win.x1), win.y0 / 2, fz], s: [win.x1 - win.x0, win.y0, WALL_T] }); // below window
      walls.push({ p: [c(win.x0, win.x1), (win.y1 + H) / 2, fz], s: [win.x1 - win.x0, H - win.y1, WALL_T] }); // above window
    }
    walls.push({ p: [0, (DOOR_H + H) / 2, fz], s: [dw * 2, H - DOOR_H, WALL_T] }); // lintel
    const glass = [-1, 1].map((sgn) => ({ p: [(sgn * (win.x0 + win.x1)) / 2, (win.y0 + win.y1) / 2, fz] as [number, number, number], s: [win.x1 - win.x0, win.y1 - win.y0, 0.04] as [number, number, number] }));
    return { walls, glass, hw, hd, H, dw, fz };
  }, [layout]);
}

function SlidingDoor({ x0, z, width, color }: { x0: number; z: number; width: number; color: string }) {
  const left = useRef<RapierRigidBody>(null);
  const right = useRef<RapierRigidBody>(null);
  const open = useRef(0);
  const wasOpen = useRef(false);
  const panelW = width / 2;
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const p = playerPos.current;
    const near = p ? Math.hypot(p.x - x0, p.z - z) < 3.4 : false;
    if (near && !wasOpen.current) sfx.door();
    wasOpen.current = near;
    open.current += ((near ? 1 : 0) - open.current) * (1 - Math.exp(-6 * dt));
    debug.doorOpen = open.current;
    const off = open.current * (panelW - 0.08);
    left.current?.setNextKinematicTranslation({ x: x0 - panelW / 2 - off, y: DOOR_H / 2, z });
    right.current?.setNextKinematicTranslation({ x: x0 + panelW / 2 + off, y: DOOR_H / 2, z });
  });
  const panel = (
    <>
      <mesh castShadow>
        <boxGeometry args={[panelW, DOOR_H - 0.05, 0.06]} />
        <meshStandardMaterial color="#CFE6EE" transparent opacity={0.35} roughness={0.08} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[panelW, 0.08, 0.08]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -DOOR_H / 2 + 0.06, 0]}>
        <boxGeometry args={[panelW, 0.1, 0.08]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </>
  );
  return (
    <>
      <RigidBody ref={left} type="kinematicPosition" colliders={false} position={[x0 - panelW / 2, DOOR_H / 2, z]}>
        <CuboidCollider args={[panelW / 2, DOOR_H / 2, 0.05]} />
        {panel}
      </RigidBody>
      <RigidBody ref={right} type="kinematicPosition" colliders={false} position={[x0 + panelW / 2, DOOR_H / 2, z]}>
        <CuboidCollider args={[panelW / 2, DOOR_H / 2, 0.05]} />
        {panel}
      </RigidBody>
    </>
  );
}

function Sky() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(80, 24, 12);
    const top = new THREE.Color("#8FB0DC"), mid = new THREE.Color("#F6C6A6"), low = new THREE.Color("#F3DCC8");
    const cols: number[] = [];
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 80;
      const c = y > 0.05 ? mid.clone().lerp(top, Math.min(1, (y - 0.05) / 0.6)) : low.clone().lerp(mid, Math.max(0, (y + 0.2) / 0.25));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }, []);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

function Sign({ text, sub, p, r = 0, w = 1.6, h = 0.5, bg, fg = "#FFFFFF" }: { text: string; sub?: string; p: [number, number, number]; r?: number; w?: number; h?: number; bg: string; fg?: string }) {
  const tex = useMemo(() => makeLabelTexture({ text, sub, bg, fg, width: 512, height: Math.round((512 * h) / w) }), [text, sub, bg, fg, w, h]);
  return (
    <mesh position={p} rotation={[0, r, 0]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} transparent roughness={0.7} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.25} />
    </mesh>
  );
}

/** Decorative stock filling the free shelf slots so shelves look stocked (one instanced draw call). */
function ShelfStock({ layout }: { layout: StoreLayout }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const out: { p: THREE.Vector3; r: number; s: number; c: string }[] = [];
    const used = layout.products.map((p) => new THREE.Vector3(...p.position));
    const colorFor = new Map(layout.sections.map((s) => [s.slotId, s.color]));
    for (const sec of layout.template.sections) {
      const base = new THREE.Color(colorFor.get(sec.id) ?? "#D8C7B0");
      for (let lv = 0; lv < sec.levels; lv++) {
        const n = 9;
        for (let i = 0; i < n; i++) {
          const lx = -sec.shelfLength / 2 + 0.2 + (i * (sec.shelfLength - 0.4)) / (n - 1);
          const c = Math.cos(sec.rotationY), s = Math.sin(sec.rotationY);
          const lz = -0.12;
          const p = new THREE.Vector3(sec.x + lx * c + lz * s, SHELF.boardHeights[lv] + 0.025, sec.z - lx * s + lz * c);
          if (used.some((u) => Math.hypot(u.x - p.x, u.z - p.z) < 0.32 && Math.abs(u.y - p.y) < 0.2)) continue;
          const hsh = Math.abs(Math.sin((i + 1) * 12.9898 + lv * 78.233 + sec.x * 3.1) * 43758.5);
          if (hsh % 1 < 0.25) continue;
          const tone = base.clone().lerp(new THREE.Color("#EAD3B5"), 0.35).offsetHSL(((hsh * 7) % 1 - 0.5) * 0.06, -0.1, ((hsh * 3) % 1 - 0.5) * 0.12);
          out.push({ p, r: sec.rotationY, s: 0.75 + ((hsh * 5) % 1) * 0.5, c: `#${tone.getHexString()}` });
        }
      }
    }
    return out;
  }, [layout]);
  const geo = useMemo(() => new THREE.BoxGeometry(0.13, 0.18, 0.12).translate(0, 0.09, 0), []);
  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new THREE.Object3D(), c = new THREE.Color();
    items.forEach((it, i) => {
      o.position.copy(it.p); o.rotation.set(0, it.r, 0); o.scale.set(1, it.s, 1); o.updateMatrix();
      m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, items.length]} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  );
}

export function World({ layout, lowTier, shadowMap = 2048, lamps: lampCount = 4 }: { layout: StoreLayout; lowTier: boolean; shadowMap?: number; lamps?: number }) {
  const { theme, template } = layout;
  const shell = useShell(layout);
  const plank = useMemo(() => {
    const t = makePlankTexture(theme.floor);
    t.repeat.set(template.width / 3, template.depth / 3);
    return t;
  }, [theme.floor, template.width, template.depth]);

  const shelfItems: Xf[] = template.sections.map((s) => {
    const sec = layout.sections.find((x) => x.slotId === s.id);
    return { p: [s.x, 0, s.z], r: s.rotationY, s: [s.shelfLength / 3.6, 1, 1], color: sec?.color ?? "#E8D9C4" };
  });
  const counter = { x: 5.2, z: 5.6, r: -Math.PI / 2 };
  const plants: Xf[] = [
    { p: [-7.2, 0, 9.2] }, { p: [7.2, 0, -9.2] }, { p: [-7.2, 0, -9.2] },
    { p: [-2.1, 0, shell.hd + 0.9] }, { p: [2.1, 0, shell.hd + 0.9] }, { p: [5.2, 0, 8.6], s: [0.8, 0.8, 0.8] },
  ];
  const lamps: Xf[] = [[-3.6, -7], [3.6, -7], [-3.2, -1], [3.2, -1], [0, 4.5], [-4.5, 6]].map(([x, z]) => ({ p: [x, template.height, z] }));
  const benches: Xf[] = [{ p: [-5.5, 0, 14.2], r: Math.PI }, { p: [5.5, 0, 14.2], r: Math.PI }];
  const hedge = useMemo(() => {
    const out: [number, number, number, number, number][] = []; // x z w d
    out.push([-11, 14.3, 0.6, 8.2, 0], [11, 14.3, 0.6, 8.2, 0], [-6.3, 18.4, 9.4, 0.6, 0], [6.3, 18.4, 9.4, 0.6, 0]);
    return out;
  }, []);

  return (
    <group>
      <Sky />
      {/* Lights (threejs-materials-lighting): soft fill + one shadow-casting late sun + warm practicals */}
      <hemisphereLight args={["#FFF1DE", "#D8B596", 1.7]} />
      <directionalLight
        position={[7, 11, 20]}
        intensity={2.6}
        color="#FFD4A3"
        castShadow
        shadow-mapSize={[shadowMap, shadowMap]}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {lamps.slice(0, lampCount).map((l, i) => (
        <pointLight key={i} position={[l.p[0], template.height - 1.4, l.p[2]]} intensity={16} distance={9} decay={2} color="#FFC98A" />
      ))}

      {/* Ground: plaza + interior planks */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 6]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#D9C6B0" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[template.width, template.depth]} />
        <meshStandardMaterial map={plank} roughness={0.8} />
      </mesh>
      {/* path to the door */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, shell.hd + 4]} receiveShadow>
        <planeGeometry args={[3.2, 8]} />
        <meshStandardMaterial color="#C7AE93" roughness={1} />
      </mesh>
      {/* rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 3.4]} receiveShadow>
        <circleGeometry args={[2.2, 40]} />
        <meshStandardMaterial color={theme.primary} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 3.4]}>
        <ringGeometry args={[1.75, 1.9, 40]} />
        <meshStandardMaterial color={theme.accent} roughness={1} />
      </mesh>

      {/* Shell */}
      {shell.walls.map((w, i) => <Box key={i} p={w.p} s={w.s} color={theme.wall} cast />)}
      {shell.glass.map((g, i) => <Box key={`g${i}`} p={g.p} s={g.s} color="#CFE6EE" transparent opacity={0.3} rough={0.05} />)}
      <Box p={[0, template.height + 0.15, 0]} s={[template.width + 0.9, 0.3, template.depth + 0.9]} color="#FBF4EA" glow="#B89270" cast />
      {/* wainscot band inside */}
      <Box p={[0, 0.5, -shell.hd + 0.02]} s={[template.width, 1, 0.04]} color={theme.primary} />
      <Box p={[-shell.hw + 0.02, 0.5, 0]} s={[0.04, 1, template.depth]} color={theme.primary} />
      <Box p={[shell.hw - 0.02, 0.5, 0]} s={[0.04, 1, template.depth]} color={theme.primary} />
      {/* facade: awning + store sign */}
      <mesh position={[0, DOOR_H + 0.35, shell.fz + 0.55]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[3.6, 0.08, 1.2]} />
        <meshStandardMaterial color={theme.primary} roughness={0.8} />
      </mesh>
      <Sign text={layout.store.name} sub="رحلة العميل" p={[0, 3.55, shell.fz + WALL_T / 2 + 0.02]} w={3.4} h={0.95} bg={theme.primary} fg="#FFF6E6" />
      <SlidingDoor x0={0} z={shell.fz} width={shell.dw * 2} color={theme.wood} />

      {/* Section signs hang above each shelf */}
      {layout.sections.map((s) => {
        const slot = template.sections.find((t) => t.id === s.slotId)!;
        const c = Math.cos(slot.rotationY), sn = Math.sin(slot.rotationY);
        const lz = 0.2;
        return <Sign key={s.slotId} text={s.title} p={[slot.x + lz * sn, 2.55, slot.z + lz * c]} r={slot.rotationY} w={1.8} h={0.5} bg={s.color} fg="#2A2335" />;
      })}
      {template.sections.filter((t) => !layout.sections.some((s) => s.slotId === t.id)).map((slot) => {
        const c = Math.cos(slot.rotationY), sn = Math.sin(slot.rotationY);
        return <Sign key={slot.id} text="قريبًا" p={[slot.x + 0.2 * sn, 2.55, slot.z + 0.2 * c]} r={slot.rotationY} w={1.2} h={0.4} bg="#E9E1D6" fg="#7B6E62" />;
      })}

      {/* GLB props stream in progressively; placeholders keep the layout readable meanwhile */}
      <Suspense fallback={<ShelfPlaceholder sections={template.sections} />}>
        <InstancedGLB url={MODEL.shelf} items={shelfItems} tintMaterial="Back" />
      </Suspense>
      <Suspense fallback={null}>
        <InstancedGLB url={MODEL.counter} items={[{ p: [counter.x, 0, counter.z], r: counter.r }]} />
        <InstancedGLB url={MODEL.plant} items={plants} />
        <InstancedGLB url={MODEL.lamp} items={lamps} cast={false} />
        <InstancedGLB url={MODEL.bench} items={benches} />
      </Suspense>
      <ShelfStock layout={layout} />
      {hedge.map(([x, z, w, d], i) => (
        <mesh key={`h${i}`} position={[x, 0.45, z]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.9, d]} />
          <meshStandardMaterial color="#6FA06A" roughness={1} />
        </mesh>
      ))}

      {/* Collision proxies (physics-tuning: simple boxes, never render meshes) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[40, 0.1, 40]} position={[0, -0.1, 0]} />
        {shell.walls.filter((w) => w.p[1] - w.s[1] / 2 < 2).map((w, i) => (
          <CuboidCollider key={i} args={[w.s[0] / 2, w.s[1] / 2, w.s[2] / 2]} position={w.p} />
        ))}
        {shell.glass.map((g, i) => <CuboidCollider key={`gc${i}`} args={[g.s[0] / 2, 1.3, 0.15]} position={[g.p[0], 1.3, g.p[2]]} />)}
        {template.sections.map((s) => (
          <CuboidCollider key={s.id} args={[s.shelfLength / 2 + 0.03, 1.05, SHELF.depth / 2 + 0.02]} position={[s.x, 1.05, s.z]} rotation={[0, s.rotationY, 0]} />
        ))}
        <CuboidCollider args={[1.27, 0.55, 0.42]} position={[counter.x, 0.55, counter.z]} rotation={[0, counter.r, 0]} />
        {plants.map((pl, i) => <CuboidCollider key={`p${i}`} args={[0.3, 0.6, 0.3]} position={[pl.p[0], 0.6, pl.p[2]]} />)}
        {benches.map((b, i) => <CuboidCollider key={`b${i}`} args={[0.82, 0.45, 0.32]} position={[b.p[0], 0.45, b.p[2]]} />)}
        {hedge.map(([x, z, w, d], i) => <CuboidCollider key={`hc${i}`} args={[w / 2, 1, d / 2]} position={[x, 1, z]} />)}
        {/* plaza bounds: keep the player near the storefront */}
        <CuboidCollider args={[1.6, 2, 0.3]} position={[0, 2, 18.6]} />
        <CuboidCollider args={[1.5, 2, 0.2]} position={[-9.5, 2, shell.fz]} />
        <CuboidCollider args={[1.5, 2, 0.2]} position={[9.5, 2, shell.fz]} />
      </RigidBody>
    </group>
  );
}
