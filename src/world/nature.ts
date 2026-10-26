// مسؤولية الملف: الطبيعة — أشجار وصخور وأعشاب وزهور موزعة حسب نوع الأرض، تُزال من المربعات المبنية
// File responsibility: nature — trees, rocks, grass and flowers scattered by terrain, cleared from built tiles
//
// لكل نوع مجسمان فقط بنسخ خفيفة (thin instances): مفصّل يحمل ما في القطع القريبة من الكاميرا، وخفيف يحمل الباقي في نفس
// المواضع؛ والنباتات الصغيرة تظهر قرب الكاميرا فقط. يُعاد توزيع النسخ فقط عند انتقال الكاميرا إلى قطعة أخرى.
// Each kind has just two thin-instanced meshes: a detailed one holding what lies in chunks near the camera, and a light one
// holding the rest at the same spots; small plants show only near the camera. Instances are redistributed only when the
// camera moves into another chunk.

import { Matrix, Quaternion, Vector3, type Mesh, type ShadowGenerator } from '@babylonjs/core';
import type { ModelLibrary } from '../assets/model-library';
import { NATURE_BY_TERRAIN, OUTCROP_NATURE, type NatureKind } from '../assets/catalog';
import { createNoise } from '../core/noise';
import { tileKey } from '../core/economy';
import type { World } from '../core/types';
import { edgeDistance, FLAT_EDGE_FOREST, sampleHeight, tileCenter } from '../core/world-gen';

/** ضلع القطعة بعدد المربعات / Chunk side in tiles */
const CHUNK = 16;
/** القطع ضمن هذا البعد (بالقطع) من مركز النظر تُرسم بالتفصيل / Chunks within this distance (in chunks) of the look-at point are detailed */
const NEAR_CHUNKS = 1.6;
/** فوق نصف قطر الكاميرا هذا (بالمربعات) تُرسم كل القطع خفيفة / Above this camera radius (in tiles) every chunk is light */
const DETAIL_RADIUS_TILES = 40;

interface Placement {
  key: string;
  cx: number;
  cz: number;
  matrix: Matrix;
}

/** نوع واحد: مواضعه، ومجسماته المفصّلة والخفيفة / One kind: its spots, and its detailed and light meshes */
interface Kind {
  placements: Placement[];
  detailed: Mesh[];
  light: Mesh[];
}

export class Nature {
  private readonly kinds: Kind[] = [];
  private hidden = new Set<string>();
  private hiddenSignature = '';
  private built = false;
  private detailKey = '';
  /** مركز القطع المفصّلة، أو null حين تكون الكاميرا بعيدة / Centre of the detailed chunks, or null when the camera is far */
  private nearCentre: { x: number; z: number } | null = null;

  constructor(private readonly library: ModelLibrary, private readonly world: World, private readonly density: number) {}

  /**
   * يوزّع الطبيعة على العالم بشكل ثابت حسب البذرة: الغابات تتجمع في بقع والمروج مفتوحة
   * Scatters nature deterministically by seed: forests gather in patches, meadows stay open
   */
  async build(shadows: ShadowGenerator | null): Promise<void> {
    const { tileSize, seed } = this.world.settings;
    const forest = createNoise(seed + 101, 3);
    const jitter = createNoise(seed + 202, 1);
    const byKind = new Map<NatureKind, Placement[]>();

    // مكامن الخشب غابات كثيفة، وأرض العاصمة المسطحة مفتوحة للبناء / Wood deposits are dense forests; the flat capital land stays open
    const forestTiles = new Set(this.world.deposits.filter((d) => d.resourceId === 'wood').flatMap((d) => d.tiles));
    // المعادن والحجر على السهل تظهر نتوءات صخرية / Ores and stone on the plain show as rock outcrops
    const outcrops = this.world.settings.worldMode === 'flat'
      ? new Set(this.world.deposits.filter((d) => d.resourceId !== 'wood' && d.resourceId !== 'oil').flatMap((d) => d.tiles))
      : new Set<string>();
    // في العالم المستوي: حزام غابة كثيفة يرسم حدود العالم / In a flat world: a dense forest belt marks the world's borders
    const edgeForest = (x: number, z: number) => this.world.settings.worldMode === 'flat' && edgeDistance(this.world.settings, x, z) < FLAT_EDGE_FOREST;
    const flat = this.world.settings.flatZoneRadius;
    const inBasin = (x: number, z: number) => this.world.basins.some((b) => Math.max(Math.abs(x - b.x), Math.abs(z - b.z)) <= flat);
    const sparse = this.world.settings.worldMode === 'flat' ? 0.3 : 1;
    for (const tile of this.world.tiles) {
      const key = tileKey(tile.x, tile.z);
      const options = outcrops.has(key) ? OUTCROP_NATURE : NATURE_BY_TERRAIN[tile.terrainId];
      if (!options) continue;
      // الغابات بقع متفرقة تتخللها مروج مفتوحة / Forests are scattered patches between open meadows
      let patch = Math.max(0.1, forest(tile.x * 0.11, tile.z * 0.11) * 2.6 - 0.75);
      if (forestTiles.has(key) || edgeForest(tile.x, tile.z)) patch = 2.2;
      else if (inBasin(tile.x, tile.z)) patch *= 0.25;
      // العالم المستوي كله يابسة، فالأشجار المتفرقة خارج الغابات أخف للحفاظ على الأداء / A flat world is all land, so stray trees are lighter for performance
      else patch *= sparse;
      const c = tileCenter(this.world, tile.x, tile.z);
      const cx = Math.floor(tile.x / CHUNK);
      const cz = Math.floor(tile.z / CHUNK);
      options.forEach((kind, k) => {
        const wanted = kind.perTile * this.density * (kind.tree ? patch : sparse);
        let count = Math.floor(wanted);
        if (jitter(tile.x * 7.1 + k * 13.3, tile.z * 5.7) < wanted - count) count++;
        for (let i = 0; i < count; i++) {
          const r = (a: number) => jitter(tile.x * 3.3 + i * 17.7 + k * 9.1 + a, tile.z * 4.1 + i * 11.3 + a * 2);
          const wx = c.x + (r(1) - 0.5) * tileSize * 0.86;
          const wz = c.z + (r(2) - 0.5) * tileSize * 0.86;
          const y = sampleHeight(this.world, wx, wz);
          if (y < 0.15) continue;
          const scale = 0.75 + r(3) * 0.5;
          const matrix = Matrix.Compose(new Vector3(scale, scale, scale), Quaternion.RotationYawPitchRoll(r(4) * Math.PI * 2, 0, 0), new Vector3(wx, y, wz));
          const list = byKind.get(kind) ?? [];
          list.push({ key, cx, cz, matrix });
          byKind.set(kind, list);
        }
      });
    }

    // كل الأنواع تُحمَّل معًا بالتوازي / All kinds load in parallel
    await Promise.all([...byKind].map(async ([kind, placements]) => {
      const footprint = tileSize * kind.size;
      const detailed = await this.bake(kind.path, footprint);
      const light = kind.light ? await this.bake(kind.light, footprint) : [];
      // الظلال من النماذج المفصّلة القريبة فقط / Shadows come from the detailed near models only
      if (shadows) for (const m of detailed) shadows.addShadowCaster(m);
      this.kinds.push({ placements, detailed, light });
    }));
    this.built = true;
    this.refill();
  }

  /** تحميل نموذج ودمج تحويله في رؤوسه حتى تكفي مصفوفة النسخة وحدها / Load a model and bake its transform so each instance needs only its matrix */
  private async bake(path: string, footprint: number): Promise<Mesh[]> {
    const { root, meshes } = await this.library.spawn(path, { footprint });
    const baked: Mesh[] = [];
    for (const m of meshes as Mesh[]) {
      if (!m.getTotalVertices()) continue;
      m.computeWorldMatrix(true);
      m.setParent(null);
      m.makeGeometryUnique();
      m.bakeCurrentTransformIntoVertices();
      m.isPickable = false;
      m.alwaysSelectAsActiveMesh = true;
      baked.push(m);
    }
    root.dispose(true);
    return baked;
  }

  /** إخفاء الطبيعة من المربعات المبنية؛ يُعاد التوزيع عند التغير فقط / Clear nature from built tiles; redistributed only on change */
  hide(keys: Set<string>): void {
    const signature = [...keys].sort().join(';');
    if (signature === this.hiddenSignature) return;
    this.hiddenSignature = signature;
    this.hidden = keys;
    this.refill();
  }

  /** توزيع النسخ بين المجسم المفصّل (القريب) والخفيف (البعيد) / Distribute instances between the detailed (near) and light (far) meshes */
  private refill(): void {
    if (!this.built) return;
    const centre = this.nearCentre;
    const isNear = (p: Placement) => !!centre && Math.hypot(p.cx + 0.5 - centre.x, p.cz + 0.5 - centre.z) <= NEAR_CHUNKS;
    const fill = (meshes: Mesh[], list: Placement[]) => {
      const buffer = new Float32Array(list.length * 16);
      list.forEach((p, i) => p.matrix.copyToArray(buffer, i * 16));
      for (const m of meshes) {
        m.thinInstanceSetBuffer('matrix', buffer, 16, false);
        m.setEnabled(list.length > 0);
      }
    };
    for (const kind of this.kinds) {
      const shown = kind.placements.filter((p) => !this.hidden.has(p.key));
      fill(kind.detailed, shown.filter(isNear));
      fill(kind.light, shown.filter((p) => !isNear(p)));
    }
  }

  /**
   * التفصيل حسب الكاميرا: القطع القريبة مفصّلة والبعيدة خفيفة؛ يُستدعى مع كل حركة للكاميرا
   * Detail by camera: near chunks detailed, far ones light; called as the camera moves
   */
  updateDetail(targetX: number, targetZ: number, cameraRadius: number): void {
    if (!this.built) return;
    const { tileSize, tilesX, tilesZ } = this.world.settings;
    const tx = (targetX / tileSize + tilesX / 2) / CHUNK;
    const tz = (targetZ / tileSize + tilesZ / 2) / CHUNK;
    const zoomedOut = cameraRadius / tileSize > DETAIL_RADIUS_TILES;
    // يُعاد التوزيع عند تغيّر القطعة التي تنظر إليها الكاميرا فقط / Redistribute only when the chunk under the camera changes
    const key = zoomedOut ? 'far' : `${Math.floor(tx)},${Math.floor(tz)}`;
    if (key === this.detailKey) return;
    this.detailKey = key;
    this.nearCentre = zoomedOut ? null : { x: Math.floor(tx) + 0.5, z: Math.floor(tz) + 0.5 };
    this.refill();
  }
}
