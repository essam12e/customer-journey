"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor, useGLTF } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import type { StoreLayout } from "@/pipeline/types";
import { useGame } from "@/game/state";
import { input, recomputeMove, isMoveKey, clearInput } from "@/input/input";
import { World } from "./World";
import { Products } from "./Products";
import { AttractCamera, Player } from "./Player";
import { debug } from "./debug";
import { MODEL } from "./useMergedGLB";
import { decideTier, TIER, type Tier } from "./quality";

const MOUSE_SENS = 0.0022;
const TOUCH_SENS = 0.0055;

function Stats() {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ t: 0, n: 0 });
  useEffect(() => {
    debug.renderInfo = () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, dpr: gl.getPixelRatio() });
  }, [gl]);
  useFrame((_, dt) => {
    acc.current.t += dt; acc.current.n++;
    if (acc.current.t >= 1) { debug.fps = Math.round(acc.current.n / acc.current.t); acc.current.t = 0; acc.current.n = 0; }
  });
  return null;
}

/** Desktop: pointer-lock mouse look + WASD.  Touch: drag anywhere outside the joystick to look. */
function useControls(canvas: HTMLCanvasElement | null) {
  useEffect(() => {
    if (!canvas) return;
    const g = useGame.getState;
    const playing = () => g().screen === "play" && g().overlay === "none";

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (isMoveKey(e.code)) {
        down ? input.keys.add(e.code) : input.keys.delete(e.code);
        recomputeMove();
        if (g().screen === "play") e.preventDefault();
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = down;
      if (!down || e.repeat || g().screen !== "play") return;
      if (e.code === "KeyE" || e.code === "Enter" || e.code === "Space") {
        if (g().overlay === "none") input.interact = true;
        e.preventDefault();
      }
      if (e.code === "KeyC" || e.code === "Tab") {
        e.preventDefault();
        g().overlay === "cart" ? g().closeOverlay() : g().openCart();
      }
      if (e.code === "Escape" && g().overlay !== "none") g().closeOverlay();
    };
    const kd = onKey(true), ku = onKey(false);
    const blur = () => clearInput();

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas || !playing()) return;
      // Chrome can deliver one huge movement right after locking → visible camera snap. Drop spikes.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      input.look.dx += e.movementX * MOUSE_SENS;
      input.look.dy += e.movementY * MOUSE_SENS;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (g().screen !== "play" || g().isTouch || e.button !== 0) return;
      if (document.pointerLockElement === canvas) { input.interact = true; return; }
      if (g().overlay === "none") canvas.requestPointerLock?.()?.catch?.(() => {});
    };
    const onLockChange = () => g().setPointerLocked(document.pointerLockElement === canvas);

    // touch look: one finger dragging on the canvas
    let lookId: number | null = null, lx = 0, ly = 0;
    const ts = (e: TouchEvent) => {
      g().isTouch || g().setTouch(true);
      for (const t of Array.from(e.changedTouches)) if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    };
    const tm = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === lookId && playing()) {
        input.look.dx += (t.clientX - lx) * TOUCH_SENS;
        input.look.dy += (t.clientY - ly) * TOUCH_SENS;
        lx = t.clientX; ly = t.clientY;
      }
      e.preventDefault();
    };
    const te = (e: TouchEvent) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === lookId) lookId = null; };

    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("touchstart", ts, { passive: true });
    canvas.addEventListener("touchmove", tm, { passive: false });
    canvas.addEventListener("touchend", te);
    canvas.addEventListener("touchcancel", te);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("touchstart", ts);
      canvas.removeEventListener("touchmove", tm);
      canvas.removeEventListener("touchend", te);
      canvas.removeEventListener("touchcancel", te);
    };
  }, [canvas]);

  // leave pointer lock whenever a panel opens
  useEffect(() => useGame.subscribe((s, prev) => {
    if (s.overlay !== "none" && prev.overlay === "none" && document.pointerLockElement) document.exitPointerLock();
    if (s.screen !== "play") clearInput();
  }), []);
}

export default function GameCanvas({ layout, tier: forcedTier, onContextLost }: { layout: StoreLayout; tier?: Tier; onContextLost?: () => void }) {
  const screen = useGame((s) => s.screen);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [tier] = useState<Tier>(() => forcedTier ?? decideTier().tier);
  const Q = TIER[tier];
  const lowTier = tier !== "high";
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio, Q.dprMax));
  useControls(canvas);

  useEffect(() => {
    useGame.getState().setTouch(matchMedia("(pointer: coarse)").matches);
  }, []);

  // A lost WebGL context (GPU memory pressure on phones) must not blank the page silently.
  useEffect(() => {
    if (!canvas) return;
    const lost = (e: Event) => { e.preventDefault(); onContextLost?.(); };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [canvas, onContextLost]);

  return (
    <Canvas
      className="game-canvas"
      shadows={Q.shadows}
      dpr={dpr}
      camera={{ fov: 70, near: 0.05, far: 120, position: [0, 2, 20] }}
      gl={{ antialias: Q.antialias, powerPreference: lowTier ? "default" : "high-performance" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.shadowMap.type = THREE.PCFShadowMap; // soft by default since r182
        scene.fog = new THREE.Fog("#F1D6C4", 22, 70);
        setCanvas(gl.domElement);
      }}
    >
      {/* performance-optimization: drop resolution under sustained load, with hysteresis */}
      <PerformanceMonitor flipflops={3} onDecline={() => setDpr((d) => Math.max(0.75, d - 0.25))} onIncline={() => setDpr((d) => Math.min(window.devicePixelRatio, Q.dprMax, d + 0.25))} />
      <Stats />
      <Physics timeStep={1 / 60} interpolate updatePriority={-50} gravity={[0, -9.81, 0]}>
        <Suspense fallback={null}>
          <World layout={layout} lowTier={lowTier} shadowMap={Q.shadowMap} lamps={Q.lamps} />
          <Products layout={layout} />
        </Suspense>
        {screen === "play" ? <Player key={layout.store.sourceUrl} spawn={layout.spawn} /> : <AttractCamera target={[0, 0, layout.template.depth / 2]} />}
      </Physics>
    </Canvas>
  );
}

// Start streaming the GLBs as soon as this module loads (progressive loading).
Object.values(MODEL).forEach((u) => useGLTF.preload(u));
