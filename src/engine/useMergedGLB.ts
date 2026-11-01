"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface MergedPart { name: string; geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }

/**
 * performance-optimization: collapse a GLB into one geometry per material, so N copies of a prop
 * cost (#materials) draw calls via InstancedMesh instead of (#meshes × N).
 */
export function useMergedGLB(url: string): MergedPart[] {
  const gltf = useGLTF(url);
  return useMemo(() => {
    const groups = new Map<string, { mat: THREE.MeshStandardMaterial; geos: THREE.BufferGeometry[] }>();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
      const e = groups.get(mat.name) ?? { mat, geos: [] };
      e.geos.push(g);
      groups.set(mat.name, e);
    });
    return [...groups].map(([name, { mat, geos }]) => ({ name, geometry: mergeGeometries(geos)!, material: mat }));
  }, [gltf]);
}

// The static build ships the same models as embedded .gltf JSON (hosts that don't serve .glb).
const EXT = process.env.NEXT_PUBLIC_STATIC === "1" ? "gltf.json" : "glb";
export const MODEL = {
  shelf: `models/shelf.${EXT}`,
  counter: `models/counter.${EXT}`,
  plant: `models/plant.${EXT}`,
  lamp: `models/lamp.${EXT}`,
  bench: `models/bench.${EXT}`,
};
