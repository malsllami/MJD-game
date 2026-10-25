// مسؤولية الملف: شبكة الطرق بقطع Kenney — مستقيم ومنعطف وتقاطع ونهاية حسب الجيران، مع أعمدة إنارة تضيء ليلًا
// File responsibility: road network with Kenney pieces — straight, bend, junction and end by neighbours, with street lamps lit at night

import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode } from '@babylonjs/core';
import { ROAD_MODELS } from '../assets/catalog';
import type { ModelLibrary } from '../assets/model-library';
import { tileKey } from '../core/economy';
import type { BuildingDef, GameState, World } from '../core/types';
import { sampleHeight, tileCenter, worldHalfExtents } from '../core/world-gen';
import type { NightLights } from './day-night';

/** الجهات بترتيب دوران عقارب الساعة / Sides in clockwise order */
const SIDES = ['N', 'E', 'S', 'W'] as const;
type Side = (typeof SIDES)[number];
const OFFSET: Record<Side, [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };

/**
 * الجهات المتصلة في كل قطعة بلا دوران؛ الدوران +90° ينقل كل جهة للتي بعدها
 * Open sides of each piece unrotated; a +90° turn moves each side to the next
 */
const PIECES: { path: string; sides: Side[] }[] = [
  { path: ROAD_MODELS.cross, sides: ['N', 'E', 'S', 'W'] },
  { path: ROAD_MODELS.tee, sides: ['E', 'S', 'W'] },
  { path: ROAD_MODELS.straight, sides: ['N', 'S'] },
  { path: ROAD_MODELS.bend, sides: ['S', 'W'] },
  { path: ROAD_MODELS.end, sides: ['S'] },
];

/** أنماط تُرسم طرقًا / Styles drawn as roads */
const ROAD_STYLES = new Set(['road', 'paved-road']);
const LAMP_LIGHT = new Color3(1, 0.82, 0.45);

/** القطعة والدوران المطابقان لجهات الجيران / The piece and turn matching the neighbour sides */
export function pickPiece(open: Side[]): { path: string; yaw: number } {
  const want = new Set(open);
  for (const piece of PIECES) {
    if (piece.sides.length !== Math.max(1, want.size)) continue;
    for (let turn = 0; turn < 4; turn++) {
      const turned = piece.sides.map((s) => SIDES[(SIDES.indexOf(s) + turn) % 4]);
      if (!want.size || turned.every((s) => want.has(s))) return { path: piece.path, yaw: (turn * Math.PI) / 2 };
    }
  }
  return { path: ROAD_MODELS.square, yaw: 0 };
}

export class RoadNetwork {
  private root: TransformNode | null = null;
  private lamps: Mesh[] = [];
  private signature = '';
  private readonly postMat: StandardMaterial;
  private readonly lampMat: StandardMaterial;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly library: ModelLibrary,
    private readonly defs: Map<string, BuildingDef>,
    lights: NightLights,
  ) {
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
      if (!ROAD_STYLES.has(style)) continue;
      if (!out.has(style)) out.set(style, new Set());
      out.get(style)!.add(tileKey(b.x, b.z));
    }
    return out;
  }

  /** إعادة الرسم عند تغيّر الطرق فقط / Redraw only when roads change */
  sync(state: GameState): void {
    const roads = new Set<string>();
    for (const set of this.tilesByStyle(state).values()) for (const k of set) roads.add(k);
    const hub = tileKey(state.settlement.x, state.settlement.z);
    const signature = hub + '|' + [...roads].sort().join(';');
    if (signature === this.signature) return;
    this.signature = signature;
    this.root?.dispose();
    for (const m of this.lamps) m.dispose();
    this.lamps = [];
    if (!roads.size) return;

    const root = new TransformNode('roads', this.scene);
    this.root = root;
    const { tileSize } = this.world.settings;
    // الطرق تتصل ببعضها وبمركز القرية / Roads join each other and the village centre
    const connects = (k: string) => roads.has(k) || k === hub;
    for (const key of roads) {
      const [x, z] = key.split(',').map(Number);
      const open = SIDES.filter((s) => connects(tileKey(x + OFFSET[s][0], z + OFFSET[s][1])));
      const { path, yaw } = pickPiece(open);
      const c = tileCenter(this.world, x, z);
      void this.library.spawn(path, { footprint: tileSize, yaw }).then(({ root: piece, meshes }) => {
        if (root.isDisposed()) return piece.dispose();
        piece.parent = root;
        piece.position.set(c.x, Math.max(0, sampleHeight(this.world, c.x, c.z)) + 0.02, c.z);
        for (const m of meshes) m.receiveShadows = true;
      });
    }
    this.lamps = this.buildLamps([...roads]);
  }

  /** عمود إنارة عند زاوية كل مربع طريق / A street lamp at a corner of every road tile */
  private buildLamps(tiles: string[]): Mesh[] {
    const { tileSize } = this.world.settings;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const posts: Mesh[] = [];
    const heads: Mesh[] = [];
    for (const key of tiles) {
      const [x, z] = key.split(',').map(Number);
      const px = (x + 0.92) * tileSize - halfX;
      const pz = (z + 0.92) * tileSize - halfZ;
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
}
