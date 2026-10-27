// مسؤولية الملف: مجسم مبنى الحكم ومجمعه (قاعة وساحة وحدائق وسور منخفض) — يكبر مع كل مستوى
// File responsibility: the government building and its compound (hall, forecourt, gardens and a low wall) — grows each level

import { TransformNode, type AbstractMesh, type Scene, type ShadowGenerator, type Vector3 } from '@babylonjs/core';
import type { Look } from '../assets/catalog';
import type { ModelLibrary } from '../assets/model-library';
import { spawnParts } from './building-models';

/**
 * ينشئ مبنى الحكم بشكله look في مركز مجمعه
 * Builds the government building with its look at the compound's centre
 */
export async function createSettlementModel(
  library: ModelLibrary,
  scene: Scene,
  center: Vector3,
  tileSize: number,
  look: Look,
  shadows: ShadowGenerator | null,
): Promise<{ root: TransformNode; meshes: AbstractMesh[] }> {
  const root = new TransformNode('settlement', scene);
  root.position.copyFrom(center);
  // الواجهة والساحة نحو زاوية الكاميرا الافتتاحية / The front and forecourt face the opening camera angle
  root.rotation.y = Math.PI;
  const meshes = await spawnParts(library, scene, root, look, tileSize);
  for (const m of meshes) shadows?.addShadowCaster(m);
  return { root, meshes };
}
