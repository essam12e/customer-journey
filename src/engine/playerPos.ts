"use client";
import * as THREE from "three";
/** Interpolated player feet position, written by Player every frame, read by doors/interaction. */
export const playerPos: { current: THREE.Vector3 | null } = { current: null };
