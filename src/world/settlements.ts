// مسؤولية الملف: مجسم مبنى الحكم (قاعة خشبية، ثم حجرية، ثم مبنى حديث) — يكبر مع كل مرحلة
// File responsibility: the government building model (a timber hall, then stone, then modern) — grows each stage

import { TransformNode, type AbstractMesh, type Scene, type ShadowGenerator, type Vector3 } from '@babylonjs/core';
import { settlementLook } from '../assets/catalog';
import type { ModelLibrary } from '../assets/model-library';
import { spawnParts } from './building-models';

/**
 * ينشئ مبنى الحكم؛ level هو ترتيب المرحلة (1 للقرية)
 * Builds the government building; level is the stage order (1 for the village)
 */
export async function createSettlementModel(
  library: ModelLibrary,
  scene: Scene,
  center: Vector3,
  tileSize: number,
  level: number,
  shadows: ShadowGenerator | null,
): Promise<{ root: TransformNode; meshes: AbstractMesh[] }> {
  const root = new TransformNode('settlement', scene);
  root.position.copyFrom(center);
  // الواجهة والساحة نحو زاوية الكاميرا الافتتاحية / The front and forecourt face the opening camera angle
  root.rotation.y = Math.PI;
  const meshes = await spawnParts(library, scene, root, settlementLook(level), tileSize);
  for (const m of meshes) shadows?.addShadowCaster(m);
  return { root, meshes };
}
