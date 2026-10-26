// مسؤولية الملف: الحياة في الدولة — عمال يتحركون في المباني العاملة (مزارعون، حطابون، حدادون، تجار، رعاة)،
// ومارة يحملون البضائع على الطرق المتصلة؛ كل ذلك من حالة الدولة الحقيقية ولا أثر له على الاقتصاد
// File responsibility: life in the nation — workers moving at operating buildings (farmers, woodcutters, smiths, traders,
// herders) and passers-by carrying goods on connected roads; all from the real nation state, with no economic effect

import { LoadAssetContainerAsync, PBRMaterial, TransformNode, Vector3, type AbstractMesh, type AnimationGroup, type AssetContainer, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { buildingStatus, connectedRoads, edgeCorners, tileKey } from '../core/economy';
import type { GameDefinitions, GameState, World } from '../core/types';
import { sampleHeight, tileCenter, worldHalfExtents } from '../core/world-gen';

const MODEL = `${import.meta.env.BASE_URL}models/people/worker.glb`;
/** طول الشخص بالنسبة لضلع المربع (أكبر قليلًا من الواقع ليُرى من الكاميرا الاستراتيجية) / Person height vs tile side (a bit larger than life to read from the strategy camera) */
const HEIGHT_PER_TILE = 0.2;
/** سرعة المشي بالمربعات في الثانية / Walking speed in tiles per second */
const WALK_SPEED = 0.32;
/** سكان لكل مارّ على الطرق / Residents per passer-by on the roads */
const RESIDENTS_PER_WALKER = 3;
/** بعد ظهور الناس عن مركز الكاميرا بالمربعات / How far from the camera centre people show, in tiles */
const VIEW_TILES = 26;

/** مهنة ظاهرة: حركاتها ولون ملابسها / A visible trade: its animations and clothing colour */
type Role = 'farmer' | 'woodcutter' | 'smith' | 'miner' | 'trader' | 'herder' | 'walker';
const ROLES: Record<Role, { anims: string[]; color: [number, number, number] }> = {
  farmer: { anims: ['Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering'], color: [0.7, 0.56, 0.3] },
  woodcutter: { anims: ['TreeChopping_Loop'], color: [0.55, 0.26, 0.16] },
  smith: { anims: ['TreeChopping_Loop'], color: [0.22, 0.22, 0.25] },
  miner: { anims: ['TreeChopping_Loop'], color: [0.45, 0.42, 0.38] },
  trader: { anims: ['Idle_FoldArms_Loop'], color: [0.24, 0.36, 0.62] },
  herder: { anims: ['Farm_Watering'], color: [0.38, 0.5, 0.3] },
  walker: { anims: ['Walk_Carry_Loop'], color: [0.6, 0.5, 0.42] },
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
  private container: AssetContainer | null = null;
  private readonly actors: Actor[] = [];
  private links = new Map<string, string[]>();
  private readonly materials = new Map<Role, PBRMaterial[]>();

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly max: number,
    private readonly shadows: ShadowGenerator | null,
  ) {
    void LoadAssetContainerAsync(MODEL, scene).then((c) => {
      for (const m of c.materials) if (m instanceof PBRMaterial) { m.metallic = 0; m.roughness = 0.85; }
      this.container = c;
    }).catch((err) => console.warn('تعذّر تحميل الشخصيات', err));
    scene.onBeforeRenderObservable.add(() => this.step(scene.getEngine().getDeltaTime() / 1000));
  }

  /**
   * مطابقة الناس مع الحالة: عمال للمباني العاملة القريبة من الكاميرا، ومارة على الطرق المتصلة بقدر السكان
   * Match people to the state: workers at operating buildings near the camera, passers-by on connected roads by population
   */
  sync(state: GameState, defs: GameDefinitions, now: number, focus: { x: number; z: number }): void {
    if (!this.container) return;
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
      const actor = this.actors.find((a) => !a.job) ?? this.spawn();
      if (!actor) break;
      this.assign(actor, job, corners);
    }
  }

  /** شخصية جديدة من القالب، حتى الحد الأقصى / A new character from the template, up to the max */
  private spawn(): Actor | null {
    if (!this.container || this.actors.length >= this.max) return null;
    const entries = this.container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
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
    const groups = new Map(entries.animationGroups.map((g) => [g.name.replace(/^Clone of /, ''), g]));
    for (const g of groups.values()) g.stop();
    const actor: Actor = { root, meshes, groups, playing: '', job: null, spot: Vector3.Zero(), next: null, timer: 0, from: '', to: '', t: 0 };
    root.setEnabled(false);
    this.actors.push(actor);
    return actor;
  }

  private release(actor: Actor): void {
    actor.job = null;
    actor.root.setEnabled(false);
    this.play(actor, '');
  }

  private assign(actor: Actor, job: Job, corners: string[]): void {
    actor.job = job;
    for (const m of actor.meshes) {
      // لون الملابس حسب المهنة (المادة الرئيسية فقط) / Clothing colour by trade (main material only)
      if (m.material?.name.startsWith('M_Main')) m.material = this.roleMaterial(job.role, m.material as PBRMaterial);
    }
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

  /** مادة ملابس المهنة، تُنشأ مرة لكل مهنة / The trade's clothing material, created once per trade */
  private roleMaterial(role: Role, base: PBRMaterial): PBRMaterial {
    let list = this.materials.get(role);
    if (!list) {
      list = [0, 1, 2].map((i) => {
        const m = base.clone(`M_Main-${role}-${i}`) as PBRMaterial;
        const [r, g, b] = ROLES[role].color;
        const shade = 0.85 + i * 0.12;
        m.albedoColor.set(r * shade, g * shade, b * shade);
        return m;
      });
      this.materials.set(role, list);
    }
    return list[Math.floor(Math.random() * list.length)];
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
