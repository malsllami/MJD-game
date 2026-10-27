// مسؤولية الملف: الجداول على الحواف — شريط ماء لكل قطعة جدول بعد اكتمال بنائها (الأسوار والبوابات يرسمها village-wall)
// File responsibility: streams on edges — a water ribbon per stream piece once built (walls and gates are drawn by village-wall)

import { MeshBuilder, TransformNode, type Scene } from '@babylonjs/core';
import { waterMaterial } from './building-models';
import { edgeCorners, isUnderConstruction } from '../core/economy';
import type { BuildingDef, GameState, World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';


export class WallNetwork {
  private readonly pieces = new Map<string, TransformNode>();
  private signature = '';

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly defs: Map<string, BuildingDef>,
  ) {}

  /** مطابقة القطع مع الأسوار المكتملة؛ لا يُعاد الرسم إلا عند التغير / Match pieces to finished walls; redrawn only on change */
  sync(state: GameState, now: number): void {
    const built = state.walls.filter((w) => !isUnderConstruction(w, now));
    const signature = built.map((w) => `${w.edge}:${w.buildingId}`).sort().join(';');
    if (signature === this.signature) return;
    this.signature = signature;
    const alive = new Set<string>();
    for (const w of built) {
      const key = `${w.edge}:${w.buildingId}`;
      alive.add(key);
      if (this.pieces.has(key)) continue;
      if (this.defs.get(w.buildingId)?.model !== 'stream') continue;
      const holder = new TransformNode(`wall-${key}`, this.scene);
      this.pieces.set(key, holder);
      const [[ax, az], [bx, bz]] = edgeCorners(w.edge);
      const { halfX, halfZ } = worldHalfExtents(this.world);
      const s = this.world.settings.tileSize;
      const x = ((ax + bx) / 2) * s - halfX;
      const z = ((az + bz) / 2) * s - halfZ;
      holder.position.set(x, Math.max(0, sampleHeight(this.world, x, z)), z);
      // الحافة الأفقية تمتد على x، والعمودية على z / A horizontal edge runs along x, a vertical one along z
      const yaw = az === bz ? 0 : Math.PI / 2;

      // الجدول شريط ماء على الحافة / The stream is a ribbon of water on the edge
      const ribbon = MeshBuilder.CreateGround('stream', { width: s * 1.02, height: s * 0.24 }, this.scene);
      ribbon.parent = holder;
      ribbon.position.y = 0.05;
      ribbon.rotation.y = yaw;
      ribbon.material = waterMaterial(this.scene);
      ribbon.isPickable = false;
    }
    for (const [key, holder] of this.pieces) {
      if (alive.has(key)) continue;
      holder.dispose();
      this.pieces.delete(key);
    }
  }
}
