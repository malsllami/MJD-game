// مسؤولية الملف: الحياة في الدولة — عمال يعملون في المباني العاملة بعدد عمالها الحقيقي (مزارعون، حطابون، حدادون، منقبون، تجار،
// رعاة، أمناء مخازن)، وحمّالون ينقلون إنتاج كل مبنى على الطرق إلى مخزنه، ومارة على الطرق المتصلة؛ كل ذلك من حالة الدولة
// الحقيقية ولا أثر له على الاقتصاد
// File responsibility: life in the nation — workers at operating buildings in their real staff numbers (farmers, woodcutters,
// smiths, miners, traders, herders, storekeepers), carriers taking each building's output along the roads to its store, and
// passers-by on connected roads; all from the real nation state, with no economic effect

import {
  Color3, LoadAssetContainerAsync, Texture, TransformNode, Vector3,
  type AbstractMesh, type AnimationGroup, type AssetContainer, type Material, type Node, type PBRMaterial, type Scene, type ShadowGenerator,
} from '@babylonjs/core';
import { styleOf } from '../assets/catalog';
import { buildingStatus, connectedRoads, edgeCorners, staffingAt, tileKey } from '../core/economy';
import type { BuildingDef, GameDefinitions, GameState, World } from '../core/types';
import { sampleHeight, tileCenter, worldHalfExtents } from '../core/world-gen';

const PEOPLE = `${import.meta.env.BASE_URL}models/people/`;
/** مكتبة الحركات: هيكل بلا مجسم، تُربط حركاته بكل شخصية بأسماء العظام / The motion library: a meshless skeleton whose motions bind to each character by bone name */
const ANIMATIONS = `${PEOPLE}animations.glb`;
/** الصندوق الذي يحمله الحمّال / The crate a carrier holds */
const CRATE = `${import.meta.env.BASE_URL}models/village/Prop_Crate.glb`;
/** طول الشخص بالنسبة لضلع المربع (أكبر قليلًا من الواقع ليُرى من الكاميرا الاستراتيجية) / Person height vs tile side (a bit larger than life to read from the strategy camera) */
const HEIGHT_PER_TILE = 0.2;
/** سرعة المشي بالمربعات في الثانية / Walking speed in tiles per second */
const WALK_SPEED = 0.32;
/** سكان لكل مارّ على الطرق / Residents per passer-by on the roads */
const RESIDENTS_PER_WALKER = 2;
/** بعد ظهور الناس عن مركز الكاميرا بالمربعات / How far from the camera centre people show, in tiles */
const VIEW_TILES = 26;
/** أقصى عمال ظاهرين في المبنى الواحد / Most workers shown at one building */
const MAX_SHOWN_PER_BUILDING = 4;
/** حصص الناس الظاهرين: العمال أولًا ثم الحمّالون، والباقي مارة / Shares of shown people: workers first, then carriers, the rest passers-by */
const WORKER_SHARE = 0.55;
const CARRIER_SHARE = 0.25;
/** توقف الحمّال عند طرفي رحلته بالثواني / A carrier's pause at either end of the trip, in seconds */
const CARRIER_PAUSE = 2.5;

/** مظهر شخصية: ملف ملابسها، ومادة الملابس، وخامات ألوانها البديلة / A character look: its outfit file, outfit material and alternate colour textures */
type Look = 'male_peasant' | 'female_peasant' | 'male_ranger' | 'female_ranger';
const LOOKS: Record<Look, { outfit: string; colors: string[] }> = {
  male_peasant: { outfit: 'M_Peasant', colors: ['T_Peasant_2_BaseColor'] },
  female_peasant: { outfit: 'M_Peasant', colors: ['T_Peasant_2_BaseColor'] },
  male_ranger: { outfit: 'M_Ranger', colors: ['T_Ranger_3_BaseColor'] },
  female_ranger: { outfit: 'M_Ranger', colors: ['T_Ranger_3_BaseColor'] },
};

/** ألوان شعر طبيعية تُضرب في خامة الشعر الرمادية / Natural hair colours multiplied into the grey hair texture */
const HAIR_COLORS = ['#2a1d14', '#3d2a1c', '#5a3b22', '#1a1512', '#6b3a20'];

/** مهنة ظاهرة: حركاتها ومظاهر من يعمل بها / A visible trade: its animations and the looks of those who work it */
type Role = 'farmer' | 'woodcutter' | 'smith' | 'miner' | 'trader' | 'herder' | 'storekeeper' | 'carrier' | 'walker';
const WALK = 'Walk_Carry_Loop';
const ROLES: Record<Role, { anims: string[]; looks: Look[] }> = {
  farmer: { anims: ['Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering'], looks: ['male_peasant', 'female_peasant'] },
  woodcutter: { anims: ['TreeChopping_Loop'], looks: ['male_peasant'] },
  // الحداد يطرق ثم يفتح صندوق أدواته / The smith hammers, then opens his tool chest
  smith: { anims: ['TreeChopping_Loop', 'Chest_Open'], looks: ['male_peasant'] },
  // المنقب يضرب الصخر ثم ينحني يجمع الحجارة / The miner strikes the rock, then kneels to gather stones
  miner: { anims: ['TreeChopping_Loop', 'Farm_PlantSeed'], looks: ['male_peasant'] },
  // التاجر يعرض بضاعته ويساوم ويتذوق / The trader shows his goods, haggles and tastes
  trader: { anims: ['Idle_FoldArms_Loop', 'Yes', 'Consume'], looks: ['male_ranger', 'female_ranger'] },
  herder: { anims: ['Farm_Watering', 'Yes'], looks: ['male_ranger', 'female_peasant'] },
  storekeeper: { anims: ['Chest_Open', 'Idle_FoldArms_Loop'], looks: ['male_ranger', 'female_peasant'] },
  carrier: { anims: [WALK], looks: ['male_peasant', 'female_peasant'] },
  walker: { anims: [WALK], looks: ['male_peasant', 'female_peasant', 'male_ranger', 'female_ranger'] },
};

/**
 * عمل كل نمط مبنى: المهنة، والعدد الظاهر حين لا يحتاج المبنى عمالًا في الشيت، ومكان العمل:
 * داخل المربع للأماكن المفتوحة (حقل، محجر، سوق)، أو حوله للمباني ذات الجدران
 * Work per building style: the trade, the count shown when the sheet gives the building no workers, and where the work happens:
 * inside the tile for open places (field, quarry, market), or around it for walled buildings
 */
const JOBS: Record<string, { role: Role; count: number; area: 'inside' | 'around' }> = {
  field: { role: 'farmer', count: 2, area: 'inside' },
  sawmill: { role: 'woodcutter', count: 1, area: 'around' },
  industry: { role: 'woodcutter', count: 1, area: 'around' },
  smithy: { role: 'smith', count: 1, area: 'around' },
  quarry: { role: 'miner', count: 2, area: 'inside' },
  'oil-rig': { role: 'miner', count: 1, area: 'around' },
  market: { role: 'trader', count: 2, area: 'inside' },
  barn: { role: 'herder', count: 1, area: 'around' },
  'storage-farm': { role: 'storekeeper', count: 1, area: 'around' },
  'storage-materials': { role: 'storekeeper', count: 1, area: 'around' },
  bank: { role: 'storekeeper', count: 1, area: 'around' },
};

/** عمل ظاهر: في مبنى، أو نقل بين مبنى ومخزنه، أو مشي على الطرق / A visible job: at a building, carrying between a building and its store, or walking the roads */
interface Job {
  id: string;
  role: Role;
  x: number;
  z: number;
  area?: 'inside' | 'around';
  /** للحمّال: زوايا الطريق من المبنى إلى المخزن / Carrier: the road corners from the building to the store */
  route?: string[];
}

interface Actor {
  look: Look;
  root: TransformNode;
  meshes: AbstractMesh[];
  groups: Map<string, AnimationGroup>;
  playing: string;
  job: Job | null;
  /** للعامل: نقطة عمله الحالية ومدة بقائه؛ للمار: الزاويتان وتقدمه بينهما / Worker: current spot and dwell; walker: two corners and progress */
  spot: Vector3;
  next: Vector3 | null;
  timer: number;
  from: string;
  to: string;
  t: number;
  /** للحمّال: موضعه على مساره واتجاهه وصندوقه / Carrier: position along the route, direction and crate */
  leg: number;
  loaded: boolean;
  crate: TransformNode | null;
}

/** بُعد البحث عن غابة حول معسكر الحطابين بالمربعات / How far around a lumber camp to look for forest, in tiles */
const FOREST_REACH = 5;

/** أقرب مربع غابة حول المبنى، أو null / The nearest forest tile around the building, or null */
function nearestForest(b: { x: number; z: number }, forest: (x: number, z: number) => boolean): { x: number; z: number } | null {
  for (let r = 1; r <= FOREST_REACH; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) === r && forest(b.x + dx, b.z + dz)) return { x: b.x + dx, z: b.z + dz };
      }
    }
  }
  return null;
}

/** مربعات مجمع الحكم؛ يصله الحمّال عند أي زاوية من محيطه / The compound's tiles; a carrier reaches it at any corner around it */
function compoundTiles(state: GameState): { x: number; z: number }[] {
  const r = state.settlement.radius ?? 0;
  const out: { x: number; z: number }[] = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) out.push({ x: state.settlement.x + dx, z: state.settlement.z + dz });
  return out;
}

export class People {
  private motions: AssetContainer | null = null;
  private crate: AssetContainer | null = null;
  private readonly looks = new Map<Look, AssetContainer>();
  /** مواد الملابس لكل مظهر: الأصلية ثم البديلة / Outfit materials per look: the original, then the alternates */
  private readonly outfits = new Map<Look, Material[]>();
  private readonly hair = new Map<string, Material>();
  private readonly actors: Actor[] = [];
  private links = new Map<string, string[]>();

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly max: number,
    private readonly shadows: ShadowGenerator | null,
  ) {
    const looks = Object.keys(LOOKS) as Look[];
    void Promise.all([LoadAssetContainerAsync(ANIMATIONS, scene), LoadAssetContainerAsync(CRATE, scene), ...looks.map((l) => LoadAssetContainerAsync(`${PEOPLE}${l}.glb`, scene))])
      .then(([motions, crate, ...containers]) => {
        containers.forEach((c, i) => {
          const look = looks[i];
          this.looks.set(look, c);
          const base = c.materials.find((m) => m.name === LOOKS[look].outfit) as PBRMaterial | undefined;
          if (!base) return;
          // خامات glTF لا تُقلب رأسيًا / glTF textures are not flipped vertically
          this.outfits.set(look, [base, ...LOOKS[look].colors.map((t) => {
            const m = base.clone(`${base.name}-${t}`);
            m.albedoTexture = new Texture(`${PEOPLE}textures/${t}.jpg`, scene, false, false);
            return m;
          })]);
        });
        this.crate = crate;
        this.motions = motions;
      })
      .catch((err) => console.warn('تعذّر تحميل الشخصيات', err));
    scene.onBeforeRenderObservable.add(() => this.step(scene.getEngine().getDeltaTime() / 1000));
  }

  /**
   * مطابقة الناس مع الحالة: عمال للمباني العاملة القريبة من الكاميرا بقدر عمالها، وحمّالون لإنتاجها، ومارة على الطرق بقدر السكان
   * Match people to the state: workers at operating buildings near the camera by their staff, carriers for their output,
   * and passers-by on the roads by population
   */
  sync(state: GameState, defs: GameDefinitions, now: number, focus: { x: number; z: number }, forest: (x: number, z: number) => boolean = () => false): void {
    if (!this.motions) return;
    const byId = new Map(defs.buildings.map((b) => [b.id, b]));
    const near = (x: number, z: number) => Math.hypot(x - focus.x, z - focus.z) <= VIEW_TILES;
    const byDistance = (a: Job, b: Job) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z);

    // الطرق المتصلة بمبنى الحكم شبكة المشي والنقل / Roads connected to the government building are the walking and hauling network
    const links = new Map<string, string[]>();
    for (const edge of connectedRoads(state, now)) {
      const [a, b] = edgeCorners(edge).map(([x, z]) => tileKey(x, z));
      links.set(a, [...(links.get(a) ?? []), b]);
      links.set(b, [...(links.get(b) ?? []), a]);
    }
    this.links = links;

    const crew = staffingAt(state, defs, now);
    const operating = state.buildings.filter((b) => buildingStatus(b, state, defs, now).kind === 'operating');
    const work: Job[] = [];
    const hauls: Job[] = [];
    for (const b of operating) {
      const def = byId.get(b.buildingId);
      if (!def || !near(b.x, b.z)) continue;
      const job = JOBS[styleOf(def)];
      if (job) {
        // عدد العمال الظاهر هو عدد عمال المبنى الحقيقي / The shown workers are the building's real staff
        const staff = def.workers > 0 && def.profession ? (crew.get(b.uid)?.assigned ?? 0) : job.count;
        // الحطاب يقطع في أقرب غابة خارج الحدود إن وُجدت قريبة / A woodcutter chops in the nearest forest past the border when one is close
        const woods = job.role === 'woodcutter' ? nearestForest(b, forest) : null;
        for (let i = 0; i < Math.min(MAX_SHOWN_PER_BUILDING, staff); i++) {
          const at = woods && i % 2 === 0 ? woods : b;
          work.push({ id: `${b.uid}:${i}`, role: job.role, x: at.x, z: at.z, area: at === b ? job.area : 'inside' });
        }
      }
      const route = this.haulRoute(b, def, operating, byId, state);
      if (route) hauls.push({ id: `carry:${b.uid}`, role: 'carrier', x: b.x, z: b.z, route });
    }
    // قطع الغابة: ثلاثة حطابين في وسط كل قطعة جارية / Forest clearing: three woodcutters in the middle of each running parcel
    for (const c of state.clearings ?? []) {
      if (now >= c.completesAt) continue;
      const [x, z] = c.tiles[Math.floor(c.tiles.length / 2)].split(',').map(Number);
      if (!near(x, z)) continue;
      for (let i = 0; i < 3; i++) work.push({ id: `clear:${c.uid}:${i}`, role: 'woodcutter', x, z, area: 'inside' });
    }
    work.sort(byDistance);
    hauls.sort(byDistance);

    const corners = [...links.keys()].filter((k) => {
      const [x, z] = k.split(',').map(Number);
      return near(x, z);
    });
    const wanted = work.slice(0, Math.ceil(this.max * WORKER_SHARE));
    wanted.push(...hauls.slice(0, Math.floor(this.max * CARRIER_SHARE)));
    const walkers = corners.length ? Math.min(this.max - wanted.length, Math.floor(state.population / RESIDENTS_PER_WALKER)) : 0;
    for (let i = 0; i < walkers; i++) wanted.push({ id: `walk:${i}`, role: 'walker', x: 0, z: 0 });

    // من فقد عمله يتحرر، ثم توزّع الأعمال الجديدة على المتاحين / Those who lost their job are freed, then new jobs go to free actors
    const ids = new Set(wanted.map((j) => j.id));
    for (const a of this.actors) if (a.job && !ids.has(a.job.id)) this.release(a);
    const taken = new Set(this.actors.filter((a) => a.job).map((a) => a.job!.id));
    for (const job of wanted) {
      if (taken.has(job.id)) continue;
      const looks = ROLES[job.role].looks;
      const look = looks[Math.floor(Math.random() * looks.length)];
      const actor = this.actors.find((a) => !a.job && a.look === look) ?? this.spawn(look);
      if (!actor) break;
      this.assign(actor, job, corners);
    }
  }

  /**
   * مسار نقل الإنتاج: من زاوية طريق عند المبنى المنتج إلى أقرب مخزن عامل يخزن ما ينتجه، أو إلى مبنى الحكم إن لم يوجد
   * The hauling route: from a road corner at the producing building to the nearest operating store holding its output,
   * or to the government building when there is none
   */
  private haulRoute(b: { x: number; z: number; uid: string }, def: BuildingDef, operating: GameState['buildings'], byId: Map<string, BuildingDef>, state: GameState): string[] | null {
    const outputs = Object.keys(def.production).filter((id) => def.production[id] > 0);
    if (!outputs.length || Object.keys(def.storage).length) return null;
    const stores = operating.filter((s) => s.uid !== b.uid && outputs.some((id) => (byId.get(s.buildingId)?.storage[id] ?? 0) > 0));
    const store = stores.sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z))[0];
    return this.roadPath(b, store ? [store] : compoundTiles(state));
  }

  /** أقصر مسار على الطرق من زوايا مربع إلى زوايا أي مربع من الهدف (بحث بالعرض) / The shortest road path from a tile's corners to any target tile's corners (breadth-first) */
  private roadPath(from: { x: number; z: number }, to: { x: number; z: number }[]): string[] | null {
    const cornersOf = (t: { x: number; z: number }) => [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => tileKey(t.x + dx, t.z + dz)).filter((k) => this.links.has(k));
    const goals = new Set(to.flatMap(cornersOf));
    const starts = cornersOf(from);
    if (!goals.size || !starts.length) return null;
    const previous = new Map<string, string | null>(starts.map((k) => [k, null]));
    const queue = [...starts];
    while (queue.length) {
      const at = queue.shift()!;
      if (goals.has(at)) {
        const path = [at];
        for (let p = previous.get(at); p; p = previous.get(p)) path.unshift(p);
        return path.length > 1 ? path : null;
      }
      for (const next of this.links.get(at) ?? []) {
        if (previous.has(next)) continue;
        previous.set(next, at);
        queue.push(next);
      }
    }
    return null;
  }

  /**
   * شخصية جديدة بالمظهر المطلوب؛ عند بلوغ الحد يُستبدل بها شخص متفرغ بمظهر آخر
   * A new character with the wanted look; at the limit it replaces a free person of another look
   */
  private spawn(look: Look): Actor | null {
    const container = this.looks.get(look);
    if (!container || !this.motions) return null;
    if (this.actors.length >= this.max) {
      const idle = this.actors.findIndex((a) => !a.job);
      if (idle < 0) return null;
      const [old] = this.actors.splice(idle, 1);
      for (const g of old.groups.values()) g.dispose();
      old.root.dispose();
    }
    const entries = container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
    // عقدة أم للموضع والاتجاه، فيبقى تصحيح اتجاه glTF في عقدته كما هو / A parent for position and heading, so glTF's own orientation fix stays intact
    const root = new TransformNode('person', this.scene);
    const model = entries.rootNodes[0] as TransformNode;
    model.parent = root;
    root.scaling.setAll((this.world.settings.tileSize * HEIGHT_PER_TILE) / 1.83);
    const meshes = model.getChildMeshes(false);
    for (const m of meshes) {
      m.isPickable = false;
      this.shadows?.addShadowCaster(m);
    }
    // ربط حركات المكتبة بعظام هذه الشخصية بالاسم (الهيكل واحد في كل الحزم) / Bind the library motions to this character's bones by name (one skeleton across the kits)
    const bones = new Map(model.getDescendants(false).map((n) => [n.name, n]));
    const groups = new Map(this.motions.animationGroups.map((g) => [g.name, g.clone(g.name, (target: Node) => bones.get(target.name) ?? target)]));
    for (const g of groups.values()) g.stop();
    // لون ملابس عشوائي من ألوان المظهر / A random outfit colour from the look's colours
    const colors = this.outfits.get(look) ?? [];
    const outfit = colors[Math.floor(Math.random() * colors.length)];
    for (const m of meshes) if (outfit && m.material?.name === LOOKS[look].outfit) m.material = outfit;
    // خامة الشعر رمادية تُلوَّن، ولون واحد للشعر والحاجبين / The hair texture is grey and tinted, one colour for hair and brows
    const hair = Math.floor(Math.random() * HAIR_COLORS.length);
    for (const m of meshes) if (m.material?.name.startsWith('M_Hair')) m.material = this.hairMaterial(m.material as PBRMaterial, hair);
    const actor: Actor = {
      look, root, meshes, groups, playing: '', job: null, spot: Vector3.Zero(), next: null, timer: 0, from: '', to: '', t: 0, leg: 0, loaded: true, crate: null,
    };
    root.setEnabled(false);
    this.actors.push(actor);
    return actor;
  }

  /** مادة شعر بلون معيّن، تُنشأ مرة لكل مادة ولون / A hair material in one colour, created once per material and colour */
  private hairMaterial(base: PBRMaterial, color: number): Material {
    const key = `${base.uniqueId}:${color}`;
    let m = this.hair.get(key);
    if (!m) {
      const tinted = base.clone(`${base.name}-${color}`);
      tinted.albedoColor = Color3.FromHexString(HAIR_COLORS[color]);
      this.hair.set(key, tinted);
      m = tinted;
    }
    return m;
  }

  /** صندوق بين يدي الشخص بوحدات المتر (الشخص متجه نحو +z) / A crate in the person's hands in metres (the person faces +z) */
  private holdCrate(actor: Actor): void {
    if (actor.crate || !this.crate) return;
    const crate = this.crate.instantiateModelsToScene((n) => n, false).rootNodes[0] as TransformNode;
    crate.parent = actor.root;
    // ضرب المقياس لا استبداله، حتى يبقى تصحيح اتجاه glTF / Multiply the scale rather than replace it, keeping glTF's handedness fix
    crate.scaling.scaleInPlace(0.38);
    crate.position.set(0, 0.92, 0.34);
    for (const m of crate.getChildMeshes(false)) {
      m.isPickable = false;
      this.shadows?.addShadowCaster(m);
    }
    actor.crate = crate;
  }

  private release(actor: Actor): void {
    actor.job = null;
    actor.root.setEnabled(false);
    actor.crate?.dispose();
    actor.crate = null;
    this.play(actor, '');
  }

  private assign(actor: Actor, job: Job, corners: string[]): void {
    actor.job = job;
    if (job.role === 'walker') {
      actor.from = corners[Math.floor(Math.random() * corners.length)];
      actor.to = this.pickCorner(actor.from, null);
      actor.t = Math.random();
    } else if (job.role === 'carrier') {
      // يبدأ في موضع عشوائي من رحلته حتى لا يتحرك كل الحمّالين معًا / Starts at a random point of the trip so carriers never move in step
      actor.leg = Math.random() * (job.route!.length - 1);
      actor.loaded = Math.random() < 0.5;
      actor.timer = 0;
      this.holdCrate(actor);
      actor.crate?.setEnabled(actor.loaded);
    } else {
      actor.spot = this.spotIn(job);
      actor.next = null;
      actor.timer = 2 + Math.random() * 5;
      this.place(actor, actor.spot, this.towardBuilding(job, actor.spot));
    }
    actor.root.setEnabled(true);
    this.play(actor, job.role === 'walker' || job.role === 'carrier' ? WALK : this.workAnim(job));
  }

  private workAnim(job: Job): string {
    const anims = ROLES[job.role].anims;
    return anims[Math.floor(Math.random() * anims.length)];
  }

  private play(actor: Actor, name: string): void {
    if (actor.playing === name) return;
    actor.groups.get(actor.playing)?.stop();
    actor.playing = name;
    const g = actor.groups.get(name);
    if (g) g.start(true, 0.9 + Math.random() * 0.2);
  }

  /**
   * نقطة عمل: داخل المربع للأماكن المفتوحة، أو على حلقة خارج جدران المبنى للمباني المغلقة
   * A work spot: inside the tile for open places, or on a ring outside the walls for closed buildings
   */
  private spotIn(job: Job): Vector3 {
    const c = tileCenter(this.world, job.x, job.z);
    const s = this.world.settings.tileSize;
    if (job.area === 'around') {
      const angle = Math.random() * Math.PI * 2;
      const r = s * (0.36 + Math.random() * 0.08);
      return new Vector3(c.x + Math.cos(angle) * r, 0, c.z + Math.sin(angle) * r);
    }
    return new Vector3(c.x + (Math.random() - 0.5) * s * 0.6, 0, c.z + (Math.random() - 0.5) * s * 0.6);
  }

  /** من يعمل حول المبنى يواجهه / Those working around a building face it */
  private towardBuilding(job: Job, at: Vector3): Vector3 | undefined {
    if (job.area !== 'around') return undefined;
    const c = tileCenter(this.world, job.x, job.z);
    return new Vector3(c.x - at.x, 0, c.z - at.z);
  }

  private place(actor: Actor, p: Vector3, facing?: Vector3): void {
    actor.root.position.set(p.x, Math.max(0, sampleHeight(this.world, p.x, p.z)), p.z);
    if (facing && facing.lengthSquared() > 1e-6) actor.root.rotation.y = Math.atan2(facing.x, facing.z);
  }

  private pickCorner(from: string, previous: string | null): string {
    const options = this.links.get(from) ?? [];
    const forward = options.filter((k) => k !== previous);
    const list = forward.length ? forward : options;
    return list.length ? list[Math.floor(Math.random() * list.length)] : from;
  }

  private corner(key: string): Vector3 {
    const [x, z] = key.split(',').map(Number);
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const s = this.world.settings.tileSize;
    return new Vector3(x * s - halfX, 0, z * s - halfZ);
  }

  /** الموضع على جانب الطريق بين زاويتين / The roadside position between two corners */
  private roadside(a: Vector3, b: Vector3, t: number): { at: Vector3; dir: Vector3 } {
    const dir = b.subtract(a);
    const side = dir.lengthSquared() > 0 ? new Vector3(dir.z, 0, -dir.x).normalize().scale(this.world.settings.tileSize * 0.07) : Vector3.Zero();
    return { at: Vector3.Lerp(a, b, t).add(side), dir };
  }

  /** حركة كل الناس في الإطار / Every person's movement this frame */
  private step(dt: number): void {
    const s = this.world.settings.tileSize;
    for (const actor of this.actors) {
      const job = actor.job;
      if (!job) continue;
      if (job.role === 'walker') {
        if (!this.links.has(actor.from)) continue;
        actor.t += dt * WALK_SPEED;
        while (actor.t >= 1) {
          actor.t -= 1;
          const previous = actor.from;
          actor.from = actor.to;
          actor.to = this.pickCorner(actor.from, previous);
        }
        const { at, dir } = this.roadside(this.corner(actor.from), this.corner(actor.to), actor.t);
        this.place(actor, at, dir);
        continue;
      }
      if (job.role === 'carrier') {
        this.haul(actor, job.route!, dt);
        continue;
      }
      // العامل يعمل في نقطة ثم ينتقل مشيًا إلى نقطة أخرى في نفس المبنى / A worker works at a spot, then walks to another in the same building
      if (actor.next) {
        const to = actor.next.subtract(actor.root.position);
        to.y = 0;
        const dist = to.length();
        const stride = dt * WALK_SPEED * s * 0.5;
        if (dist <= stride) {
          actor.spot = actor.next;
          actor.next = null;
          actor.timer = 4 + Math.random() * 6;
          this.place(actor, actor.spot, this.towardBuilding(job, actor.spot));
          this.play(actor, this.workAnim(job));
        } else {
          this.place(actor, actor.root.position.add(to.scale(stride / dist)), to);
        }
        continue;
      }
      actor.timer -= dt;
      if (actor.timer <= 0) {
        actor.next = this.spotIn(job);
        this.play(actor, WALK);
      }
    }
  }

  /**
   * الحمّال يمشي بالصندوق من المبنى إلى المخزن، يفرغه ويعود فارغ اليدين، ثم يكرر
   * The carrier walks the crate from the building to the store, unloads, walks back empty-handed, and repeats
   */
  private haul(actor: Actor, route: string[], dt: number): void {
    const last = route.length - 1;
    if (actor.timer > 0) {
      actor.timer -= dt;
      if (actor.timer > 0) return;
      actor.loaded = !actor.loaded;
      actor.crate?.setEnabled(actor.loaded);
      this.play(actor, WALK);
    }
    // محمّلًا يتقدم نحو المخزن، وفارغًا يعود نحو المبنى / Loaded it heads for the store, empty it returns to the building
    actor.leg = Math.min(last, Math.max(0, actor.leg + (actor.loaded ? 1 : -1) * dt * WALK_SPEED));
    const arrived = actor.loaded ? actor.leg >= last : actor.leg <= 0;
    const i = Math.min(last - 1, Math.floor(actor.leg));
    const a = this.corner(route[i]);
    const b = this.corner(route[i + 1]);
    const { at, dir } = this.roadside(a, b, actor.leg - i);
    this.place(actor, at, actor.loaded ? dir : dir.scale(-1));
    if (arrived) {
      actor.timer = CARRIER_PAUSE;
      this.play(actor, 'Chest_Open');
    }
  }
}
