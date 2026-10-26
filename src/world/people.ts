// مسؤولية الملف: الحياة في الدولة — عمال يتحركون في المباني العاملة (مزارعون، حطابون، حدادون، تجار، رعاة)،
// ومارة يحملون البضائع على الطرق المتصلة؛ كل ذلك من حالة الدولة الحقيقية ولا أثر له على الاقتصاد
// File responsibility: life in the nation — workers moving at operating buildings (farmers, woodcutters, smiths, traders,
// herders) and passers-by carrying goods on connected roads; all from the real nation state, with no economic effect

import {
  Color3, LoadAssetContainerAsync, Texture, TransformNode, Vector3,
  type AbstractMesh, type AnimationGroup, type AssetContainer, type Material, type Node, type PBRMaterial, type Scene, type ShadowGenerator,
} from '@babylonjs/core';
import { buildingStatus, connectedRoads, edgeCorners, tileKey } from '../core/economy';
import type { GameDefinitions, GameState, World } from '../core/types';
import { sampleHeight, tileCenter, worldHalfExtents } from '../core/world-gen';

const PEOPLE = `${import.meta.env.BASE_URL}models/people/`;
/** مكتبة الحركات: هيكل بلا مجسم، تُربط حركاته بكل شخصية بأسماء العظام / The motion library: a meshless skeleton whose motions bind to each character by bone name */
const ANIMATIONS = `${PEOPLE}animations.glb`;
/** طول الشخص بالنسبة لضلع المربع (أكبر قليلًا من الواقع ليُرى من الكاميرا الاستراتيجية) / Person height vs tile side (a bit larger than life to read from the strategy camera) */
const HEIGHT_PER_TILE = 0.2;
/** سرعة المشي بالمربعات في الثانية / Walking speed in tiles per second */
const WALK_SPEED = 0.32;
/** سكان لكل مارّ على الطرق / Residents per passer-by on the roads */
const RESIDENTS_PER_WALKER = 3;
/** بعد ظهور الناس عن مركز الكاميرا بالمربعات / How far from the camera centre people show, in tiles */
const VIEW_TILES = 26;

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
type Role = 'farmer' | 'woodcutter' | 'smith' | 'miner' | 'trader' | 'herder' | 'walker';
const ROLES: Record<Role, { anims: string[]; looks: Look[] }> = {
  farmer: { anims: ['Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering'], looks: ['male_peasant', 'female_peasant'] },
  woodcutter: { anims: ['TreeChopping_Loop'], looks: ['male_peasant'] },
  smith: { anims: ['TreeChopping_Loop'], looks: ['male_peasant'] },
  miner: { anims: ['TreeChopping_Loop'], looks: ['male_peasant'] },
  trader: { anims: ['Idle_FoldArms_Loop'], looks: ['male_ranger', 'female_ranger'] },
  herder: { anims: ['Farm_Watering'], looks: ['male_ranger', 'female_peasant'] },
  walker: { anims: ['Walk_Carry_Loop'], looks: ['male_peasant', 'female_peasant', 'male_ranger', 'female_ranger'] },
};
const WALK = 'Walk_Carry_Loop';

/** عمال كل نمط مبنى عامل (عدد ظاهر بصريًا فقط حتى يأتي عمود العمال) / Workers per operating building style (visual only until a workers column exists) */
const JOBS: Record<string, { role: Role; count: number }> = {
  field: { role: 'farmer', count: 2 },
  sawmill: { role: 'woodcutter', count: 1 },
  industry: { role: 'woodcutter', count: 1 },
  smithy: { role: 'smith', count: 1 },
  quarry: { role: 'miner', count: 2 },
  'oil-rig': { role: 'miner', count: 1 },
  market: { role: 'trader', count: 2 },
  barn: { role: 'herder', count: 1 },
};

/** عمل ظاهر: في مبنى، أو مشي على الطرق / A visible job: at a building, or walking the roads */
interface Job {
  id: string;
  role: Role;
  x: number;
  z: number;
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
}

export class People {
  private motions: AssetContainer | null = null;
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
    void Promise.all([LoadAssetContainerAsync(ANIMATIONS, scene), ...looks.map((l) => LoadAssetContainerAsync(`${PEOPLE}${l}.glb`, scene))])
      .then(([motions, ...containers]) => {
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
        this.motions = motions;
      })
      .catch((err) => console.warn('تعذّر تحميل الشخصيات', err));
    scene.onBeforeRenderObservable.add(() => this.step(scene.getEngine().getDeltaTime() / 1000));
  }

  /**
   * مطابقة الناس مع الحالة: عمال للمباني العاملة القريبة من الكاميرا، ومارة على الطرق المتصلة بقدر السكان
   * Match people to the state: workers at operating buildings near the camera, passers-by on connected roads by population
   */
  sync(state: GameState, defs: GameDefinitions, now: number, focus: { x: number; z: number }): void {
    if (!this.motions) return;
    const byId = new Map(defs.buildings.map((b) => [b.id, b]));
    const near = (x: number, z: number) => Math.hypot(x - focus.x, z - focus.z) <= VIEW_TILES;
    const jobs: Job[] = [];
    for (const b of state.buildings) {
      const job = JOBS[byId.get(b.buildingId)?.model ?? ''];
      if (!job || !near(b.x, b.z) || buildingStatus(b, state, defs, now).kind !== 'operating') continue;
      for (let i = 0; i < job.count; i++) jobs.push({ id: `${b.uid}:${i}`, role: job.role, x: b.x, z: b.z });
    }
    jobs.sort((a, b) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z));

    // المارة على الطرق المتصلة بمبنى الحكم فقط / Passers-by only on roads connected to the government building
    const links = new Map<string, string[]>();
    for (const edge of connectedRoads(state, now)) {
      const [a, b] = edgeCorners(edge).map(([x, z]) => tileKey(x, z));
      links.set(a, [...(links.get(a) ?? []), b]);
      links.set(b, [...(links.get(b) ?? []), a]);
    }
    this.links = links;
    const corners = [...links.keys()].filter((k) => {
      const [x, z] = k.split(',').map(Number);
      return near(x, z);
    });
    const workers = jobs.slice(0, Math.ceil(this.max * 0.6));
    const walkers = corners.length ? Math.min(this.max - workers.length, Math.floor(state.population / RESIDENTS_PER_WALKER)) : 0;
    for (let i = 0; i < walkers; i++) workers.push({ id: `walk:${i}`, role: 'walker', x: 0, z: 0 });

    // من فقد عمله يتحرر، ثم توزّع الأعمال الجديدة على المتاحين / Those who lost their job are freed, then new jobs go to free actors
    const wanted = new Map(workers.map((j) => [j.id, j]));
    for (const a of this.actors) if (a.job && !wanted.has(a.job.id)) this.release(a);
    const taken = new Set(this.actors.filter((a) => a.job).map((a) => a.job!.id));
    for (const job of workers) {
      if (taken.has(job.id)) continue;
      const looks = ROLES[job.role].looks;
      const look = looks[Math.floor(Math.random() * looks.length)];
      const actor = this.actors.find((a) => !a.job && a.look === look) ?? this.spawn(look);
      if (!actor) break;
      this.assign(actor, job, corners);
    }
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
    const actor: Actor = { look, root, meshes, groups, playing: '', job: null, spot: Vector3.Zero(), next: null, timer: 0, from: '', to: '', t: 0 };
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

  private release(actor: Actor): void {
    actor.job = null;
    actor.root.setEnabled(false);
    this.play(actor, '');
  }

  private assign(actor: Actor, job: Job, corners: string[]): void {
    actor.job = job;
    if (job.role === 'walker') {
      actor.from = corners[Math.floor(Math.random() * corners.length)];
      actor.to = this.pickCorner(actor.from, null);
      actor.t = Math.random();
    } else {
      actor.spot = this.spotIn(job);
      actor.next = null;
      actor.timer = 2 + Math.random() * 5;
      this.place(actor, actor.spot);
    }
    actor.root.setEnabled(true);
    this.play(actor, job.role === 'walker' ? WALK : this.workAnim(job));
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

  /** نقطة عشوائية داخل مربع العمل / A random spot inside the work tile */
  private spotIn(job: Job): Vector3 {
    const c = tileCenter(this.world, job.x, job.z);
    const s = this.world.settings.tileSize;
    return new Vector3(c.x + (Math.random() - 0.5) * s * 0.6, 0, c.z + (Math.random() - 0.5) * s * 0.6);
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
        const a = this.corner(actor.from);
        const b = this.corner(actor.to);
        const dir = b.subtract(a);
        // المشي على جانب الطريق / Walking along the roadside
        const side = dir.lengthSquared() > 0 ? new Vector3(dir.z, 0, -dir.x).normalize().scale(s * 0.07) : Vector3.Zero();
        this.place(actor, Vector3.Lerp(a, b, actor.t).add(side), dir);
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
          this.place(actor, actor.spot);
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
}
