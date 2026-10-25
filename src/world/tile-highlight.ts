// مسؤولية الملف: إطار ذهبي يحيط بالمربع المحدد ويتبع شكل التضاريس
// File responsibility: gold outline around the selected tile that follows the terrain surface

import { Color3, MeshBuilder, Scene, Vector3, type LinesMesh } from '@babylonjs/core';
import type { World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';

const SEGMENTS_PER_EDGE = 8;
const LIFT = 0.25;

export class TileHighlight {
  private mesh: LinesMesh | null = null;

  constructor(private readonly scene: Scene, private readonly world: World) {}

  /** إظهار الإطار حول مربع / Show the outline around a tile */
  show(x: number, z: number): void {
    const points = this.outline(x, z);
    this.mesh = MeshBuilder.CreateLines('tile-highlight', { points, updatable: true, instance: this.mesh ?? undefined }, this.scene);
    this.mesh.color = new Color3(0.91, 0.83, 0.6);
    this.mesh.isPickable = false;
    this.mesh.setEnabled(true);
  }

  hide(): void {
    this.mesh?.setEnabled(false);
  }

  /** نقاط محيط المربع على سطح الأرض أو الماء / Perimeter points on the ground or water surface */
  private outline(x: number, z: number): Vector3[] {
    const { tileSize } = this.world.settings;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const x0 = x * tileSize - halfX;
    const z0 = z * tileSize - halfZ;
    const corners: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    const points: Vector3[] = [];
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c];
      const [bx, bz] = corners[c + 1];
      for (let s = 0; s < SEGMENTS_PER_EDGE; s++) {
        const t = s / SEGMENTS_PER_EDGE;
        const wx = x0 + (ax + (bx - ax) * t) * tileSize;
        const wz = z0 + (az + (bz - az) * t) * tileSize;
        points.push(new Vector3(wx, Math.max(0, sampleHeight(this.world, wx, wz)) + LIFT, wz));
      }
    }
    points.push(points[0].clone());
    return points;
  }
}
