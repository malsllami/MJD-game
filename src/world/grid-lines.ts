// مسؤولية الملف: خطوط على حواف الشبكة تتبع الأرض — شبكة المربعات الظاهرة داخل الدولة، ومعاينة الطرق قبل تأكيدها
// File responsibility: lines on grid edges that follow the ground — the visible tile grid inside the nation, and road previews before confirming

import { Color3, Color4, MeshBuilder, Scene, Vector3, type LinesMesh } from '@babylonjs/core';
import { edgeCorners, tileEdges } from '../core/economy';
import type { World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';

const SEGMENTS = 4;

export class GridLines {
  private mesh: LinesMesh | null = null;
  private signature = '';
  private visible = true;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly color: Color3,
    private readonly alpha: number,
    private readonly lift: number,
  ) {}

  /** رسم الحواف المعطاة؛ لا يعيد البناء إن لم تتغير / Draw the given edges; not rebuilt if unchanged */
  showEdges(edges: string[], color: Color3 = this.color): void {
    const signature = `${color.toHexString()}|${edges.length}|${edges.join(';')}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.mesh?.dispose();
    this.mesh = null;
    if (!edges.length) return;
    const { tileSize } = this.world.settings;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const lines = edges.map((edge) => {
      const [[ax, az], [bx, bz]] = edgeCorners(edge);
      const pts: Vector3[] = [];
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        const x = (ax + (bx - ax) * t) * tileSize - halfX;
        const z = (az + (bz - az) * t) * tileSize - halfZ;
        pts.push(new Vector3(x, Math.max(0, sampleHeight(this.world, x, z)) + this.lift, z));
      }
      return pts;
    });
    // الشفافية لكل رأس، فخاصية alpha وحدها لا تُطبَّق على الخطوط / Per-vertex alpha, since alpha alone is not applied to lines
    const tint = new Color4(color.r, color.g, color.b, this.alpha);
    const colors = lines.map((pts) => pts.map(() => tint));
    this.mesh = MeshBuilder.CreateLineSystem('grid-lines', { lines, colors, useVertexAlpha: this.alpha < 1 }, this.scene);
    this.mesh.isPickable = false;
    this.mesh.setEnabled(this.visible);
  }

  /** كل أضلاع المربعات المعطاة (شبكة) / Every edge of the given tiles (a grid) */
  showTiles(keys: string[]): void {
    const edges = new Set<string>();
    for (const key of keys) {
      const [x, z] = key.split(',').map(Number);
      for (const e of tileEdges(x, z)) edges.add(e);
    }
    this.showEdges([...edges].sort());
  }

  /** إظهار أو إخفاء الخطوط دون إعادة رسمها / Show or hide the lines without rebuilding */
  setVisible(on: boolean): void {
    this.visible = on;
    this.mesh?.setEnabled(on);
  }

  clear(): void {
    this.showEdges([]);
  }
}
