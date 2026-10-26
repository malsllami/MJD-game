// مسؤولية الملف: مجسم مبنى الحكم (قاعة خشبية، ثم حجرية، ثم مبنى حديث) — يكبر مع كل مرحلة
// File responsibility: the government building model (a timber hall, then stone, then modern) — grows each stage

import { TransformNode, type AbstractMesh, type Scene, type ShadowGenerator, type Vector3 } from '@babylonjs/core';
import { settlementLook } from '../assets/catalog';
import type { ModelLibrary } from '../assets/model-library';
import { spawnParts } from './building-models';
import { WINDOW_LIGHT, type Glowing, type NightLights } from './day-night';

/**
 * ينشئ مركز القرية؛ level هو ترتيب المرحلة (1 للقرية)، ونوافذه تضيء ليلًا
 * Builds the settlement centre; level is the stage order (1 for the village), with windows lit at night
 */
export async function createSettlementModel(
  library: ModelLibrary,
  scene: Scene,
  center: Vector3,
  tileSize: number,
  level: number,
  shadows: ShadowGenerator | null,
  lights: NightLights,
): Promise<{ root: TransformNode; meshes: AbstractMesh[] }> {
  const root = new TransformNode('settlement', scene);
  root.position.copyFrom(center);
  const meshes = await spawnParts(library, scene, root, settlementLook(level), tileSize);
  const lit = new Set<unknown>();
  for (const m of meshes) {
    shadows?.addShadowCaster(m);
    const mat = m.material;
    if (mat && !lit.has(mat) && 'emissiveColor' in mat) {
      lit.add(mat);
      lights.add(mat as unknown as Glowing, WINDOW_LIGHT);
    }
  }
  return { root, meshes };
}
