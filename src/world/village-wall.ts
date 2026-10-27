// مسؤولية الملف: سور القرية على حدود الدولة الخارجية يتبعها عند كل توسع — أوتاد خشبية، ثم سياج أعلى بأبراج مراقبة، ثم سور حجري
// بأبراج؛ وبوابة حيث يصل طريق إلى الحدود. يُرسم بنسخ رقيقة من شكل واحد لكل نوع فيبقى خفيفًا
// File responsibility: the village wall on the nation's outer border, following it on every expansion — wooden stakes, then a taller
// palisade with watchtowers, then a stone wall with towers; and a gate wherever a road reaches the border. Drawn as thin instances of
// one shape per kind so it stays light

import { Color3, Matrix, Mesh, MeshBuilder, Quaternion, StandardMaterial, Texture, TransformNode, Vector3, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { edgeCorners, tileKey } from '../core/economy';
import type { GameState, WallStyle, World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';
import { TILE_METRES } from '../assets/village-kit';

/** مقاسات كل طراز بالمتر / Each style's measurements in metres */
const STYLES: Record<WallStyle, { spacing: number; height: number; width: number; tower: number }> = {
  stakes: { spacing: 0.9, height: 1.5, width: 0.2, tower: 0 },
  palisade: { spacing: 0.34, height: 2.8, width: 0.32, tower: 5.6 },
  stone: { spacing: 2, height: 3.2, width: 0.9, tower: 6.4 },
};
/** نصف عرض فتحة البوابة بالمتر / Half the gate opening in metres */
const GATE_HALF = 2.2;
/** الأبراج على الزوايا كل هذا العدد من الأضلاع على الأقل / Towers on corners at least this many edges apart */
const TOWER_EVERY = 3;

interface Segment {
  a: Vector3;
  b: Vector3;
}

export class VillageWall {
  private root: TransformNode | null = null;
  private signature = '';
  private readonly metre: number;

  constructor(private readonly scene: Scene, private readonly world: World, private readonly shadows: ShadowGenerator | null) {
    this.metre = world.settings.tileSize / TILE_METRES;
  }

  /** يعيد الرسم عند تغيّر الحدود أو الطراز أو الطرق الواصلة إليها / Redraws when the border, the style or the roads reaching it change */
  sync(state: GameState, style: WallStyle | null): void {
    const owned = new Set(state.territory);
    const border = borderEdges(owned);
    const gates = style ? gateCorners(state, owned, border) : [];
    const signature = `${style}|${border.length}|${border.join(';')}|${gates.join(';')}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.root?.dispose();
    this.root = null;
    if (!style || !border.length) return;
    this.root = new TransformNode('village-wall', this.scene);
    const segments = this.segments(border, gates);
    this.drawWall(style, segments);
    if (STYLES[style].tower) this.drawTowers(style, border);
    for (const g of gates) this.drawGate(style, g, border);
  }

  /** نقطة زاوية الشبكة على سطح الأرض / A grid corner on the ground surface */
  private corner(cx: number, cz: number): Vector3 {
    const { tileSize } = this.world.settings;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const x = cx * tileSize - halfX;
    const z = cz * tileSize - halfZ;
    return new Vector3(x, Math.max(0, sampleHeight(this.world, x, z)), z);
  }

  /** أضلاع الحدود مقطوعة عند فتحات البوابات / Border edges cut at the gate openings */
  private segments(border: string[], gates: string[]): Segment[] {
    const gap = GATE_HALF * this.metre;
    const gatePoints = gates.map((g) => {
      const [x, z] = g.split(',').map(Number);
      return this.corner(x, z);
    });
    const out: Segment[] = [];
    for (const edge of border) {
      const [[ax, az], [bx, bz]] = edgeCorners(edge);
      let a = this.corner(ax, az);
      let b = this.corner(bx, bz);
      for (const g of gatePoints) {
        if (Vector3.Distance(a, g) < 0.01) a = Vector3.Lerp(a, b, gap / Vector3.Distance(a, b));
        if (Vector3.Distance(b, g) < 0.01) b = Vector3.Lerp(b, a, gap / Vector3.Distance(a, b));
      }
      out.push({ a, b });
    }
    return out;
  }

  /** جسم السور: أوتاد أو جذوع متلاصقة أو كتل حجرية بشرفات على طول كل ضلع / The wall body: stakes, close logs or stone blocks with merlons along each edge */
  private drawWall(style: WallStyle, segments: Segment[]): void {
    const m = this.metre;
    const spec = STYLES[style];
    const matrices: Matrix[] = [];
    const rails: Matrix[] = [];
    for (const { a, b } of segments) {
      const length = Vector3.Distance(a, b);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const count = Math.max(1, Math.round(length / (spec.spacing * m)));
      if (style === 'stone') {
        // كتلة واحدة بطول الضلع، وشرفة كل متر ونصف / One block the edge's length, and a merlon every metre and a half
        const mid = Vector3.Lerp(a, b, 0.5);
        matrices.push(Matrix.Compose(new Vector3(spec.width * m, spec.height * m, length), Quaternion.FromEulerAngles(0, yaw, 0), mid.add(new Vector3(0, (spec.height * m) / 2, 0))));
        const merlons = Math.max(1, Math.floor(length / (1.5 * m)));
        for (let i = 0; i < merlons; i++) {
          const p = Vector3.Lerp(a, b, (i + 0.5) / merlons);
          rails.push(Matrix.Compose(new Vector3(spec.width * m * 1.1, 0.6 * m, 0.7 * m), Quaternion.FromEulerAngles(0, yaw, 0), p.add(new Vector3(0, (spec.height + 0.3) * m, 0))));
        }
        continue;
      }
      for (let i = 0; i < count; i++) {
        const p = Vector3.Lerp(a, b, (i + 0.5) / count);
        // ارتفاع يتفاوت قليلًا حتى لا تبدو الأوتاد مصفوفة آليًا / Heights vary a little so the stakes never look machine-made
        const h = spec.height * m * (0.9 + 0.2 * (((i * 7919) % 13) / 13));
        matrices.push(Matrix.Compose(new Vector3(spec.width * m, h, spec.width * m), Quaternion.Identity(), p.add(new Vector3(0, h / 2, 0))));
      }
      // عارضتان أفقيتان تربطان الأوتاد / Two horizontal rails tie the stakes together
      const mid = Vector3.Lerp(a, b, 0.5);
      for (const level of style === 'stakes' ? [0.35, 0.75] : [0.6]) {
        rails.push(Matrix.Compose(new Vector3(0.1 * m, 0.12 * m, length), Quaternion.FromEulerAngles(0, yaw, 0), mid.add(new Vector3(0, spec.height * m * level, 0))));
      }
    }
    const wood = this.material(style === 'stone' ? 'stone' : 'wood');
    this.instances(style === 'stone' ? MeshBuilder.CreateBox('wall-block', { size: 1 }, this.scene) : MeshBuilder.CreateCylinder('wall-stake', { height: 1, diameter: 1, tessellation: 6 }, this.scene), wood, matrices);
    this.instances(MeshBuilder.CreateBox('wall-rail', { size: 1 }, this.scene), style === 'stone' ? wood : this.material('dark-wood'), rails);
  }

  /** أبراج على زوايا الحدود: منصة خشبية بسقف، أو برج حجري / Towers on border corners: a timber platform with a roof, or a stone tower */
  private drawTowers(style: WallStyle, border: string[]): void {
    const m = this.metre;
    const spec = STYLES[style];
    const corners = turningCorners(border);
    const picked: string[] = [];
    for (const c of corners) {
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
      const p = this.corner(x, z);
      const w = (style === 'stone' ? 2.4 : 2) * m;
      bodies.push(Matrix.Compose(new Vector3(w, spec.tower * m, w), Quaternion.Identity(), p.add(new Vector3(0, (spec.tower * m) / 2, 0))));
      roofs.push(Matrix.Compose(new Vector3(w * 1.5, 1.8 * m, w * 1.5), Quaternion.Identity(), p.add(new Vector3(0, spec.tower * m + 0.9 * m, 0))));
    }
    this.instances(MeshBuilder.CreateBox('tower', { size: 1 }, this.scene), this.material(style === 'stone' ? 'stone' : 'wood'), bodies);
    this.instances(MeshBuilder.CreateCylinder('tower-roof', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 4 }, this.scene), this.material('roof'), roofs);
  }

  /** البوابة: عمودان أعلى من السور وعارضة فوقهما / The gate: two posts taller than the wall and a beam across them */
  private drawGate(style: WallStyle, corner: string, border: string[]): void {
    const m = this.metre;
    const spec = STYLES[style];
    const [x, z] = corner.split(',').map(Number);
    const p = this.corner(x, z);
    // اتجاه الحدود عند البوابة: الضلع الذي يمر بزاويتها / The border's direction at the gate: an edge through its corner
    const along = border.find((e) => edgeCorners(e).some(([cx, cz]) => cx === x && cz === z));
    const horizontal = !!along && edgeCorners(along)[0][1] === edgeCorners(along)[1][1];
    const dir = horizontal ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
    const height = (spec.height + 1.4) * m;
    const post = (style === 'stone' ? 1.4 : 0.5) * m;
    const parts: Matrix[] = [];
    for (const side of [-1, 1]) {
      const at = p.add(dir.scale(side * (GATE_HALF + 0.3) * m));
      parts.push(Matrix.Compose(new Vector3(post, height, post), Quaternion.Identity(), at.add(new Vector3(0, height / 2, 0))));
    }
    const beamSize = horizontal ? new Vector3((GATE_HALF * 2 + 1.4) * m, 0.5 * m, post) : new Vector3(post, 0.5 * m, (GATE_HALF * 2 + 1.4) * m);
    parts.push(Matrix.Compose(beamSize, Quaternion.Identity(), p.add(new Vector3(0, height - 0.25 * m, 0))));
    this.instances(MeshBuilder.CreateBox('gate', { size: 1 }, this.scene), this.material(style === 'stone' ? 'stone' : 'dark-wood'), parts);
  }

  /** شكل واحد بنسخ رقيقة كثيرة / One shape drawn as many thin instances */
  private instances(mesh: Mesh, material: StandardMaterial, matrices: Matrix[]): void {
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
    this.shadows?.addShadowCaster(mesh);
  }

  /** مواد السور المشتركة / The wall's shared materials */
  private material(kind: 'wood' | 'dark-wood' | 'stone' | 'roof'): StandardMaterial {
    const name = `village-wall-${kind}`;
    const existing = this.scene.getMaterialByName(name) as StandardMaterial | null;
    if (existing) return existing;
    const m = new StandardMaterial(name, this.scene);
    m.specularColor = new Color3(0.03, 0.03, 0.03);
    if (kind === 'stone') {
      m.diffuseTexture = new Texture(`${import.meta.env.BASE_URL}models/village/textures/T_UnevenBrick_BaseColor.jpg`, this.scene, false, false);
    } else {
      m.diffuseColor = kind === 'wood' ? new Color3(0.47, 0.33, 0.2) : kind === 'dark-wood' ? new Color3(0.32, 0.22, 0.13) : new Color3(0.42, 0.24, 0.16);
    }
    return m;
  }
}

/** أضلاع المربعات التي لا يجاورها مربع من الدولة، بصيغة الحواف / Tile edges with no nation tile beyond them, as edge keys */
export function borderEdges(owned: Set<string>): string[] {
  const out: string[] = [];
  for (const key of owned) {
    const [x, z] = key.split(',').map(Number);
    if (!owned.has(tileKey(x, z - 1))) out.push(`h:${x},${z}`);
    if (!owned.has(tileKey(x, z + 1))) out.push(`h:${x},${z + 1}`);
    if (!owned.has(tileKey(x - 1, z))) out.push(`v:${x},${z}`);
    if (!owned.has(tileKey(x + 1, z))) out.push(`v:${x + 1},${z}`);
  }
  return out.sort();
}

/**
 * زوايا البوابات: زاوية على الحدود ينتهي عندها طريق قادم من داخل الدولة (ليس على الحدود نفسها)
 * Gate corners: a border corner where a road coming from inside the nation ends (not one running along the border)
 */
export function gateCorners(state: GameState, owned: Set<string>, border: string[]): string[] {
  const onBorder = new Set<string>();
  for (const e of border) for (const [x, z] of edgeCorners(e)) onBorder.add(tileKey(x, z));
  const borderSet = new Set(border);
  // عدد الطرق عند كل زاوية: البوابة حيث ينتهي طريق واحد / Roads per corner: a gate where exactly one road ends
  const roadsAt = new Map<string, number>();
  for (const r of state.roads) for (const [x, z] of edgeCorners(r.edge)) roadsAt.set(tileKey(x, z), (roadsAt.get(tileKey(x, z)) ?? 0) + 1);
  const gates = new Set<string>();
  for (const r of state.roads) {
    if (borderSet.has(r.edge)) continue;
    for (const [x, z] of edgeCorners(r.edge)) if (onBorder.has(tileKey(x, z)) && roadsAt.get(tileKey(x, z)) === 1) gates.add(tileKey(x, z));
  }
  // الطريق الداخلي يصل زاوية الحدود من جهة الدولة فقط إن كان أحد جانبيه فيها / Kept only when the road has nation land on a side
  return [...gates].filter((g) => {
    const [x, z] = g.split(',').map(Number);
    return [tileKey(x - 1, z - 1), tileKey(x, z - 1), tileKey(x - 1, z), tileKey(x, z)].some((k) => owned.has(k));
  }).sort();
}

/** زوايا الحدود التي يتغير عندها اتجاهها / Border corners where its direction turns */
function turningCorners(border: string[]): string[] {
  const dirs = new Map<string, Set<string>>();
  for (const e of border) {
    for (const [x, z] of edgeCorners(e)) {
      const k = tileKey(x, z);
      dirs.set(k, (dirs.get(k) ?? new Set()).add(e[0]));
    }
  }
  return [...dirs].filter(([, d]) => d.size > 1).map(([k]) => k).sort();
}
