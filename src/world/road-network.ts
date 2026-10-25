// مسؤولية الملف: رسم شبكة الطرق — كل مربع طريق يتصل بجيرانه من الطرق، بسطح يتبع التضاريس، مع أعمدة إنارة تضيء ليلًا
// File responsibility: draws the road network — each road tile joins its road neighbours, on a surface following the terrain,
// with street lamps that light up at night

import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, VertexData } from '@babylonjs/core';
import { tileKey } from '../core/economy';
import type { BuildingDef, GameState, World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';
import type { NightLights } from './day-night';

const WIDTH = 0.34;
const LIFT = 0.12;
const SEGMENTS = 3;

/** ألوان أنماط الطرق / Road style colours */
const STYLE_COLORS: Record<string, Color3> = {
  road: new Color3(0.62, 0.52, 0.38),
  'paved-road': new Color3(0.22, 0.23, 0.25),
};

/** ضوء رأس عمود الإنارة ليلًا / Street-lamp light at night */
const LAMP_LIGHT = new Color3(1, 0.82, 0.45);

export class RoadNetwork {
  private readonly meshes = new Map<string, Mesh>();
  private lamps: Mesh[] = [];
  private signature = '';
  private readonly postMat: StandardMaterial;
  private readonly lampMat: StandardMaterial;

  constructor(private readonly scene: Scene, private readonly world: World, private readonly defs: Map<string, BuildingDef>, lights: NightLights) {
    this.postMat = new StandardMaterial('lamp-post', scene);
    this.postMat.diffuseColor = new Color3(0.25, 0.26, 0.28);
    this.lampMat = new StandardMaterial('lamp-head', scene);
    this.lampMat.diffuseColor = new Color3(0.9, 0.88, 0.8);
    // أعمدة الإنارة تضيء تلقائيًا مع حلول الظلام / Street lamps switch on automatically at dusk
    lights.add(this.lampMat, LAMP_LIGHT);
  }

  /** مربعات كل نمط طريق / Tiles of each road style */
  tilesByStyle(state: GameState): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>();
    for (const b of state.buildings) {
      const style = this.defs.get(b.buildingId)?.model ?? '';
      if (!STYLE_COLORS[style]) continue;
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
    for (const m of this.meshes.values()) m.dispose();
    this.meshes.clear();
    for (const m of this.lamps) m.dispose();
    this.lamps = [];
    // كل الطرق تتصل ببعضها مهما اختلف نمطها، وبمركز القرية / All roads join each other regardless of style, and the village centre
    const all = new Set<string>([hub]);
    for (const set of styles.values()) for (const k of set) all.add(k);
    for (const [style, set] of styles) this.meshes.set(style, this.build(style, set, all));
    const roadTiles = [...all].filter((k) => k !== hub);
    if (roadTiles.length) this.lamps = this.buildLamps(roadTiles);
  }

  /** عمود إنارة عند زاوية كل مربع طريق / A street lamp at a corner of every road tile */
  private buildLamps(tiles: string[]): Mesh[] {
    const { tileSize } = this.world.settings;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const posts: Mesh[] = [];
    const heads: Mesh[] = [];
    for (const key of tiles) {
      const [x, z] = key.split(',').map(Number);
      const px = (x + 0.78) * tileSize - halfX;
      const pz = (z + 0.78) * tileSize - halfZ;
      const ground = Math.max(0, sampleHeight(this.world, px, pz));
      const h = tileSize * 0.32;
      const post = MeshBuilder.CreateCylinder('post', { diameter: tileSize * 0.025, height: h, tessellation: 5 }, this.scene);
      post.position.set(px, ground + h / 2, pz);
      posts.push(post);
      const head = MeshBuilder.CreateSphere('lamp', { diameter: tileSize * 0.07, segments: 4 }, this.scene);
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

  private build(style: string, tiles: Set<string>, connect: Set<string>): Mesh {
    const { tileSize } = this.world.settings;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const positions: number[] = [];
    const indices: number[] = [];
    const w = (WIDTH * tileSize) / 2;

    // شريط من (ax,az) إلى (bx,bz) بعرض ثابت، مقسّم ليتبع الارتفاع / Fixed-width strip split to follow height
    const strip = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / len) * w;
      const nz = ((bx - ax) / len) * w;
      const base = positions.length / 3;
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        const cx = ax + (bx - ax) * t;
        const cz = az + (bz - az) * t;
        for (const side of [-1, 1]) {
          const x = cx + nx * side;
          const z = cz + nz * side;
          positions.push(x, Math.max(0, sampleHeight(this.world, x, z)) + LIFT, z);
        }
      }
      for (let i = 0; i < SEGMENTS; i++) {
        const a = base + i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    };

    for (const key of tiles) {
      const [x, z] = key.split(',').map(Number);
      const cx = (x + 0.5) * tileSize - halfX;
      const cz = (z + 0.5) * tileSize - halfZ;
      strip(cx - w, cz, cx + w, cz);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (connect.has(tileKey(x + dx, z + dz))) strip(cx, cz, cx + (dx * tileSize) / 2, cz + (dz * tileSize) / 2);
      }
    }

    const mesh = new Mesh(`roads-${style}`, this.scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.normals = normals;
    data.applyToMesh(mesh);
    const mat = new StandardMaterial(`roads-${style}-mat`, this.scene);
    mat.diffuseColor = STYLE_COLORS[style];
    mat.specularColor = new Color3(0.03, 0.03, 0.03);
    mat.backFaceCulling = false;
    mat.zOffset = -2;
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    return mesh;
  }
}
