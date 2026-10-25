// مسؤولية الملف: مجسم مركز الاستيطان (قرية ثم بلدة ثم مدينة) — يكبر ويرتفع مع كل مرحلة
// File responsibility: settlement centre model (village, then town, then city) — grows denser and taller each stage

import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3, type ShadowGenerator } from '@babylonjs/core';
import { createNoise } from '../core/noise';
import type { NightLights } from './day-night';

/** لون إضاءة النوافذ ليلًا / Night window light colour */
export const WINDOW_LIGHT = new Color3(0.42, 0.3, 0.14);

/**
 * ينشئ مجموعة مبانٍ داخل مربع واحد؛ level هو ترتيب المرحلة (1 للقرية)
 * Builds a cluster of buildings inside one tile; level is the stage order (1 for the village)
 */
export function createSettlementModel(
  scene: Scene,
  center: Vector3,
  tileSize: number,
  seed: number,
  heightAt: (x: number, z: number) => number,
  shadows: ShadowGenerator | null,
  level: number,
  lights: NightLights,
): Mesh {
  const rnd = createNoise(seed, 1);
  const walls = new StandardMaterial('settlement-walls', scene);
  walls.diffuseColor = new Color3(0.88, 0.85, 0.78);
  walls.specularColor = new Color3(0.05, 0.05, 0.05);
  // نوافذ القرية تضيء ليلًا / Village windows light up at night
  lights.add(walls, WINDOW_LIGHT);
  const roofs = new StandardMaterial('settlement-roofs', scene);
  roofs.diffuseColor = new Color3(0.55, 0.36, 0.26);
  roofs.specularColor = new Color3(0.05, 0.05, 0.05);

  const parts: Mesh[] = [];
  const grid = 2 + level;
  const cell = (tileSize * 0.86) / grid;
  const tall = 0.5 + level * 0.7;
  for (let gz = 0; gz < grid; gz++) {
    for (let gx = 0; gx < grid; gx++) {
      const r = rnd(gx * 3.1 + 0.5, gz * 2.7 + 0.5);
      if (r < 0.3) continue;
      const w = cell * (0.55 + r * 0.3);
      const h = cell * (0.6 + r * tall);
      const x = center.x + (gx - (grid - 1) / 2) * cell;
      const z = center.z + (gz - (grid - 1) / 2) * cell;
      const ground = heightAt(x, z);
      const body = MeshBuilder.CreateBox('b', { width: w, depth: w, height: h }, scene);
      body.position = new Vector3(x, ground + h / 2, z);
      body.material = walls;
      parts.push(body);
      const roof = MeshBuilder.CreateCylinder('r', { diameterTop: 0, diameterBottom: w * 1.35, height: w * 0.5, tessellation: 4 }, scene);
      roof.rotation.y = Math.PI / 4;
      roof.position = new Vector3(x, ground + h + w * 0.25, z);
      roof.material = roofs;
      parts.push(roof);
    }
  }

  const settlement = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
  settlement.name = 'settlement';
  shadows?.addShadowCaster(settlement);
  return settlement;
}
