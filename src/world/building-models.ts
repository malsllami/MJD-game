// مسؤولية الملف: مجسمات المباني حسب عمود "النموذج" وعصر الدولة — موقع إنشاء تظهر فيه القطع بخاماتها من الأساس حتى السقف داخل سقالة خشبية،
// ثم المبنى المكتمل، ويُعاد تشكيله عند تغير العصر
// File responsibility: building models by the "model" column and the nation's era — a construction site where the real pieces appear from
// the foundations up to the roof inside a timber scaffold, then the finished building, reshaped when the era changes
//
// الطرق تُرسم في road-network وليس هنا. / Roads are drawn by road-network, not here.

import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Texture, TransformNode, Vector3, type AbstractMesh, type Material, type PBRMaterial, type ShadowGenerator } from '@babylonjs/core';
import { looksFor, styleOf, type Era, type Look } from '../assets/catalog';
import { FLAG_POLE, ROOF_MATERIAL, WATER_SURFACE, roofTexture, type RoofColor } from '../assets/village-kit';
import type { ModelLibrary } from '../assets/model-library';
import { isRoad, isUnderConstruction } from '../core/economy';
import type { BuildingDef, GameState, PlacedBuilding, World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';

/** حصة أول الإنشاء التي لا يظهر فيها إلا الأساس والسقالة / The opening share of construction showing only the site and scaffold */
const SITE_SHARE = 0.1;

interface Model {
  root: TransformNode;
  meshes: AbstractMesh[];
  /** تقدم الإنشاء الذي تظهر عنده كل قطعة: الأدنى أولًا والسقف أخيرًا / The construction progress at which each piece appears: lowest first, roof last */
  reveal: Map<AbstractMesh, number>;
  /** السقالة أثناء الإنشاء / The scaffold during construction */
  scaffold: Mesh | null;
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
      if (p.path === FLAG_POLE) {
        const flag = flagPole(scene, p.fit ?? 5);
        flag.parent = kit;
        flag.position.set(p.x, 0, p.z);
        all.push(flag);
        return;
      }
      try {
        const { root, meshes } = await library.spawn(p.path, { footprint: p.fit, yaw: p.yaw });
        root.parent = kit;
        root.position.set(p.x, p.y ?? 0, p.z);
        if (p.roof) for (const m of meshes) if (m.material?.name === ROOF_MATERIAL) m.material = roofMaterial(scene, m.material as PBRMaterial, p.roof);
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

/** مادة قرميد بلون بديل، مشتركة بين كل الأسقف بنفس اللون / A roof-tile material in an alternate colour, shared by every roof of that colour */
function roofMaterial(scene: Scene, base: PBRMaterial, color: RoofColor): Material {
  const name = `${ROOF_MATERIAL}-${color}`;
  const existing = scene.getMaterialByName(name);
  if (existing) return existing;
  const m = base.clone(name);
  // خامات glTF لا تُقلب رأسيًا / glTF textures are not flipped vertically
  m.albedoTexture = new Texture(`${import.meta.env.BASE_URL}models/${roofTexture(color)}`, scene, false, false);
  return m;
}

/** مادة لون واحد مشتركة بالاسم / A shared single-colour material by name */
function plainMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const existing = scene.getMaterialByName(name) as StandardMaterial | null;
  if (existing) return existing;
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  return m;
}

/** سارية خشبية بعلم أخضر في أعلاها، بطول height متر / A timber pole with a green flag at its top, height metres tall */
function flagPole(scene: Scene, height: number): Mesh {
  const pole = MeshBuilder.CreateCylinder('flag-pole', { height, diameter: 0.14, tessellation: 8 }, scene);
  pole.position.y = height / 2;
  pole.material = plainMaterial(scene, 'flag-wood', new Color3(0.36, 0.25, 0.15));
  const cloth = MeshBuilder.CreatePlane('flag-cloth', { width: 1.8, height: 1.1, sideOrientation: Mesh.DOUBLESIDE }, scene);
  cloth.position.set(0.95, height - 0.65, 0);
  cloth.material = plainMaterial(scene, 'flag-cloth', new Color3(0.18, 0.42, 0.2));
  return Mesh.MergeMeshes([pole, cloth], true, true, undefined, false, true)!;
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

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly library: ModelLibrary,
    private readonly defs: Map<string, BuildingDef>,
    private readonly shadows: ShadowGenerator | null,
    private readonly onCreate: (mesh: AbstractMesh, placed: PlacedBuilding) => void,
    private readonly onRemove: (mesh: AbstractMesh) => void,
  ) {}

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
      model.scaffold?.position.copyFrom(model.root.position);
      if (!model.meshes.length || model.done) continue;
      if (!isUnderConstruction(placed, now)) this.finish(model);
      else this.progress(model, (now - placed.startedAt) / Math.max(1, placed.completesAt - placed.startedAt));
    }
    for (const [uid, model] of this.models) if (!alive.has(uid)) this.remove(uid, model);
  }

  private remove(uid: string, model: Model): void {
    for (const m of model.meshes) this.onRemove(m);
    model.scaffold?.dispose();
    model.root.dispose();
    this.models.delete(uid);
  }

  private create(placed: PlacedBuilding, def: BuildingDef, state: GameState, era: Era): Model {
    const root = new TransformNode(`b-${placed.uid}`, this.scene);
    root.rotation.y = this.facing(placed, state);
    const model: Model = { root, meshes: [], reveal: new Map(), scaffold: null, done: false, era };
    this.models.set(placed.uid, model);
    void spawnParts(this.library, this.scene, root, partsFor(styleOf(def), placed.uid, era), this.world.settings.tileSize).then((meshes) => {
      if (root.isDisposed()) return;
      model.meshes = meshes;
      for (const m of meshes) {
        m.isPickable = true;
        this.shadows?.addShadowCaster(m);
        this.onCreate(m, placed);
      }
      this.planConstruction(model);
      // حتى التحديث التالي: المبنى تحت الإنشاء يبدأ موقعًا فارغًا / Until the next sync, a building under construction starts as a bare site
      if (isUnderConstruction(placed, Date.now())) this.progress(model, 0);
    });
    return model;
  }

  /**
   * ترتيب ظهور القطع حسب ارتفاع قاعدتها (الأرضيات والجدران ثم الطابق الثاني ثم السقف)، وسقالة تحيط بالمبنى
   * Orders the pieces by the height of their base (floors and walls, then upstairs, then the roof), with a scaffold around the building
   */
  private planConstruction(model: Model): void {
    model.root.computeWorldMatrix(true);
    const base = model.root.position.y;
    const bounds = model.meshes.map((m) => {
      m.computeWorldMatrix(true);
      return m.getBoundingInfo().boundingBox;
    });
    const order = model.meshes.map((m, i) => ({ m, y: bounds[i].minimumWorld.y - base, i })).sort((a, b) => a.y - b.y || a.i - b.i);
    order.forEach(({ m }, rank) => model.reveal.set(m, SITE_SHARE + (1 - SITE_SHARE) * 0.95 * (rank / Math.max(1, order.length - 1))));
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const b of bounds) {
      min.minimizeInPlace(b.minimumWorld);
      max.maximizeInPlace(b.maximumWorld);
    }
    model.scaffold = this.buildScaffold(model.root, min, max);
  }

  /** أعمدة خشبية حول المبنى وألواح أفقية على مستويين، بقياس المبنى نفسه / Timber poles around the building and planks at two levels, sized to the building */
  private buildScaffold(root: TransformNode, min: Vector3, max: Vector3): Mesh | null {
    const s = this.world.settings.tileSize;
    const height = max.y - root.position.y;
    if (!isFinite(height) || height < s * 0.08) return null;
    // حدود المبنى في العالم محاذية للمحاور، فتُرسم السقالة بلا دوران الجذر / World bounds are axis-aligned, so the scaffold ignores the root's rotation
    const pad = s * 0.03;
    const x0 = min.x - pad - root.position.x;
    const x1 = max.x + pad - root.position.x;
    const z0 = min.z - pad - root.position.z;
    const z1 = max.z + pad - root.position.z;
    const thick = s * 0.012;
    const parts: Mesh[] = [];
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, z1], [(x0 + x1) / 2, z0]]) {
      const pole = MeshBuilder.CreateBox('scaffold-pole', { width: thick, depth: thick, height: height * 0.92 }, this.scene);
      pole.position.set(x, height * 0.46, z);
      parts.push(pole);
    }
    for (const level of [0.3, 0.62]) {
      for (const [x, z, w, d] of [[(x0 + x1) / 2, z0, x1 - x0, thick], [(x0 + x1) / 2, z1, x1 - x0, thick], [x0, (z0 + z1) / 2, thick, z1 - z0], [x1, (z0 + z1) / 2, thick, z1 - z0]]) {
        const plank = MeshBuilder.CreateBox('scaffold-plank', { width: w, depth: d, height: thick * 0.8 }, this.scene);
        plank.position.set(x, height * level, z);
        parts.push(plank);
      }
    }
    const scaffold = Mesh.MergeMeshes(parts, true, true)!;
    scaffold.material = plainMaterial(this.scene, 'scaffold-wood', new Color3(0.5, 0.36, 0.22));
    scaffold.isPickable = false;
    scaffold.position.copyFrom(root.position);
    this.shadows?.addShadowCaster(scaffold);
    return scaffold;
  }

  /** إظهار القطع التي بلغها الإنشاء / Show the pieces construction has reached */
  private progress(model: Model, t: number): void {
    for (const m of model.meshes) m.setEnabled(t >= (model.reveal.get(m) ?? 0));
  }

  /** المبنى المكتمل: كل القطع ظاهرة وتُزال السقالة / The finished building: every piece shown and the scaffold removed */
  private finish(model: Model): void {
    model.done = true;
    for (const m of model.meshes) m.setEnabled(true);
    model.scaffold?.dispose();
    model.scaffold = null;
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
