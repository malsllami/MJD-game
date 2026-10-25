// مسؤولية الملف: رسم الحدود الخارجية لمجموعة مربعات فوق التضاريس (حدود الدولة، أو الأماكن المسموحة للبناء)
// File responsibility: draws the outer border of a set of tiles over the terrain (nation borders, or allowed build spots)

import { Color3, MeshBuilder, Scene, Vector3, type LinesMesh } from '@babylonjs/core';
import { tileKey } from '../core/economy';
import type { World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';

const SEGMENTS = 4;

export class TileSetOutline {
  private mesh: LinesMesh | null = null;
  private signature = '';

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly color: Color3,
    private readonly lift: number,
  ) {}

  /** تحديث المجموعة؛ لا يعيد البناء إن لم تتغير / Update the set; rebuilds only when it changed */
  show(keys: string[]): void {
    const signature = keys.length + ':' + keys.join(';');
    if (signature === this.signature) return;
    this.signature = signature;
    this.mesh?.dispose();
    this.mesh = null;
    if (!keys.length) return;
    const lines = this.borderLines(new Set(keys));
    this.mesh = MeshBuilder.CreateLineSystem('tile-set-outline', { lines }, this.scene);
    this.mesh.color = this.color;
    this.mesh.isPickable = false;
  }

  clear(): void {
    this.show([]);
  }

  /** حافة كل مربع لا يجاوره مربع من نفس المجموعة / Every tile edge not shared with another tile of the set */
  private borderLines(set: Set<string>): Vector3[][] {
    const { tileSize } = this.world.settings;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const lines: Vector3[][] = [];
    const edge = (ax: number, az: number, bx: number, bz: number) => {
      const pts: Vector3[] = [];
      for (let s = 0; s <= SEGMENTS; s++) {
        const t = s / SEGMENTS;
        const wx = (ax + (bx - ax) * t) * tileSize - halfX;
        const wz = (az + (bz - az) * t) * tileSize - halfZ;
        pts.push(new Vector3(wx, Math.max(0, sampleHeight(this.world, wx, wz)) + this.lift, wz));
      }
      lines.push(pts);
    };
    for (const key of set) {
      const [x, z] = key.split(',').map(Number);
      if (!set.has(tileKey(x, z - 1))) edge(x, z, x + 1, z);
      if (!set.has(tileKey(x + 1, z))) edge(x + 1, z, x + 1, z + 1);
      if (!set.has(tileKey(x, z + 1))) edge(x + 1, z + 1, x, z + 1);
      if (!set.has(tileKey(x - 1, z))) edge(x, z + 1, x, z);
    }
    return lines;
  }
}
