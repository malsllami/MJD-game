// مسؤولية الملف: رسم أسوار القرية وبواباتها التي يبنيها اللاعب على حواف المربعات، بطراز يتطور مع مستوى الحكم — أوتاد خشبية،
// ثم سياج أعلى بأبراج مراقبة، ثم سور حجري بأبراج؛ وعند كل بوابة موقدا نار يضيئان المنطقة ليلًا، يصبحان أعمدة إنارة في العصر الحجري.
// يُرسم بنسخ رقيقة من شكل واحد لكل نوع فيبقى خفيفًا
// البوابة على ضلعين متجاورين رئيسية بفتحة واسعة وموقدين، وعلى ضلع واحد صغيرة بفتحة أضيق وفانوس.
// File responsibility: draws the village walls and gates the player builds on tile edges, in a look that evolves with the government
// level — wooden stakes, then a taller palisade with watchtowers, then a stone wall with towers; and at every gate two fire braziers
// that light the area at night, becoming lamp posts in the stone era. A gate on two adjacent edges is a main gate with a wide opening
// and two braziers; on one edge it is a small gate with a narrower opening and a lantern. Drawn as thin instances so it stays light

import {
  Color3, Matrix, Mesh, MeshBuilder, PointLight, Quaternion, StandardMaterial, Texture, TransformNode, Vector3, type Scene, type ShadowGenerator,
} from '@babylonjs/core';
import { edgeCorners, isUnderConstruction, tileKey } from '../core/economy';
import type { BuildingDef, GameState, WallStyle, World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';
import { TILE_METRES } from '../assets/village-kit';
import type { NightLights } from './day-night';

/** مقاسات كل طراز بالمتر / Each style's measurements in metres */
const STYLES: Record<WallStyle, { spacing: number; height: number; width: number; tower: number }> = {
  stakes: { spacing: 0.9, height: 1.5, width: 0.2, tower: 0 },
  palisade: { spacing: 0.34, height: 2.8, width: 0.32, tower: 5.6 },
  stone: { spacing: 2, height: 3.2, width: 0.9, tower: 6.4 },
};
/** نصف عرض فتحة البوابة الرئيسية والصغيرة بالمتر / Half the main and the small gate opening in metres */
const GATE_HALF = 2.2;
const SMALL_GATE_HALF = 1.2;
/** الأبراج على الزوايا كل هذا العدد من الأضلاع على الأقل / Towers on corners at least this many edges apart */
const TOWER_EVERY = 3;
/** لون اللهب وضوء المصباح ليلًا / The flame colour and the lamp light at night */
const FIRE = new Color3(1, 0.52, 0.16);
const LAMP = new Color3(1, 0.84, 0.5);
/** مدى ضوء البوابة بالمربعات / The gate light's reach in tiles */
const GATE_LIGHT_TILES = 2.6;

interface Segment {
  a: Vector3;
  b: Vector3;
}

export class VillageWall {
  private root: TransformNode | null = null;
  private signature = '';
  private readonly metre: number;
  private readonly lamps: PointLight[] = [];
  private night = 0;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly defs: Map<string, BuildingDef>,
    lights: NightLights,
    private readonly shadows: ShadowGenerator | null,
  ) {
    this.metre = world.settings.tileSize / TILE_METRES;
    lights.add(this.material('flame'), FIRE);
    lights.add(this.material('lantern'), LAMP);
    lights.watch((level) => {
      this.night = level;
      for (const l of this.lamps) l.intensity = 1.6 * level;
    });
  }

  /** يعيد الرسم عند تغيّر الأسوار المكتملة أو الطراز / Redraws when the finished walls or the style change */
  sync(state: GameState, now: number, style: WallStyle | null): void {
    const look = style ?? 'stakes';
    const built = state.walls.filter((w) => !isUnderConstruction(w, now));
    const model = (id: string) => this.defs.get(id)?.model;
    const walls = built.filter((w) => model(w.buildingId) === 'wall').map((w) => w.edge).sort();
    const gates = built.filter((w) => model(w.buildingId) === 'gate').map((w) => w.edge).sort();
    const signature = `${look}|${walls.join(';')}|${gates.join(';')}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.root?.dispose();
    for (const l of this.lamps) l.dispose();
    this.lamps.length = 0;
    this.root = null;
    if (!walls.length && !gates.length) return;
    this.root = new TransformNode('village-wall', this.scene);
    const openings = gateOpenings(gates);
    this.drawWall(look, this.segments([...walls, ...gates], openings.map((o) => ({ at: this.point(o.x, o.z), half: o.main ? GATE_HALF : SMALL_GATE_HALF }))));
    if (STYLES[look].tower) this.drawTowers(look, walls);
    for (const o of openings) this.drawGate(look, o);
  }

  /** نقطة على الشبكة (قد تكون كسرية) فوق سطح الأرض / A grid point (possibly fractional) on the ground surface */
  private point(cx: number, cz: number): Vector3 {
    const { tileSize } = this.world.settings;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const x = cx * tileSize - halfX;
    const z = cz * tileSize - halfZ;
    return new Vector3(x, Math.max(0, sampleHeight(this.world, x, z)), z);
  }

  /** الأضلاع مقطوعة حول فتحات البوابات / The edges cut around the gate openings */
  private segments(edges: string[], gates: { at: Vector3; half: number }[]): Segment[] {
    const out: Segment[] = [];
    for (const edge of edges) {
      const [[ax, az], [bx, bz]] = edgeCorners(edge);
      const a = this.point(ax, az);
      const b = this.point(bx, bz);
      const length = Vector3.Distance(a, b);
      // مواضع الفتحات على الضلع (من 0 إلى طوله) / Opening positions along the edge (0 to its length)
      const cuts = gates
        .filter((g) => Math.abs(Vector3.Cross(b.subtract(a), g.at.subtract(a)).length()) < 1e-3 * length * length)
        .map((g) => ({ t: Vector3.Dot(g.at.subtract(a), b.subtract(a)) / length, gap: g.half * this.metre }))
        .filter((c) => c.t > -c.gap && c.t < length + c.gap)
        .sort((p, q) => p.t - q.t);
      let from = 0;
      for (const { t, gap } of cuts) {
        if (t - gap > from) out.push({ a: Vector3.Lerp(a, b, from / length), b: Vector3.Lerp(a, b, (t - gap) / length) });
        from = Math.max(from, t + gap);
      }
      if (from < length) out.push({ a: Vector3.Lerp(a, b, from / length), b });
    }
    return out;
  }

  /** جسم السور: أوتاد أو جذوع متلاصقة أو كتل حجرية بشرفات على طول كل قطعة / The wall body: stakes, close logs or stone blocks with merlons */
  private drawWall(style: WallStyle, segments: Segment[]): void {
    const m = this.metre;
    const spec = STYLES[style];
    const matrices: Matrix[] = [];
    const rails: Matrix[] = [];
    for (const { a, b } of segments) {
      const length = Vector3.Distance(a, b);
      if (length < 0.05) continue;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const mid = Vector3.Lerp(a, b, 0.5);
      if (style === 'stone') {
        matrices.push(Matrix.Compose(new Vector3(spec.width * m, spec.height * m, length), Quaternion.FromEulerAngles(0, yaw, 0), mid.add(new Vector3(0, (spec.height * m) / 2, 0))));
        const merlons = Math.max(1, Math.floor(length / (1.5 * m)));
        for (let i = 0; i < merlons; i++) {
          const p = Vector3.Lerp(a, b, (i + 0.5) / merlons);
          rails.push(Matrix.Compose(new Vector3(spec.width * m * 1.1, 0.6 * m, 0.7 * m), Quaternion.FromEulerAngles(0, yaw, 0), p.add(new Vector3(0, (spec.height + 0.3) * m, 0))));
        }
        continue;
      }
      const count = Math.max(1, Math.round(length / (spec.spacing * m)));
      for (let i = 0; i < count; i++) {
        const p = Vector3.Lerp(a, b, (i + 0.5) / count);
        // ارتفاع يتفاوت قليلًا حتى لا تبدو الأوتاد مصفوفة آليًا / Heights vary a little so the stakes never look machine-made
        const h = spec.height * m * (0.9 + 0.2 * (((i * 7919) % 13) / 13));
        matrices.push(Matrix.Compose(new Vector3(spec.width * m, h, spec.width * m), Quaternion.Identity(), p.add(new Vector3(0, h / 2, 0))));
      }
      for (const level of style === 'stakes' ? [0.35, 0.75] : [0.6]) {
        rails.push(Matrix.Compose(new Vector3(0.1 * m, 0.12 * m, length), Quaternion.FromEulerAngles(0, yaw, 0), mid.add(new Vector3(0, spec.height * m * level, 0))));
      }
    }
    const body = this.material(style === 'stone' ? 'stone' : 'wood');
    this.instances(style === 'stone' ? MeshBuilder.CreateBox('wall-block', { size: 1 }, this.scene) : MeshBuilder.CreateCylinder('wall-stake', { height: 1, diameter: 1, tessellation: 6 }, this.scene), body, matrices);
    this.instances(MeshBuilder.CreateBox('wall-rail', { size: 1 }, this.scene), style === 'stone' ? body : this.material('dark-wood'), rails);
  }

  /** أبراج على زوايا السور: منصة خشبية بسقف، أو برج حجري / Towers on wall corners: a timber platform with a roof, or a stone tower */
  private drawTowers(style: WallStyle, edges: string[]): void {
    const m = this.metre;
    const spec = STYLES[style];
    const picked: string[] = [];
    for (const c of turningCorners(edges)) {
      const [x, z] = c.split(',').map(Number);
      if (picked.some((p) => {
        const [px, pz] = p.split(',').map(Number);
        return Math.max(Math.abs(px - x), Math.abs(pz - z)) < TOWER_EVERY;
      })) continue;
      picked.push(c);
    }
    const bodies: Matrix[] = [];
    const roofs: Matrix[] = [];
    for (const c of picked) {
      const [x, z] = c.split(',').map(Number);
      const p = this.point(x, z);
      const w = (style === 'stone' ? 2.4 : 2) * m;
      bodies.push(Matrix.Compose(new Vector3(w, spec.tower * m, w), Quaternion.Identity(), p.add(new Vector3(0, (spec.tower * m) / 2, 0))));
      roofs.push(Matrix.Compose(new Vector3(w * 1.5, 1.8 * m, w * 1.5), Quaternion.Identity(), p.add(new Vector3(0, spec.tower * m + 0.9 * m, 0))));
    }
    this.instances(MeshBuilder.CreateBox('tower', { size: 1 }, this.scene), this.material(style === 'stone' ? 'stone' : 'wood'), bodies);
    this.instances(MeshBuilder.CreateCylinder('tower-roof', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 4 }, this.scene), this.material('roof'), roofs);
  }

  /**
   * البوابة: عمودان أعلى من السور وعارضة فوقهما، وأمامها موقدا نار (أو عمودا إنارة في العصر الحجري) وضوء يضيء المكان ليلًا
   * The gate: two posts taller than the wall and a beam across, with two fire braziers before it (lamp posts in the stone era)
   * and a light that brightens the spot at night
   */
  private drawGate(style: WallStyle, opening: Opening): void {
    const m = this.metre;
    const spec = STYLES[style];
    const p = this.point(opening.x, opening.z);
    const dir = opening.horizontal ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
    const out = opening.horizontal ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
    const half = opening.main ? GATE_HALF : SMALL_GATE_HALF;
    const height = (spec.height + (opening.main ? 1.4 : 0.6)) * m;
    const post = (style === 'stone' ? (opening.main ? 1.4 : 0.9) : 0.5) * m;
    const parts: Matrix[] = [];
    for (const side of [-1, 1]) {
      const at = p.add(dir.scale(side * (half + 0.3) * m));
      parts.push(Matrix.Compose(new Vector3(post, height, post), Quaternion.Identity(), at.add(new Vector3(0, height / 2, 0))));
    }
    const beamSize = opening.horizontal ? new Vector3((half * 2 + 1.4) * m, 0.5 * m, post) : new Vector3(post, 0.5 * m, (half * 2 + 1.4) * m);
    parts.push(Matrix.Compose(beamSize, Quaternion.Identity(), p.add(new Vector3(0, height - 0.25 * m, 0))));
    this.instances(MeshBuilder.CreateBox('gate', { size: 1 }, this.scene), this.material(style === 'stone' ? 'stone' : 'dark-wood'), parts);

    // الرئيسية: موقدان على جانبي المدخل من الجهتين؛ والصغيرة: فانوس واحد على عمودها / Main: braziers beside the entrance on both faces; small: one lantern on its post
    const stands: Matrix[] = [];
    const glows: Matrix[] = [];
    if (!opening.main) {
      const at = p.add(dir.scale((half + 0.3) * m)).add(out.scale(0.45 * m));
      glows.push(Matrix.Compose(new Vector3(0.4 * m, 0.5 * m, 0.4 * m), Quaternion.Identity(), at.add(new Vector3(0, height * 0.72, 0))));
      this.instances(MeshBuilder.CreateBox('lantern', { size: 1 }, this.scene), this.material('lantern'), glows, false);
      return;
    }
    const lamps = style === 'stone';
    for (const side of [-1, 1]) {
      for (const face of [-1, 1]) {
        const at = p.add(dir.scale(side * (half + 1.6) * m)).add(out.scale(face * 1.6 * m));
        if (lamps) {
          // عمود إنارة بفانوس في أعلاه / A lamp post with a lantern on top
          stands.push(Matrix.Compose(new Vector3(0.18 * m, 3.4 * m, 0.18 * m), Quaternion.Identity(), at.add(new Vector3(0, 1.7 * m, 0))));
          glows.push(Matrix.Compose(new Vector3(0.55 * m, 0.7 * m, 0.55 * m), Quaternion.Identity(), at.add(new Vector3(0, 3.6 * m, 0))));
        } else {
          // قاعدة حجرية ووعاء نار ولهب / A stone base, a fire bowl and a flame
          stands.push(Matrix.Compose(new Vector3(0.9 * m, 1.1 * m, 0.9 * m), Quaternion.Identity(), at.add(new Vector3(0, 0.55 * m, 0))));
          glows.push(Matrix.Compose(new Vector3(0.75 * m, 1.3 * m, 0.75 * m), Quaternion.Identity(), at.add(new Vector3(0, 1.7 * m, 0))));
        }
      }
    }
    this.instances(lamps ? MeshBuilder.CreateCylinder('lamp-post', { height: 1, diameter: 1, tessellation: 8 }, this.scene)
      : MeshBuilder.CreateCylinder('brazier', { height: 1, diameterTop: 1.2, diameterBottom: 0.8, tessellation: 10 }, this.scene), this.material(lamps ? 'iron' : 'stone'), stands);
    this.instances(lamps ? MeshBuilder.CreateBox('lantern', { size: 1 }, this.scene)
      : MeshBuilder.CreateCylinder('flame', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 8 }, this.scene), this.material(lamps ? 'lantern' : 'flame'), glows, false);
    const light = new PointLight('gate-light', p.add(new Vector3(0, 2.6 * m, 0)), this.scene);
    light.diffuse = lamps ? LAMP : FIRE;
    light.specular = Color3.Black();
    light.range = GATE_LIGHT_TILES * this.world.settings.tileSize;
    light.intensity = 1.6 * this.night;
    this.lamps.push(light);
  }

  /** شكل واحد بنسخ رقيقة كثيرة / One shape drawn as many thin instances */
  private instances(mesh: Mesh, material: StandardMaterial, matrices: Matrix[], castShadow = true): void {
    if (!matrices.length) {
      mesh.dispose();
      return;
    }
    mesh.parent = this.root;
    mesh.material = material;
    mesh.isPickable = false;
    const buffer = new Float32Array(matrices.length * 16);
    matrices.forEach((mx, i) => mx.copyToArray(buffer, i * 16));
    mesh.thinInstanceSetBuffer('matrix', buffer, 16, true);
    mesh.thinInstanceRefreshBoundingInfo();
    if (castShadow) this.shadows?.addShadowCaster(mesh);
  }

  /** مواد السور المشتركة / The wall's shared materials */
  private material(kind: 'wood' | 'dark-wood' | 'stone' | 'roof' | 'iron' | 'flame' | 'lantern'): StandardMaterial {
    const name = `village-wall-${kind}`;
    const existing = this.scene.getMaterialByName(name) as StandardMaterial | null;
    if (existing) return existing;
    const m = new StandardMaterial(name, this.scene);
    m.specularColor = new Color3(0.03, 0.03, 0.03);
    const colours = {
      wood: new Color3(0.47, 0.33, 0.2), 'dark-wood': new Color3(0.32, 0.22, 0.13), roof: new Color3(0.42, 0.24, 0.16),
      iron: new Color3(0.16, 0.16, 0.17), flame: new Color3(0.95, 0.45, 0.12), lantern: new Color3(0.92, 0.86, 0.66), stone: Color3.White(),
    };
    m.diffuseColor = colours[kind];
    if (kind === 'stone') m.diffuseTexture = new Texture(`${import.meta.env.BASE_URL}models/village/textures/T_UnevenBrick_BaseColor.jpg`, this.scene, false, false);
    return m;
  }
}

/** فتحة بوابة: مركزها على الشبكة واتجاه السور عندها / A gate opening: its grid centre and the wall's direction there */
interface Opening {
  x: number;
  z: number;
  horizontal: boolean;
  /** رئيسية (ضلعان فأكثر) أو صغيرة (ضلع واحد) / Main (two edges or more) or small (one edge) */
  main: boolean;
}

/**
 * فتحات البوابات: كل سلسلة أضلاع بوابة متجاورة على خط واحد بوابة واحدة في منتصفها (فضلعا البوابة عند نهاية طريق تتوسطهما زاويته)
 * Gate openings: each run of adjacent gate edges on one line is a single gate at its middle (so two gate edges at a road's end centre on its corner)
 */
export function gateOpenings(gates: string[]): Opening[] {
  const left = new Set(gates);
  const out: Opening[] = [];
  for (const start of gates) {
    if (!left.has(start)) continue;
    const horizontal = start[0] === 'h';
    const [, rest] = start.split(':');
    const [sx, sz] = rest.split(',').map(Number);
    // السلسلة تمتد على طول الخط في الاتجاهين / The run extends along the line both ways
    let lo = horizontal ? sx : sz;
    let hi = lo;
    const key = (i: number) => (horizontal ? `h:${i},${sz}` : `v:${sx},${i}`);
    while (left.has(key(lo - 1))) lo--;
    while (left.has(key(hi + 1))) hi++;
    for (let i = lo; i <= hi; i++) left.delete(key(i));
    const mid = (lo + hi + 1) / 2;
    const main = hi > lo;
    out.push(horizontal ? { x: mid, z: sz, horizontal, main } : { x: sx, z: mid, horizontal, main });
  }
  return out;
}

/** زوايا السور التي يتغير عندها اتجاهه / Wall corners where its direction turns */
function turningCorners(edges: string[]): string[] {
  const dirs = new Map<string, Set<string>>();
  for (const e of edges) {
    for (const [x, z] of edgeCorners(e)) {
      const k = tileKey(x, z);
      dirs.set(k, (dirs.get(k) ?? new Set()).add(e[0]));
    }
  }
  return [...dirs].filter(([, d]) => d.size > 1).map(([k]) => k).sort();
}
