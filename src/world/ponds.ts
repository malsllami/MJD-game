// مسؤولية الملف: رسم البرك الطبيعية — سطح ماء مستدير على كل مربع بركة يتداخل مع جيرانه فتبدو البركة قطعة واحدة
// File responsibility: draws the natural ponds — a round water surface on every pond tile, overlapping its neighbours so a pond reads as one body

import { Mesh, MeshBuilder, type Scene } from '@babylonjs/core';
import type { World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';
import { waterMaterial } from './building-models';

/** نصف قطر سطح الماء كنسبة من ضلع المربع: يكاد يملأ مربعه فيتصل بجيرانه دون أن يطغى على مبنى مجاور / Water radius as a tile fraction: nearly filling its tile so it joins its neighbours without spilling onto a nearby building */
const RADIUS = 0.53;

/** يرسم كل البرك مرة واحدة في مجسم واحد / Draws every pond once, in a single mesh */
export function drawPonds(scene: Scene, world: World): Mesh | null {
  if (!world.ponds.length) return null;
  const s = world.settings.tileSize;
  const discs = world.ponds.map((k) => {
    const [x, z] = k.split(',').map(Number);
    const c = tileCenter(world, x, z);
    const disc = MeshBuilder.CreateDisc('pond', { radius: s * RADIUS, tessellation: 24 }, scene);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(c.x, Math.max(0, sampleHeight(world, c.x, c.z)) + 0.04, c.z);
    return disc;
  });
  const mesh = Mesh.MergeMeshes(discs, true, true)!;
  mesh.material = waterMaterial(scene);
  mesh.isPickable = false;
  return mesh;
}
