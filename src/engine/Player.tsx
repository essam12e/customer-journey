"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  CapsuleCollider, RigidBody, useBeforePhysicsStep, useRapier,
  type RapierCollider, type RapierRigidBody,
} from "@react-three/rapier";
import type { KinematicCharacterController } from "@dimforge/rapier3d-compat";
import { input } from "@/input/input";
import { useGame } from "@/game/state";
import { sfx } from "@/audio/audio";
import { debug } from "./debug";
import { playerPos } from "./playerPos";

// Player metrics (level-design): capsule radius 0.3, total height 1.6, eyes at 1.52 m.
const RADIUS = 0.3;
const HALF = 0.5; // half height of the cylinder part → centre at 0.8
const EYE = 0.72; // above the capsule centre
const WALK = 2.9;
const SPRINT = 4.6;
const ACCEL = 9; // 1/s, exponential approach to target speed
const DECEL = 11;
const GRAVITY = 18;
const PITCH_MAX = THREE.MathUtils.degToRad(80);
const STEP_LEN = 0.78; // metres per footstep sound

export function Player({ spawn }: { spawn: { x: number; z: number; yaw: number } }) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<THREE.Group>(null);
  const { world } = useRapier();
  const camera = useThree((s) => s.camera);
  const ctrl = useRef<KinematicCharacterController | null>(null);
  const vel = useRef(new THREE.Vector3());
  const look = useRef({ yaw: spawn.yaw, pitch: -0.04 });
  const grounded = useRef(true);
  const bob = useRef({ phase: 0, dist: 0, amt: 0 });
  const tmp = useRef(new THREE.Vector3());

  useEffect(() => {
    const c = world.createCharacterController(0.02);
    c.setSlideEnabled(true); // slide along shelves/walls instead of sticking
    c.enableAutostep(0.25, 0.2, false); // rugs / thresholds
    c.enableSnapToGround(0.3);
    c.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(40));
    ctrl.current = c;
    return () => { world.removeCharacterController(c); ctrl.current = null; };
  }, [world]);

  useEffect(() => {
    debug.player = () => {
      const t = body.current?.translation() ?? { x: 0, y: 0, z: 0 };
      return { x: t.x, y: t.y, z: t.z, yaw: look.current.yaw, pitch: look.current.pitch, speed: Math.hypot(vel.current.x, vel.current.z), grounded: grounded.current };
    };
    debug.teleport = (x, z, yaw, pitch) => {
      body.current?.setTranslation({ x, y: HALF + RADIUS + 0.02, z }, true);
      body.current?.setNextKinematicTranslation({ x, y: HALF + RADIUS + 0.02, z });
      vel.current.set(0, 0, 0);
      if (yaw !== undefined) look.current.yaw = yaw;
      if (pitch !== undefined) look.current.pitch = pitch;
    };
    return () => { debug.player = undefined; debug.teleport = undefined; playerPos.current = null; };
  }, []);

  // Simulation runs on the fixed physics tick (physics-tuning).
  useBeforePhysicsStep((w) => {
    const b = body.current, col = collider.current, c = ctrl.current;
    if (!b || !col || !c) return;
    const dt = w.timestep;
    const blocked = useGame.getState().overlay !== "none";
    const mx = blocked ? 0 : input.move.x, my = blocked ? 0 : input.move.y;
    const yaw = look.current.yaw;
    // forward = -Z rotated by yaw
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const speed = input.sprint ? SPRINT : WALK;
    const tx = (fx * my + rx * mx) * speed, tz = (fz * my + rz * mx) * speed;
    const k = 1 - Math.exp(-(mx || my ? ACCEL : DECEL) * dt);
    vel.current.x += (tx - vel.current.x) * k;
    vel.current.z += (tz - vel.current.z) * k;
    vel.current.y = grounded.current ? -1 : vel.current.y - GRAVITY * dt;

    c.computeColliderMovement(col, { x: vel.current.x * dt, y: vel.current.y * dt, z: vel.current.z * dt });
    const m = c.computedMovement();
    grounded.current = c.computedGrounded();
    const p = b.translation();
    b.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
    // keep velocity consistent with what actually happened (no "pushing" into walls)
    if (dt > 0) { vel.current.x = m.x / dt; vel.current.z = m.z / dt; }
  });

  // Camera follows the INTERPOLATED body after physics has stepped (Physics updatePriority = -50).
  useFrame((_, rawDt) => {
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    const L = look.current;
    L.yaw -= input.look.dx;
    L.pitch = THREE.MathUtils.clamp(L.pitch - input.look.dy, -PITCH_MAX, PITCH_MAX);
    input.look.dx = input.look.dy = 0;

    const v = visual.current;
    if (!v) return;
    v.getWorldPosition(tmp.current);
    playerPos.current = playerPos.current ?? new THREE.Vector3();
    playerPos.current.set(tmp.current.x, tmp.current.y - (HALF + RADIUS), tmp.current.z);

    // head bob scaled by speed (game-feel: subtle, returns to rest)
    const sp = Math.hypot(vel.current.x, vel.current.z);
    const B = bob.current;
    B.amt += ((Math.min(sp / WALK, 1.4)) - B.amt) * (1 - Math.exp(-8 * dt));
    B.phase += sp * dt * 2.2;
    B.dist += sp * dt;
    if (B.dist > STEP_LEN && grounded.current) { B.dist = 0; sfx.step(); }

    camera.position.set(tmp.current.x, tmp.current.y + EYE + Math.sin(B.phase * 2) * 0.03 * B.amt, tmp.current.z);
    camera.rotation.set(L.pitch + Math.sin(B.phase * 2) * 0.004 * B.amt, L.yaw, Math.sin(B.phase) * 0.006 * B.amt, "YXZ");
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[spawn.x, HALF + RADIUS + 0.02, spawn.z]} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={collider} args={[HALF, RADIUS]} />
      <group ref={visual} />
    </RigidBody>
  );
}

/** Start-screen camera: a slow cinematic drift in front of the storefront (no gameplay). */
export function AttractCamera({ target }: { target: [number, number, number] }) {
  const camera = useThree((s) => s.camera);
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.08;
    camera.position.set(Math.sin(t) * 5.5, 2.2 + Math.sin(t * 1.7) * 0.25, target[2] + 9.5 + Math.cos(t) * 1.2);
    camera.lookAt(target[0], 2.1, target[2]);
  });
  return null;
}
