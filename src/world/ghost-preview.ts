// مسؤولية الملف: معاينة شفافة للمبنى على موقعه قبل تأكيد البناء — خضراء إن كان مسموحًا وحمراء إن لم يكن
// File responsibility: translucent preview of a building on its spot before confirming — green if allowed, red if not

import { Color3, StandardMaterial, TransformNode, type Scene } from '@babylonjs/core';
import type { ModelPart } from '../assets/catalog';
import type { ModelLibrary } from '../assets/model-library';
import type { World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';
import { spawnParts } from './building-models';

export class GhostPreview {
  private root: TransformNode | null = null;
  private key = '';
  private readonly okMat: StandardMaterial;
  private readonly badMat: StandardMaterial;

  constructor(private readonly scene: Scene, private readonly world: World, private readonly library: ModelLibrary) {
    const make = (name: string, color: Color3) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = color;
      m.emissiveColor = color.scale(0.45);
      m.alpha = 0.55;
      return m;
    };
    this.okMat = make('ghost-ok', new Color3(0.35, 0.95, 0.55));
    this.badMat = make('ghost-bad', new Color3(1, 0.35, 0.3));
  }

  /** معاينة القطع على المربع؛ لا يُعاد إنشاؤها إن لم يتغير شيء / Preview the parts on a tile; not rebuilt if nothing changed */
  show(parts: ModelPart[], tile: { x: number; z: number }, allowed: boolean, yaw = 0): void {
    const key = `${tile.x},${tile.z}|${allowed}|${yaw}|${parts.map((p) => p.path).join(',')}`;
    if (key === this.key) return;
    this.hide();
    this.key = key;
    const root = new TransformNode('ghost', this.scene);
    const c = tileCenter(this.world, tile.x, tile.z);
    root.position.set(c.x, Math.max(0, sampleHeight(this.world, c.x, c.z)) + 0.03, c.z);
    root.rotation.y = yaw;
    this.root = root;
    void spawnParts(this.library, this.scene, root, parts, this.world.settings.tileSize).then((meshes) => {
      for (const m of meshes) {
        m.material = allowed ? this.okMat : this.badMat;
        m.isPickable = false;
      }
    });
  }

  hide(): void {
    this.root?.dispose();
    this.root = null;
    this.key = '';
  }
}
