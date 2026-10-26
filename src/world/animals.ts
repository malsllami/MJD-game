// مسؤولية الملف: حيوانات الحظائر — أبقار وأغنام وخنازير وخيول تتجول وترعى حول الحظائر العاملة؛ بصرية فقط بلا أثر اقتصادي
// File responsibility: barn animals — cows, sheep, pigs and horses wandering and grazing around operating barns; visual only

import { TransformNode, Vector3, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { styleOf } from '../assets/catalog';
import type { ModelLibrary } from '../assets/model-library';
import { buildingStatus } from '../core/economy';
import type { GameDefinitions, GameState, World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';

/** أنماط المباني التي ترعى حولها الحيوانات، وعددها / Building styles animals graze around, and how many */
const HERDS: Record<string, number> = { barn: 4, 'house-herder': 2 };
const KINDS = ['animals/Cow.glb', 'animals/Sheep.glb', 'animals/Pig.glb', 'animals/Horse.glb', 'animals/Sheep.glb'];
/** طول الحيوان بالنسبة لضلع المربع / Animal length vs tile side */
const SIZE = 0.13;
/** سرعة المشي بالمربعات في الثانية، ومدى التجوال حول الحظيرة / Walking speed in tiles per second, and the roaming radius */
const SPEED = 0.06;
const ROAM = 0.55;

interface Animal {
  root: TransformNode;
  home: Vector3;
  target: Vector3;
  rest: number;
  phase: number;
}

export class Animals {
  private readonly herds = new Map<string, Animal[]>();

  constructor(private readonly scene: Scene, private readonly world: World, private readonly library: ModelLibrary, private readonly shadows: ShadowGenerator | null) {
    scene.onBeforeRenderObservable.add(() => this.step(scene.getEngine().getDeltaTime() / 1000));
  }

  /** قطيع لكل حظيرة عاملة، ويختفي إذا توقفت أو هُدمت / A herd per operating barn, gone when it stops or is demolished */
  sync(state: GameState, defs: GameDefinitions, now: number): void {
    const byId = new Map(defs.buildings.map((b) => [b.id, b]));
    const alive = new Set<string>();
    for (const b of state.buildings) {
      const def = byId.get(b.buildingId);
      const count = def ? HERDS[styleOf(def)] ?? 0 : 0;
      if (!count || buildingStatus(b, state, defs, now).kind !== 'operating') continue;
      alive.add(b.uid);
      if (this.herds.has(b.uid)) continue;
      const c = tileCenter(this.world, b.x, b.z);
      const home = new Vector3(c.x, 0, c.z);
      const herd: Animal[] = [];
      for (let i = 0; i < count; i++) {
        const root = new TransformNode(`animal-${b.uid}-${i}`, this.scene);
        const start = this.around(home);
        root.position.copyFrom(start);
        herd.push({ root, home, target: this.around(home), rest: Math.random() * 3, phase: Math.random() * 6 });
        void this.library.spawn(KINDS[(i + b.x) % KINDS.length], { footprint: this.world.settings.tileSize * SIZE }).then(({ root: model, meshes }) => {
          if (root.isDisposed()) return model.dispose();
          model.parent = root;
          for (const m of meshes) this.shadows?.addShadowCaster(m);
        });
      }
      this.herds.set(b.uid, herd);
    }
    for (const [uid, herd] of this.herds) {
      if (alive.has(uid)) continue;
      for (const a of herd) a.root.dispose();
      this.herds.delete(uid);
    }
  }

  /** نقطة عشوائية حول الحظيرة / A random spot around the barn */
  private around(home: Vector3): Vector3 {
    const a = Math.random() * Math.PI * 2;
    const r = (0.25 + Math.random() * (ROAM - 0.25)) * this.world.settings.tileSize;
    return new Vector3(home.x + Math.cos(a) * r, 0, home.z + Math.sin(a) * r);
  }

  /** مشي ثم رعي ثم مشي / Walk, then graze, then walk again */
  private step(dt: number): void {
    const s = this.world.settings.tileSize;
    for (const herd of this.herds.values()) {
      for (const a of herd) {
        a.phase += dt;
        const p = a.root.position;
        if (a.rest > 0) {
          a.rest -= dt;
          p.y = Math.max(0, sampleHeight(this.world, p.x, p.z));
          continue;
        }
        const to = a.target.subtract(p);
        to.y = 0;
        const dist = to.length();
        const stride = dt * SPEED * s;
        if (dist <= stride) {
          a.rest = 2 + Math.random() * 5;
          a.target = this.around(a.home);
          continue;
        }
        p.addInPlace(to.scale(stride / dist));
        // خطوة خفيفة صعودًا ونزولًا أثناء المشي / A slight bob while walking
        p.y = Math.max(0, sampleHeight(this.world, p.x, p.z)) + Math.abs(Math.sin(a.phase * 7)) * s * 0.006;
        a.root.rotation.y = Math.atan2(to.x, to.z);
      }
    }
  }
}
