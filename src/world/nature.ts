// مسؤولية الملف: الطبيعة — أشجار وصخور وأعشاب وزهور موزعة حسب نوع الأرض، تُزال من المربعات المبنية
// File responsibility: nature — trees, rocks, grass and flowers scattered by terrain, cleared from built tiles
//
// كل نوع يُرسم دفعة واحدة بنسخ خفيفة (thin instances) فيبقى الأداء جيدًا حتى على الجوال.
// Each kind is drawn in one call with thin instances, keeping performance good even on mobile.

import { Matrix, Quaternion, Vector3, type Mesh, type ShadowGenerator } from '@babylonjs/core';
import type { ModelLibrary } from '../assets/model-library';
import { NATURE_BY_TERRAIN } from '../assets/catalog';
import { createNoise } from '../core/noise';
import { tileKey } from '../core/economy';
import type { World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';

interface Kind {
  meshes: Mesh[];
  placements: { key: string; matrix: Matrix }[];
}

export class Nature {
  private readonly kinds: Kind[] = [];
  private hiddenSignature = '';

  constructor(private readonly library: ModelLibrary, private readonly world: World, private readonly density: number) {}

  /**
   * يوزّع الطبيعة على العالم بشكل ثابت حسب البذرة: الغابات تتجمع في بقع والمروج مفتوحة
   * Scatters nature deterministically by seed: forests gather in patches, meadows stay open
   */
  async build(shadows: ShadowGenerator | null): Promise<void> {
    const { tileSize, seed } = this.world.settings;
    const forest = createNoise(seed + 101, 3);
    const jitter = createNoise(seed + 202, 1);
    const byPath = new Map<string, { size: number; placements: Kind['placements'] }>();

    // مكامن الخشب غابات كثيفة، وأرض العاصمة المسطحة مفتوحة للبناء / Wood deposits are dense forests; the flat capital land stays open
    const forestTiles = new Set(this.world.deposits.filter((d) => d.resourceId === 'wood').flatMap((d) => d.tiles));
    const flat = this.world.settings.flatZoneRadius;
    const inBasin = (x: number, z: number) => this.world.basins.some((b) => Math.max(Math.abs(x - b.x), Math.abs(z - b.z)) <= flat);
    for (const tile of this.world.tiles) {
      const options = NATURE_BY_TERRAIN[tile.terrainId];
      if (!options) continue;
      // الغابات بقع متفرقة تتخللها مروج مفتوحة / Forests are scattered patches between open meadows
      let patch = Math.max(0.1, forest(tile.x * 0.11, tile.z * 0.11) * 2.6 - 0.75);
      if (forestTiles.has(tileKey(tile.x, tile.z))) patch = 3.2;
      else if (inBasin(tile.x, tile.z)) patch *= 0.25;
      const c = tileCenter(this.world, tile.x, tile.z);
      options.forEach(([path, size, perTile], k) => {
        const isTree = path.includes('tree');
        const wanted = perTile * this.density * (isTree ? patch : 1);
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
          const entry = byPath.get(path) ?? { size, placements: [] };
          entry.placements.push({ key: tileKey(tile.x, tile.z), matrix });
          byPath.set(path, entry);
        }
      });
    }

    // كل الأنواع تُحمَّل معًا بالتوازي / All kinds load together in parallel
    const spawned = await Promise.all([...byPath].map(async ([path, entry]) => ({ entry, ...(await this.library.spawn(path, { footprint: tileSize * entry.size })) })));
    for (const { entry: { placements }, root, meshes } of spawned) {
      // دمج تحويل النموذج في رؤوسه حتى تكفي مصفوفة النسخة وحدها / Bake the model transform so each instance needs only its matrix
      const baked: Mesh[] = [];
      for (const m of meshes as Mesh[]) {
        if (!m.getTotalVertices()) continue;
        m.computeWorldMatrix(true);
        m.setParent(null);
        m.makeGeometryUnique();
        m.bakeCurrentTransformIntoVertices();
        m.isPickable = false;
        m.alwaysSelectAsActiveMesh = true;
        shadows?.addShadowCaster(m);
        baked.push(m);
      }
      root.dispose(true);
      this.kinds.push({ meshes: baked, placements });
    }
    // تطبيق آخر طلب إخفاء وصل أثناء التحميل / Apply the latest hide request that arrived while loading
    this.hiddenSignature = '-';
    this.hide(this.requested);
  }

  private requested = new Set<string>();

  /** إخفاء الطبيعة من المربعات المبنية؛ يُعاد البناء عند التغير فقط / Clear nature from built tiles; rebuilt only on change */
  hide(keys: Set<string>): void {
    this.requested = keys;
    if (!this.kinds.length) return;
    const signature = [...keys].sort().join(';');
    if (signature === this.hiddenSignature) return;
    this.hiddenSignature = signature;
    for (const kind of this.kinds) {
      const visible = kind.placements.filter((p) => !keys.has(p.key));
      const buffer = new Float32Array(visible.length * 16);
      visible.forEach((p, i) => p.matrix.copyToArray(buffer, i * 16));
      for (const m of kind.meshes) {
        m.thinInstanceSetBuffer('matrix', buffer, 16, false);
        m.isVisible = visible.length > 0;
      }
    }
  }
}
