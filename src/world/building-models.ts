// مسؤولية الملف: مجسمات المباني حسب عمود "النموذج" وعصر الدولة — سقالة ترتفع أثناء الإنشاء ثم المبنى المكتمل، ويُعاد تشكيله عند تغير العصر
// File responsibility: building models by the "model" column and the nation's era — a rising scaffold, then the finished building, reshaped when the era changes
//
// الطرق تُرسم في road-network وليس هنا. / Roads are drawn by road-network, not here.

import { Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, type AbstractMesh, type Material, type ShadowGenerator } from '@babylonjs/core';
import { looksFor, styleOf, type Era, type Look } from '../assets/catalog';
import { WATER_SURFACE } from '../assets/village-kit';
import type { ModelLibrary } from '../assets/model-library';
import { isRoad, isUnderConstruction } from '../core/economy';
import type { BuildingDef, GameState, PlacedBuilding, World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';

interface Model {
  root: TransformNode;
  meshes: AbstractMesh[];
  /** المادة الأصلية لكل جزء، تعود عند اكتمال البناء / Each part's original material, restored on completion */
  original: Map<AbstractMesh, Material | null>;
  done: boolean;
  era: Era;
}

/**
 * يُنشئ شكل المبنى تحت عقدة أم: قطع مضبوطة على المربع، أو مبنى مجمّع بالمتر يُصغَّر كله ليناسب المربع
 * Spawns a look under a parent: tile-fitted parts, or a metre-based assembly scaled as a whole to fit the tile
 */
export async function spawnParts(library: ModelLibrary, scene: Scene, parent: TransformNode, look: Look, tileSize: number): Promise<AbstractMesh[]> {
  if (!Array.isArray(look)) {
    const kit = new TransformNode('kit', scene);
    kit.parent = parent;
    kit.scaling.setAll((look.size * tileSize) / look.extent);
    const all: AbstractMesh[] = [];
    await Promise.all(look.pieces.map(async (p) => {
      if (p.path === WATER_SURFACE) {
        // قرص ماء بقطر fit متر / A water disc of fit metres
        const disc = MeshBuilder.CreateDisc('water', { radius: (p.fit ?? 4) / 2, tessellation: 28 }, scene);
        disc.rotation.x = Math.PI / 2;
        disc.parent = kit;
        disc.position.set(p.x, 0.06, p.z);
        disc.material = waterMaterial(scene);
        all.push(disc);
        return;
      }
      try {
        const { root, meshes } = await library.spawn(p.path, { footprint: p.fit, yaw: p.yaw });
        root.parent = kit;
        root.position.set(p.x, p.y ?? 0, p.z);
        all.push(...meshes);
      } catch (err) {
        console.warn('تعذّر تحميل القطعة', p.path, err);
      }
    }));
    return all;
  }
  const parts = look;
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

/** مادة ماء مشتركة للبحيرات والجداول / A shared water material for lakes and streams */
export function waterMaterial(scene: Scene): StandardMaterial {
  const existing = scene.getMaterialByName('built-water') as StandardMaterial | null;
  if (existing) return existing;
  const m = new StandardMaterial('built-water', scene);
  m.diffuseColor = new Color3(0.18, 0.42, 0.55);
  m.specularColor = new Color3(0.6, 0.7, 0.75);
  m.specularPower = 64;
  m.alpha = 0.88;
  return m;
}

/** شكل ثابت لكل مبنى من بدائل نمطه في العصر / A stable look per building from its style's variants in the era */
export function partsFor(style: string, uid: string, era: Era): Look {
  const variants = looksFor(style, era);
  return variants[hash(uid) % variants.length];
}

export class BuildingModels {
  private readonly models = new Map<string, Model>();
  private readonly scaffold: StandardMaterial;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly library: ModelLibrary,
    private readonly defs: Map<string, BuildingDef>,
    private readonly shadows: ShadowGenerator | null,
    private readonly onCreate: (mesh: AbstractMesh, placed: PlacedBuilding) => void,
    private readonly onRemove: (mesh: AbstractMesh) => void,
  ) {
    this.scaffold = new StandardMaterial('scaffold', scene);
    this.scaffold.diffuseColor = new Color3(0.86, 0.68, 0.36);
    this.scaffold.emissiveColor = new Color3(0.2, 0.13, 0.04);
    this.scaffold.wireframe = true;
  }

  /** مطابقة المجسمات مع الحالة وتحديث تقدم الإنشاء / Match models to state and update construction progress */
  sync(state: GameState, now: number, era: Era): void {
    const alive = new Set<string>();
    for (const placed of state.buildings) {
      const def = this.defs.get(placed.buildingId);
      if (!def || isRoad(def)) continue;
      alive.add(placed.uid);
      let model = this.models.get(placed.uid);
      // تغيّر العصر يعيد تشكيل المبنى بشكل عصره الجديد / An era change reshapes the building into its new era's look
      if (model && model.era !== era) {
        this.remove(placed.uid, model);
        model = undefined;
      }
      if (!model) model = this.create(placed, def, state, era);
      // النقل يحرك المجسم إلى مربعه الجديد / A move shifts the model to its new tile
      const c = tileCenter(this.world, placed.x, placed.z);
      model.root.position.set(c.x, Math.max(0, sampleHeight(this.world, c.x, c.z)), c.z);
      const building = isUnderConstruction(placed, now);
      const progress = building ? (now - placed.startedAt) / Math.max(1, placed.completesAt - placed.startedAt) : 1;
      model.root.scaling.y = 0.12 + 0.88 * Math.min(1, Math.max(0, progress));
      if (!building && !model.done && model.meshes.length) this.finish(model);
    }
    for (const [uid, model] of this.models) if (!alive.has(uid)) this.remove(uid, model);
  }

  private remove(uid: string, model: Model): void {
    for (const m of model.meshes) this.onRemove(m);
    model.root.dispose();
    this.models.delete(uid);
  }

  private create(placed: PlacedBuilding, def: BuildingDef, state: GameState, era: Era): Model {
    const root = new TransformNode(`b-${placed.uid}`, this.scene);
    root.rotation.y = this.facing(placed, state);
    const model: Model = { root, meshes: [], original: new Map(), done: false, era };
    this.models.set(placed.uid, model);
    void spawnParts(this.library, this.scene, root, partsFor(styleOf(def), placed.uid, era), this.world.settings.tileSize).then((meshes) => {
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

  /** إظهار المبنى المكتمل بألوانه وظلاله / Reveal the finished building with its colours and shadows */
  private finish(model: Model): void {
    model.done = true;
    for (const m of model.meshes) {
      m.material = model.original.get(m) ?? null;
      this.shadows?.addShadowCaster(m);
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
