// مسؤولية الملف: حواجز الحواف — سور خشبي لكل حافة، وقوس لكل بوابة، وشريط ماء لكل قطعة جدول، تظهر بعد اكتمال بنائها
// File responsibility: edge barriers — a wooden fence per edge, an arch per gate and a water ribbon per stream piece, shown once built

import { MeshBuilder, TransformNode, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { waterMaterial } from './building-models';
import type { ModelLibrary } from '../assets/model-library';
import { edgeCorners, isUnderConstruction } from '../core/economy';
import type { BuildingDef, GameState, World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';

/** نموذج كل نمط سور / The model of each wall style */
const WALL_PIECES: Record<string, string> = { wall: 'village/Prop_WoodenFence_Single.glb', gate: 'village/Wall_Arch.glb' };

export class WallNetwork {
  private readonly pieces = new Map<string, TransformNode>();
  private signature = '';

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly library: ModelLibrary,
    private readonly defs: Map<string, BuildingDef>,
    private readonly shadows: ShadowGenerator | null,
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
      const model = this.defs.get(w.buildingId)?.model ?? '';
      const path = WALL_PIECES[model];
      if (!path && model !== 'stream') continue;
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
      if (model === 'stream') {
        // الجدول شريط ماء على الحافة / The stream is a ribbon of water on the edge
        const ribbon = MeshBuilder.CreateGround('stream', { width: s * 1.02, height: s * 0.24 }, this.scene);
        ribbon.parent = holder;
        ribbon.position.y = 0.05;
        ribbon.rotation.y = yaw;
        ribbon.material = waterMaterial(this.scene);
        ribbon.isPickable = false;
        continue;
      }
      void this.library.spawn(path!, { footprint: s * 0.98, yaw }).then(({ root, meshes }) => {
        if (holder.isDisposed()) return root.dispose();
        root.parent = holder;
        for (const m of meshes) this.shadows?.addShadowCaster(m);
      });
    }
    for (const [key, holder] of this.pieces) {
      if (alive.has(key)) continue;
      holder.dispose();
      this.pieces.delete(key);
    }
  }
}
