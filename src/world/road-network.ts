// مسؤولية الملف: شبكة الطرق على حدود المربعات — شريط متصل بين زوايا الشبكة، بتقاطعات وحواف وخط منقط، مع أعمدة إنارة تضيء ليلًا
// File responsibility: the road network on tile edges — a continuous ribbon between grid corners, with junctions, kerbs,
// a dashed centre line, and street lamps lit at night

import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, VertexData } from '@babylonjs/core';
import { edgeCorners, tileKey } from '../core/economy';
import type { BuildingDef, GameState, World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';
import type { NightLights } from './day-night';

/** عرض الطريق وحوافه كنسبة من ضلع المربع / Road and kerb widths as fractions of a tile side */
const ROAD_WIDTH = 0.22;
const KERB_WIDTH = 0.03;
const LIFT = 0.08;
const SEGMENTS = 4;

/** شكل كل نمط طريق / Look of each road style */
const STYLES: Record<string, { surface: Color3; dashed: boolean }> = {
  road: { surface: new Color3(0.46, 0.43, 0.38), dashed: false },
  'paved-road': { surface: new Color3(0.2, 0.21, 0.23), dashed: true },
};
const KERB = new Color3(0.8, 0.78, 0.74);
const DASH = new Color3(0.95, 0.88, 0.55);
const LAMP_LIGHT = new Color3(1, 0.82, 0.45);

/** هندسة تُجمع ثم تتحول إلى مجسم واحد / Geometry gathered then turned into one mesh */
class Builder {
  readonly positions: number[] = [];
  readonly indices: number[] = [];

  constructor(private readonly world: World, private readonly lift: number) {}

  /** شريط من A إلى B بعرض width، مزاح جانبيًا بـ offset، يتبع الأرض / A strip from A to B, shifted sideways, following the ground */
  strip(ax: number, az: number, bx: number, bz: number, width: number, offset = 0): void {
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const px = -(bz - az) / len;
    const pz = (bx - ax) / len;
    const base = this.positions.length / 3;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const cx = ax + (bx - ax) * t + px * offset;
      const cz = az + (bz - az) * t + pz * offset;
      for (const side of [-1, 1]) {
        const x = cx + px * (width / 2) * side;
        const z = cz + pz * (width / 2) * side;
        this.positions.push(x, Math.max(0, sampleHeight(this.world, x, z)) + this.lift, z);
      }
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const a = base + i * 2;
      this.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  build(name: string, scene: Scene, material: StandardMaterial): Mesh | null {
    if (!this.indices.length) return null;
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = this.positions;
    data.indices = this.indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(this.positions, this.indices, normals);
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    return mesh;
  }
}

export class RoadNetwork {
  private meshes: Mesh[] = [];
  private signature = '';
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly postMat: StandardMaterial;
  private readonly lampMat: StandardMaterial;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly defs: Map<string, BuildingDef>,
    lights: NightLights,
  ) {
    this.postMat = this.material('lamp-post', new Color3(0.25, 0.26, 0.28));
    this.lampMat = this.material('lamp-head', new Color3(0.9, 0.88, 0.8));
    // أعمدة الإنارة تضيء تلقائيًا مع حلول الظلام / Street lamps switch on automatically at dusk
    lights.add(this.lampMat, LAMP_LIGHT);
  }

  /** حواف كل نمط طريق / Edges of each road style */
  edgesByStyle(state: GameState): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>();
    for (const r of state.roads) {
      const style = this.defs.get(r.buildingId)?.model ?? '';
      if (!STYLES[style]) continue;
      if (!out.has(style)) out.set(style, new Set());
      out.get(style)!.add(r.edge);
    }
    return out;
  }

  /** إعادة الرسم عند تغيّر الطرق فقط / Redraw only when roads change */
  sync(state: GameState): void {
    const styles = this.edgesByStyle(state);
    const signature = [...styles].map(([s, set]) => `${s}:${[...set].sort().join(';')}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    for (const m of this.meshes) m.dispose();
    this.meshes = [];

    const s = this.world.settings.tileSize;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const w = ROAD_WIDTH * s;
    const k = KERB_WIDTH * s;
    const at = (x: number, z: number): [number, number] => [x * s - halfX, z * s - halfZ];
    const kerbs = new Builder(this.world, LIFT * 1.3);
    const dashes = new Builder(this.world, LIFT * 1.6);
    const lamps: [number, number][] = [];
    const joints = new Set<string>();

    for (const [style, edges] of styles) {
      const surface = new Builder(this.world, LIFT);
      for (const edge of edges) {
        const [[ax, az], [bx, bz]] = edgeCorners(edge).map(([x, z]) => at(x, z));
        surface.strip(ax, az, bx, bz, w);
        // الحواف والشرطة تقصر عند الأطراف حتى لا تقطع التقاطع / Kerbs and dash stop short of the ends so junctions stay clear
        const dx = Math.sign(bx - ax) * (w / 2);
        const dz = Math.sign(bz - az) * (w / 2);
        kerbs.strip(ax + dx, az + dz, bx - dx, bz - dz, k, (w - k) / 2);
        kerbs.strip(ax + dx, az + dz, bx - dx, bz - dz, k, -(w - k) / 2);
        if (STYLES[style].dashed) {
          const mx = (ax + bx) / 2;
          const mz = (az + bz) / 2;
          dashes.strip(mx - (bx - ax) * 0.18, mz - (bz - az) * 0.18, mx + (bx - ax) * 0.18, mz + (bz - az) * 0.18, s * 0.022);
        }
        lamps.push([(ax + bx) / 2 + (bz !== az ? w / 2 + s * 0.04 : 0), (az + bz) / 2 + (bx !== ax ? w / 2 + s * 0.04 : 0)]);
        for (const [x, z] of edgeCorners(edge)) {
          const key = tileKey(x, z);
          if (joints.has(key)) continue;
          joints.add(key);
          // مربع التقاطع عند الزاوية / The junction square at the corner
          const [cx, cz] = at(x, z);
          surface.strip(cx - w / 2, cz, cx + w / 2, cz, w);
        }
      }
      const mesh = surface.build(`roads-${style}`, this.scene, this.material(`road-${style}`, STYLES[style].surface));
      if (mesh) this.meshes.push(mesh);
    }
    for (const [b, name, color] of [[kerbs, 'road-kerbs', KERB], [dashes, 'road-dashes', DASH]] as const) {
      const mesh = b.build(name, this.scene, this.material(name, color));
      if (mesh) this.meshes.push(mesh);
    }
    if (lamps.length) this.meshes.push(...this.buildLamps(lamps));
  }

  /** عمود إنارة على جانب كل قطعة طريق / A street lamp beside every road piece */
  private buildLamps(spots: [number, number][]): Mesh[] {
    const s = this.world.settings.tileSize;
    const posts: Mesh[] = [];
    const heads: Mesh[] = [];
    for (const [px, pz] of spots) {
      const ground = Math.max(0, sampleHeight(this.world, px, pz));
      const h = s * 0.2;
      const post = MeshBuilder.CreateCylinder('post', { diameter: s * 0.016, height: h, tessellation: 5 }, this.scene);
      post.position.set(px, ground + h / 2, pz);
      posts.push(post);
      const head = MeshBuilder.CreateSphere('lamp', { diameter: s * 0.045, segments: 4 }, this.scene);
      head.position.set(px, ground + h, pz);
      heads.push(head);
    }
    const merge = (parts: Mesh[], mat: StandardMaterial) => {
      const m = Mesh.MergeMeshes(parts, true, true)!;
      m.material = mat;
      m.isPickable = false;
      return m;
    };
    return [merge(posts, this.postMat), merge(heads, this.lampMat)];
  }

  private material(name: string, color: Color3): StandardMaterial {
    let m = this.materials.get(name);
    if (!m) {
      m = new StandardMaterial(name, this.scene);
      m.diffuseColor = color;
      m.specularColor = new Color3(0.04, 0.04, 0.04);
      m.backFaceCulling = false;
      m.zOffset = -2;
      this.materials.set(name, m);
    }
    return m;
  }
}
