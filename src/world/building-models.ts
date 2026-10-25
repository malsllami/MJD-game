// مسؤولية الملف: مجسمات المباني من نماذج Kenney حسب عمود "النموذج" — سقالة ترتفع أثناء الإنشاء ثم المبنى المكتمل
// File responsibility: building models from Kenney assets by the "model" column — a rising scaffold, then the finished building
//
// الطرق تُرسم في road-network وليس هنا. / Roads are drawn by road-network, not here.

import { Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, type AbstractMesh, type Material, type ShadowGenerator } from '@babylonjs/core';
import { STYLE_MODELS, type ModelPart } from '../assets/catalog';
import type { ModelLibrary } from '../assets/model-library';
import { isRoad, isUnderConstruction } from '../core/economy';
import type { BuildingDef, GameState, PlacedBuilding, World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';
import { WINDOW_LIGHT, type Glowing, type NightLights } from './day-night';

interface Model {
  root: TransformNode;
  meshes: AbstractMesh[];
  /** المادة الأصلية لكل جزء، تعود عند اكتمال البناء / Each part's original material, restored on completion */
  original: Map<AbstractMesh, Material | null>;
  done: boolean;
}

/**
 * يُنشئ قطع نموذج مركّب تحت عقدة أم؛ القطعة التي يتعذر تحميلها تُستبدل بصندوق بسيط
 * Spawns composite parts under a parent; a part that fails to load falls back to a plain box
 */
export async function spawnParts(library: ModelLibrary, scene: Scene, parent: TransformNode, parts: ModelPart[], tileSize: number): Promise<AbstractMesh[]> {
  const all: AbstractMesh[] = [];
  await Promise.all(parts.map(async (p) => {
    try {
      const { root, meshes } = await library.spawn(p.path, { footprint: p.size * tileSize, yaw: p.yaw });
      root.parent = parent;
      root.position.set((p.x ?? 0) * tileSize, 0, (p.z ?? 0) * tileSize);
      all.push(...meshes);
    } catch (err) {
      console.warn('تعذّر تحميل النموذج', p.path, err);
      const box = MeshBuilder.CreateBox('fallback', { size: p.size * tileSize * 0.8 }, scene);
      box.parent = parent;
      box.position.set((p.x ?? 0) * tileSize, p.size * tileSize * 0.4, (p.z ?? 0) * tileSize);
      all.push(box);
    }
  }));
  return all;
}

/** شكل ثابت لكل مبنى من بدائل نمطه / A stable look per building from its style's variants */
export function partsFor(style: string, uid: string): ModelPart[] {
  const variants = STYLE_MODELS[style] ?? STYLE_MODELS.civic;
  return variants[hash(uid) % variants.length];
}

export class BuildingModels {
  private readonly models = new Map<string, Model>();
  private readonly scaffold: StandardMaterial;
  private readonly lit = new Set<Material>();

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly library: ModelLibrary,
    private readonly defs: Map<string, BuildingDef>,
    private readonly shadows: ShadowGenerator | null,
    private readonly onCreate: (mesh: AbstractMesh, placed: PlacedBuilding) => void,
    private readonly onRemove: (mesh: AbstractMesh) => void,
    private readonly lights: NightLights,
  ) {
    this.scaffold = new StandardMaterial('scaffold', scene);
    this.scaffold.diffuseColor = new Color3(0.86, 0.68, 0.36);
    this.scaffold.emissiveColor = new Color3(0.2, 0.13, 0.04);
    this.scaffold.wireframe = true;
  }

  /** مطابقة المجسمات مع الحالة وتحديث تقدم الإنشاء / Match models to state and update construction progress */
  sync(state: GameState, now: number): void {
    const alive = new Set<string>();
    for (const placed of state.buildings) {
      const def = this.defs.get(placed.buildingId);
      if (!def || isRoad(def)) continue;
      alive.add(placed.uid);
      let model = this.models.get(placed.uid);
      if (!model) model = this.create(placed, def, state);
      // النقل يحرك المجسم إلى مربعه الجديد / A move shifts the model to its new tile
      const c = tileCenter(this.world, placed.x, placed.z);
      model.root.position.set(c.x, Math.max(0, sampleHeight(this.world, c.x, c.z)), c.z);
      const building = isUnderConstruction(placed, now);
      const progress = building ? (now - placed.startedAt) / Math.max(1, placed.completesAt - placed.startedAt) : 1;
      model.root.scaling.y = 0.12 + 0.88 * Math.min(1, Math.max(0, progress));
      if (!building && !model.done && model.meshes.length) this.finish(model);
    }
    for (const [uid, model] of this.models) {
      if (alive.has(uid)) continue;
      for (const m of model.meshes) this.onRemove(m);
      model.root.dispose();
      this.models.delete(uid);
    }
  }

  private create(placed: PlacedBuilding, def: BuildingDef, state: GameState): Model {
    const root = new TransformNode(`b-${placed.uid}`, this.scene);
    root.rotation.y = this.facing(placed, state);
    const model: Model = { root, meshes: [], original: new Map(), done: false };
    this.models.set(placed.uid, model);
    void spawnParts(this.library, this.scene, root, partsFor(def.model, placed.uid), this.world.settings.tileSize).then((meshes) => {
      if (root.isDisposed()) return;
      model.meshes = meshes;
      for (const m of meshes) {
        model.original.set(m, m.material);
        m.material = this.scaffold;
        m.isPickable = true;
        this.onCreate(m, placed);
      }
    });
    return model;
  }

  /** إظهار المبنى المكتمل بألوانه وظلاله وإنارته الليلية / Reveal the finished building with colours, shadows and night lights */
  private finish(model: Model): void {
    model.done = true;
    for (const m of model.meshes) {
      const mat = model.original.get(m) ?? null;
      m.material = mat;
      this.shadows?.addShadowCaster(m);
      if (mat && !this.lit.has(mat) && 'emissiveColor' in mat) {
        this.lit.add(mat);
        this.lights.add(mat as unknown as Glowing, WINDOW_LIGHT);
      }
    }
  }

  /** يتجه المبنى نحو أول ضلع من مربعه عليه طريق / The building faces the first side of its tile that holds a road */
  private facing(placed: PlacedBuilding, state: GameState): number {
    const roads = new Set(state.roads.map((r) => r.edge));
    const { x, z } = placed;
    const sides: [string, number][] = [[`h:${x},${z + 1}`, 0], [`v:${x + 1},${z}`, Math.PI / 2], [`h:${x},${z}`, Math.PI], [`v:${x},${z}`, -Math.PI / 2]];
    const hit = sides.find(([edge]) => roads.has(edge));
    return hit ? hit[1] : (hash(placed.uid) % 4) * (Math.PI / 2);
  }
}

/** رقم ثابت من نص / Stable number from text */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
