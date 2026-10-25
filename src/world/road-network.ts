// مسؤولية الملف: شبكة الطرق — شريط متصل ضيق يتفرع من مركز كل مربع نحو جيرانه، بحواف وخط منقط، مع أعمدة إنارة تضيء ليلًا
// File responsibility: road network — a narrow continuous ribbon branching from each tile centre to its neighbours,
// with edges and a dashed centre line, plus street lamps lit at night

import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, VertexData } from '@babylonjs/core';
import { tileKey } from '../core/economy';
import type { BuildingDef, GameState, World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';
import type { NightLights } from './day-night';

/** عرض الطريق وحوافه كنسبة من ضلع المربع / Road and kerb widths as fractions of a tile side */
const ROAD_WIDTH = 0.3;
const KERB_WIDTH = 0.035;
const LIFT = 0.06;
const SEGMENTS = 3;

/** شكل كل نمط طريق / Look of each road style */
const STYLES: Record<string, { surface: Color3; dashed: boolean }> = {
  road: { surface: new Color3(0.5, 0.46, 0.4), dashed: false },
  'paved-road': { surface: new Color3(0.2, 0.21, 0.23), dashed: true },
};
const KERB = new Color3(0.78, 0.76, 0.72);
const DASH = new Color3(0.95, 0.88, 0.55);
const LAMP_LIGHT = new Color3(1, 0.82, 0.45);
const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** هندسة تُجمع ثم تتحول إلى مجسم واحد / Geometry gathered then turned into one mesh */
class Builder {
  readonly positions: number[] = [];
  readonly indices: number[] = [];

  constructor(private readonly world: World, private readonly lift: number) {}

  /**
   * شريط من (ax,az) إلى (bx,bz) بعرض width، مزاح جانبيًا بـ offset، ومقسّم ليتبع الأرض
   * A strip from (ax,az) to (bx,bz) of the given width, shifted sideways by offset, split to follow the ground
   */
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

  /** مربعات كل نمط طريق / Tiles of each road style */
  tilesByStyle(state: GameState): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>();
    for (const b of state.buildings) {
      const style = this.defs.get(b.buildingId)?.model ?? '';
      if (!STYLES[style]) continue;
      if (!out.has(style)) out.set(style, new Set());
      out.get(style)!.add(tileKey(b.x, b.z));
    }
    return out;
  }

  /** إعادة الرسم عند تغيّر الطرق فقط / Redraw only when roads change */
  sync(state: GameState): void {
    const styles = this.tilesByStyle(state);
    const hub = tileKey(state.settlement.x, state.settlement.z);
    const signature = hub + '|' + [...styles].map(([s, set]) => `${s}:${[...set].sort().join(';')}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    for (const m of this.meshes) m.dispose();
    this.meshes = [];

    // كل الطرق تتصل ببعضها مهما اختلف نمطها، وبمركز القرية / All roads join each other regardless of style, and the village centre
    const all = new Set<string>([hub]);
    for (const set of styles.values()) for (const k of set) all.add(k);
    const s = this.world.settings.tileSize;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const kerbs = new Builder(this.world, LIFT * 1.3);
    const dashes = new Builder(this.world, LIFT * 1.6);
    const lampPositions: [number, number][] = [];

    for (const [style, tiles] of styles) {
      const surface = new Builder(this.world, LIFT);
      for (const key of tiles) {
        const [x, z] = key.split(',').map(Number);
        const cx = (x + 0.5) * s - halfX;
        const cz = (z + 0.5) * s - halfZ;
        const w = ROAD_WIDTH * s;
        // مربع المركز ثم ذراع نحو كل جار متصل / The centre square, then an arm toward each connected neighbour
        surface.strip(cx - w / 2, cz, cx + w / 2, cz, w);
        const arms = NEIGHBOURS.filter(([dx, dz]) => all.has(tileKey(x + dx, z + dz)));
        for (const [dx, dz] of arms) {
          const ex = cx + (dx * s) / 2;
          const ez = cz + (dz * s) / 2;
          surface.strip(cx, cz, ex, ez, w);
          kerbs.strip(cx + dx * (w / 2), cz + dz * (w / 2), ex, ez, KERB_WIDTH * s, (w - KERB_WIDTH * s) / 2);
          kerbs.strip(cx + dx * (w / 2), cz + dz * (w / 2), ex, ez, KERB_WIDTH * s, -(w - KERB_WIDTH * s) / 2);
          if (STYLES[style].dashed) {
            // شرطة في منتصف كل ذراع / One dash in the middle of each arm
            dashes.strip(cx + dx * s * 0.12, cz + dz * s * 0.12, cx + dx * s * 0.36, cz + dz * s * 0.36, s * 0.025);
          }
        }
        const side = arms.find(([dx]) => dx !== 0) ? [0, 1] : [1, 0];
        lampPositions.push([cx + side[0] * (w / 2 + s * 0.06), cz + side[1] * (w / 2 + s * 0.06)]);
      }
      const mesh = surface.build(`roads-${style}`, this.scene, this.material(`road-${style}`, STYLES[style].surface));
      if (mesh) this.meshes.push(mesh);
    }
    for (const [b, name, color] of [[kerbs, 'road-kerbs', KERB], [dashes, 'road-dashes', DASH]] as const) {
      const mesh = b.build(name, this.scene, this.material(name, color));
      if (mesh) this.meshes.push(mesh);
    }
    if (lampPositions.length) this.meshes.push(...this.buildLamps(lampPositions));
  }

  /** عمود إنارة على جانب كل مربع طريق / A street lamp beside every road tile */
  private buildLamps(spots: [number, number][]): Mesh[] {
    const s = this.world.settings.tileSize;
    const posts: Mesh[] = [];
    const heads: Mesh[] = [];
    for (const [px, pz] of spots) {
      const ground = Math.max(0, sampleHeight(this.world, px, pz));
      const h = s * 0.22;
      const post = MeshBuilder.CreateCylinder('post', { diameter: s * 0.018, height: h, tessellation: 5 }, this.scene);
      post.position.set(px, ground + h / 2, pz);
      posts.push(post);
      const head = MeshBuilder.CreateSphere('lamp', { diameter: s * 0.05, segments: 4 }, this.scene);
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
