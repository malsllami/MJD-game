// مسؤولية الملف: تلوين مجموعة مربعات بطبقة شفافة فوق الأرض (المواقع المقترحة للبناء)
// File responsibility: tints a set of tiles with a translucent layer over the ground (the suggested build spots)

import { Color3, Mesh, StandardMaterial, VertexData, type Scene } from '@babylonjs/core';
import type { World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';

/** هامش داخل كل مربع حتى تبقى خطوط الشبكة ظاهرة / Inset inside each tile so the grid lines stay visible */
const INSET = 0.06;

export class TileSetFill {
  private mesh: Mesh | null = null;
  private signature = '';
  private readonly material: StandardMaterial;

  constructor(private readonly scene: Scene, private readonly world: World, color: Color3, alpha: number, private readonly lift: number) {
    this.material = new StandardMaterial('tile-set-fill', scene);
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.material.emissiveColor = color;
    this.material.disableLighting = true;
    this.material.alpha = alpha;
    this.material.backFaceCulling = false;
  }

  /** تحديث المجموعة؛ لا يعيد البناء إن لم تتغير / Update the set; rebuilds only when it changed */
  show(keys: string[]): void {
    const signature = keys.length + ':' + keys.join(';');
    if (signature === this.signature) return;
    this.signature = signature;
    this.mesh?.dispose();
    this.mesh = null;
    if (!keys.length) return;
    const { tileSize } = this.world.settings;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const positions: number[] = [];
    const indices: number[] = [];
    for (const key of keys) {
      const [x, z] = key.split(',').map(Number);
      const base = positions.length / 3;
      for (const [cx, cz] of [[INSET, INSET], [1 - INSET, INSET], [1 - INSET, 1 - INSET], [INSET, 1 - INSET]]) {
        const wx = (x + cx) * tileSize - halfX;
        const wz = (z + cz) * tileSize - halfZ;
        positions.push(wx, Math.max(0, sampleHeight(this.world, wx, wz)) + this.lift, wz);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    const mesh = new Mesh('tile-set-fill', this.scene);
    data.applyToMesh(mesh);
    mesh.material = this.material;
    mesh.isPickable = false;
    this.mesh = mesh;
  }

  clear(): void {
    this.show([]);
  }
}
