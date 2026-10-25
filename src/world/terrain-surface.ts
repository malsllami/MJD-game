// مسؤولية الملف: تسوية الأرض تحت المباني والطرق ومركز القرية، وإعادتها لشكلها الأصلي عند الإزالة
// File responsibility: levels the ground under buildings, roads and the village centre, restoring it when they go

import { Mesh, VertexBuffer, VertexData } from '@babylonjs/core';
import type { World } from '../core/types';

/** أدنى ارتفاع للأرض المسوّاة حتى لا تنزل تحت سطح البحر / Lowest levelled height, kept above the sea */
const MIN_LEVEL = 0.2;

export class TerrainSurface {
  private readonly original: Float32Array;
  private signature = '';

  constructor(private readonly mesh: Mesh, private readonly world: World) {
    this.original = world.heights.slice();
  }

  /**
   * تسوية المربعات المعطاة فقط؛ كل مربع يأخذ متوسط ارتفاعه الأصلي، والبقية تعود لأصلها
   * Level only the given tiles; each takes its original average height and everything else returns to its original shape
   */
  level(keys: string[]): boolean {
    const signature = [...keys].sort().join(';');
    if (signature === this.signature) return false;
    this.signature = signature;

    const { vertsX, heights } = this.world;
    const vpt = this.world.settings.vertsPerTile;
    heights.set(this.original);
    for (const key of keys) {
      const [x, z] = key.split(',').map(Number);
      let sum = 0;
      let n = 0;
      for (let iz = z * vpt; iz <= (z + 1) * vpt; iz++) {
        for (let ix = x * vpt; ix <= (x + 1) * vpt; ix++) {
          sum += this.original[iz * vertsX + ix];
          n++;
        }
      }
      const target = Math.max(MIN_LEVEL, sum / n);
      for (let iz = z * vpt; iz <= (z + 1) * vpt; iz++) {
        for (let ix = x * vpt; ix <= (x + 1) * vpt; ix++) heights[iz * vertsX + ix] = target;
      }
    }

    const positions = this.mesh.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < heights.length; i++) positions[i * 3 + 1] = heights[i];
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, this.mesh.getIndices(), normals);
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    this.mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    this.mesh.refreshBoundingInfo();
    return true;
  }
}
