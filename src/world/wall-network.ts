// مسؤولية الملف: الماء على الحواف — شريط ماء لكل قطعة جدول، وماء ضيق منساب في قناة الري المتصلة بالبئر (مجراها ترسمه الأرض؛
// والأسوار والبوابات يرسمها village-wall)
// File responsibility: water on edges — a water ribbon per stream piece, and a narrow flowing water line in an irrigation canal joined to the
// well (its bed is painted by the ground; walls and gates are drawn by village-wall)

import { Color3, MeshBuilder, StandardMaterial, TransformNode, type Scene } from '@babylonjs/core';
import { rippleTexture } from './ponds';
import { waterMaterial } from './building-models';
import { edgeCorners, isUnderConstruction } from '../core/economy';
import type { BuildingDef, GameState, World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';


export class WallNetwork {
  private readonly pieces = new Map<string, TransformNode>();
  private signature = '';
  private canalWater: StandardMaterial | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly defs: Map<string, BuildingDef>,
  ) {}

  /**
   * مطابقة القطع مع الحواف المكتملة؛ wet حواف القنوات المتصلة بالماء. لا يُعاد الرسم إلا عند التغير
   * Match pieces to finished edges; wet holds the canal edges joined to water. Redrawn only on change
   */
  sync(state: GameState, now: number, wet: Set<string>): void {
    const built = state.walls.filter((w) => !isUnderConstruction(w, now));
    const signature = built.map((w) => `${w.edge}:${w.buildingId}:${wet.has(w.edge) ? 1 : 0}`).sort().join(';');
    if (signature === this.signature) return;
    this.signature = signature;
    const alive = new Set<string>();
    for (const w of built) {
      const model = this.defs.get(w.buildingId)?.model;
      const canal = model === 'canal';
      // القناة الجافة (غير المتصلة) مجرى بلا ماء / A dry (unjoined) canal is a bed with no water
      if (canal && !wet.has(w.edge)) continue;
      const key = `${w.edge}:${w.buildingId}`;
      alive.add(key);
      if (this.pieces.has(key)) continue;
      if (model !== 'stream' && !canal) continue;
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

      // الجدول شريط ماء على الحافة، والقناة خيط ماء ضيق منساب / The stream is a ribbon of water on the edge, the canal a narrow flowing line
      const ribbon = MeshBuilder.CreateGround(canal ? 'canal' : 'stream', { width: s * 1.02, height: s * (canal ? 0.06 : 0.24) }, this.scene);
      ribbon.parent = holder;
      ribbon.position.y = canal ? 0.03 : 0.05;
      ribbon.rotation.y = yaw;
      ribbon.material = canal ? this.flowing() : waterMaterial(this.scene);
      ribbon.isPickable = false;
    }
    for (const [key, holder] of this.pieces) {
      if (alive.has(key)) continue;
      holder.dispose();
      this.pieces.delete(key);
    }
  }

  /** ماء القناة المنساب: تموج يتحرك ببطء بلا محاكاة / The canal's flowing water: a slowly moving ripple, no simulation */
  private flowing(): StandardMaterial {
    if (this.canalWater) return this.canalWater;
    const m = new StandardMaterial('canal-water', this.scene);
    m.diffuseColor = new Color3(0.22, 0.46, 0.56);
    m.specularColor = new Color3(0.5, 0.58, 0.62);
    const ripple = rippleTexture(this.scene);
    ripple.uScale = 6;
    ripple.vScale = 1;
    m.bumpTexture = ripple;
    this.scene.onBeforeRenderObservable.add(() => (ripple.uOffset -= 0.25 * this.scene.getEngine().getDeltaTime() / 1000));
    this.canalWater = m;
    return m;
  }
}
