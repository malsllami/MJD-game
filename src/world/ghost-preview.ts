// مسؤولية الملف: معاينة شفافة للمبنى على موقعه قبل تأكيد البناء — خضراء إن كان مسموحًا، وبرتقالية إن كان مسموحًا في موقع غير مقترح،
// وحمراء إن لم يكن مسموحًا
// File responsibility: translucent preview of a building on its spot before confirming — green if allowed, amber if allowed on a
// spot that is not suggested, red if not allowed

import { Color3, StandardMaterial, TransformNode, type Scene } from '@babylonjs/core';
import type { Look } from '../assets/catalog';
import type { ModelLibrary } from '../assets/model-library';
import type { World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';
import { spawnParts } from './building-models';

/** لون المعاينة: مسموح، أو مسموح في موقع غير مقترح، أو ممنوع / Preview tone: allowed, allowed off the suggested spots, or blocked */
export type GhostTone = 'ok' | 'warn' | 'bad';

export class GhostPreview {
  private root: TransformNode | null = null;
  private key = '';
  private readonly materials: Record<GhostTone, StandardMaterial>;

  constructor(private readonly scene: Scene, private readonly world: World, private readonly library: ModelLibrary) {
    const make = (name: string, color: Color3) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = color;
      m.emissiveColor = color.scale(0.45);
      m.alpha = 0.55;
      return m;
    };
    this.materials = {
      ok: make('ghost-ok', new Color3(0.35, 0.95, 0.55)),
      warn: make('ghost-warn', new Color3(1, 0.7, 0.25)),
      bad: make('ghost-bad', new Color3(1, 0.35, 0.3)),
    };
  }

  /** معاينة القطع على المربع؛ لا يُعاد إنشاؤها إن لم يتغير شيء / Preview the parts on a tile; not rebuilt if nothing changed */
  show(look: Look, tile: { x: number; z: number }, tone: GhostTone, yaw = 0): void {
    const paths = (Array.isArray(look) ? look : look.pieces).map((p) => p.path).join(',');
    const key = `${tile.x},${tile.z}|${tone}|${yaw}|${paths}`;
    if (key === this.key) return;
    this.hide();
    this.key = key;
    const root = new TransformNode('ghost', this.scene);
    const c = tileCenter(this.world, tile.x, tile.z);
    root.position.set(c.x, Math.max(0, sampleHeight(this.world, c.x, c.z)) + 0.03, c.z);
    root.rotation.y = yaw;
    this.root = root;
    void spawnParts(this.library, this.scene, root, look, this.world.settings.tileSize).then((meshes) => {
      for (const m of meshes) {
        m.material = this.materials[tone];
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
