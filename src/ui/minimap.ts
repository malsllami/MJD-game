// مسؤولية الملف: الخريطة المصغرة — تُرسم من بيانات العالم والدولة لا من المشهد: الغابة والماء والأرض المكشوفة والخصبة والطرق وقنوات
// الري والسور والمباني وحدود الدولة، في نافذة حول الدولة تتسع مع توسعها، وفوقها موقع الكاميرا واتجاهها؛ والنقر ينقل الكاميرا
// File responsibility: the minimap — drawn from world and nation data, not the scene: forest, water, revealed and fertile land, roads,
// irrigation canals, the wall, buildings and the nation's border, in a window around the nation that widens as it grows, with the camera's
// position and heading on top; clicking moves the camera

import { edgeCorners } from '../core/economy';
import type { World } from '../core/types';
import { worldHalfExtents } from '../core/world-gen';

/** ما تعرضه الخريطة / What the map shows */
export interface MinimapView {
  territory: string[];
  /** هل في المربع غابة؟ / Is the tile forest? */
  forest: (x: number, z: number) => boolean;
  water: Set<string>;
  fertile: Set<string>;
  roads: string[];
  canals: string[];
  walls: string[];
  buildings: { x: number; z: number; color: string }[];
  /** مبنى الحكم / The government building */
  centre: { x: number; z: number };
}

/** ألوان الخريطة / The map's colours */
const COLORS = {
  meadow: '#5e7d45', forest: '#2f4f2a', owned: '#87a35f', fertile: '#b9c96a', water: '#3f86b4',
  road: '#d9c08a', canal: '#7fd3ea', wall: '#6b4a2b', border: '#e9d39b', centre: '#e9d39b', camera: '#ffffff',
};
/** هامش النافذة حول الدولة بالمربعات، وأقل ضلع لها / The window's margin around the nation in tiles, and its smallest side */
const MARGIN = 6;
const MIN_SIDE = 24;
/** دقة الرسم: بكسل لكل مربع / Drawing resolution: pixels per tile */
const PX = 8;

export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layer = document.createElement('canvas');
  private signature = '';
  /** نافذة العرض بإحداثيات المربعات / The view window in tile coordinates */
  private win = { x0: 0, z0: 0, side: MIN_SIDE };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly world: World, onPick: (x: number, z: number) => void) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      const tx = this.win.x0 + ((e.clientX - r.left) / r.width) * this.win.side;
      // الشمال (z الموجب) في أعلى الخريطة / North (+z) is at the top of the map
      const tz = this.win.z0 + (1 - (e.clientY - r.top) / r.height) * this.win.side;
      const { halfX, halfZ } = worldHalfExtents(world);
      onPick(tx * world.settings.tileSize - halfX, tz * world.settings.tileSize - halfZ);
    });
  }

  /** يعيد رسم الطبقة عند تغير ما تعرضه فقط / Redraws the layer only when what it shows changes */
  setView(view: MinimapView): void {
    const signature = [view.territory.length, view.water.size, view.fertile.size, view.roads.join(';'), view.canals.join(';'), view.walls.join(';'),
      view.buildings.map((b) => `${b.x},${b.z},${b.color}`).join(';')].join('|');
    if (signature === this.signature) return;
    this.signature = signature;

    // نافذة مربعة حول الدولة بهامش، تتسع مع التوسع / A square window around the nation with a margin, widening as it grows
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const k of view.territory) {
      const [x, z] = k.split(',').map(Number);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const side = Math.max(MIN_SIDE, maxX - minX + 1 + MARGIN * 2, maxZ - minZ + 1 + MARGIN * 2);
    this.win = { x0: Math.floor((minX + maxX + 1) / 2 - side / 2), z0: Math.floor((minZ + maxZ + 1) / 2 - side / 2), side };
    this.layer.width = this.layer.height = side * PX;
    this.canvas.width = this.canvas.height = side * PX;
    const c = this.layer.getContext('2d')!;
    const owned = new Set(view.territory);
    const cell = (x: number, z: number, color: string, inset = 0) => {
      c.fillStyle = color;
      const [px, py] = this.toPx(x, z + 1);
      c.fillRect(px + inset, py + inset, PX - inset * 2, PX - inset * 2);
    };
    for (let z = this.win.z0; z < this.win.z0 + side; z++) {
      for (let x = this.win.x0; x < this.win.x0 + side; x++) {
        const key = `${x},${z}`;
        const color = view.water.has(key) ? COLORS.water : view.fertile.has(key) ? COLORS.fertile : owned.has(key) ? COLORS.owned
          : view.forest(x, z) ? COLORS.forest : COLORS.meadow;
        cell(x, z, color);
      }
    }
    const lines = (edges: string[], color: string, width: number) => {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.lineCap = 'round';
      c.beginPath();
      for (const e of edges) {
        const [[ax, az], [bx, bz]] = edgeCorners(e);
        c.moveTo(...this.toPx(ax, az));
        c.lineTo(...this.toPx(bx, bz));
      }
      c.stroke();
    };
    // حدود الدولة: أضلاع المربعات التي لا يجاورها مربع منها / The nation's border: tile sides with no nation tile beyond
    const border: string[] = [];
    for (const k of owned) {
      const [x, z] = k.split(',').map(Number);
      if (!owned.has(`${x},${z - 1}`)) border.push(`h:${x},${z}`);
      if (!owned.has(`${x},${z + 1}`)) border.push(`h:${x},${z + 1}`);
      if (!owned.has(`${x - 1},${z}`)) border.push(`v:${x},${z}`);
      if (!owned.has(`${x + 1},${z}`)) border.push(`v:${x + 1},${z}`);
    }
    lines(border, COLORS.border, 1.5);
    lines(view.roads, COLORS.road, 2.4);
    lines(view.canals, COLORS.canal, 2);
    lines(view.walls, COLORS.wall, 2.6);
    for (const b of view.buildings) cell(b.x, b.z, b.color, 1.5);
    const [cx, cy] = this.toPx(view.centre.x + 0.5, view.centre.z + 0.5);
    c.fillStyle = COLORS.centre;
    c.strokeStyle = '#16221f';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, PX * 0.9, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  /** رسم موقع الكاميرا واتجاهها فوق الطبقة / Draw the camera's position and heading over the layer */
  update(targetX: number, targetZ: number, heading: number): void {
    if (!this.layer.width) return;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const [px, py] = this.toPx((targetX + halfX) / this.world.settings.tileSize, (targetZ + halfZ) / this.world.settings.tileSize);
    const c = this.ctx;
    c.drawImage(this.layer, 0, 0);
    c.save();
    c.translate(px, py);
    c.rotate(heading);
    c.strokeStyle = COLORS.camera;
    c.fillStyle = 'rgba(255,255,255,.22)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-PX * 2.2, -PX * 3.2);
    c.lineTo(PX * 2.2, -PX * 3.2);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  /** من إحداثيات المربعات إلى بكسل اللوحة / From tile coordinates to canvas pixels */
  private toPx(x: number, z: number): [number, number] {
    return [(x - this.win.x0) * PX, (this.win.z0 + this.win.side - z) * PX];
  }
}
