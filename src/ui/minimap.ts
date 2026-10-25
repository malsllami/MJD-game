// مسؤولية الملف: الخريطة المصغرة — صورة علوية للعالم مع حدود الدولة والعلامات وموقع الكاميرا، والنقر عليها ينقل الكاميرا
// File responsibility: minimap — top-down world image with borders, markers and the camera; clicking moves the camera

import type { TerrainType, World } from '../core/types';
import { worldHalfExtents } from '../core/world-gen';

/** علامة على الخريطة المصغرة / Minimap marker */
export interface MinimapMarker {
  x: number;
  z: number;
  emphasis: boolean;
}

export class Minimap {
  private readonly terrainLayer: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sx: number;
  private readonly sz: number;
  private territorySignature = '';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    terrain: TerrainType[],
    onPick: (x: number, z: number) => void,
  ) {
    const { tilesX, tilesZ } = world.settings;
    canvas.width = tilesX * 3;
    canvas.height = tilesZ * 3;
    this.sx = canvas.width / tilesX;
    this.sz = canvas.height / tilesZ;
    this.ctx = canvas.getContext('2d')!;
    this.terrainLayer = this.renderTerrain(terrain);
    this.overlay = document.createElement('canvas');
    this.overlay.width = canvas.width;
    this.overlay.height = canvas.height;

    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      const { halfX, halfZ } = worldHalfExtents(world);
      const u = (e.clientX - r.left) / r.width;
      const v = (e.clientY - r.top) / r.height;
      // الشمال (z الموجب) في أعلى الخريطة المصغرة / North (+z) is at the top of the minimap
      onPick(u * halfX * 2 - halfX, (1 - v) * halfZ * 2 - halfZ);
    });
  }

  /** حدود الدولة والعلامات؛ يُعاد الرسم عند التغير فقط / Borders and markers; redrawn only on change */
  setOverlay(territory: string[], markers: MinimapMarker[]): void {
    const signature = territory.length + ':' + markers.map((m) => `${m.x},${m.z},${m.emphasis}`).join(';') + ':' + territory.join(';');
    if (signature === this.territorySignature) return;
    this.territorySignature = signature;
    const c = this.overlay.getContext('2d')!;
    const { tilesZ } = this.world.settings;
    c.clearRect(0, 0, this.overlay.width, this.overlay.height);
    c.fillStyle = 'rgba(233,211,155,.35)';
    for (const key of territory) {
      const [x, z] = key.split(',').map(Number);
      c.fillRect(x * this.sx, (tilesZ - 1 - z) * this.sz, this.sx + 0.5, this.sz + 0.5);
    }
    for (const m of markers) {
      c.fillStyle = m.emphasis ? '#e9d39b' : 'rgba(255,255,255,.85)';
      c.strokeStyle = '#16221f';
      c.lineWidth = 2;
      c.beginPath();
      c.arc((m.x + 0.5) * this.sx, (tilesZ - 0.5 - m.z) * this.sz, m.emphasis ? 6 : 4, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  /** رسم موقع الكاميرا واتجاهها فوق الطبقات / Draw camera position and heading over the layers */
  update(targetX: number, targetZ: number, heading: number): void {
    const { width: w, height: h } = this.canvas;
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const px = ((targetX + halfX) / (halfX * 2)) * w;
    const py = (1 - (targetZ + halfZ) / (halfZ * 2)) * h;
    const c = this.ctx;
    c.drawImage(this.terrainLayer, 0, 0);
    c.drawImage(this.overlay, 0, 0);
    c.save();
    c.translate(px, py);
    c.rotate(heading);
    c.strokeStyle = '#e9d39b';
    c.fillStyle = 'rgba(233,211,155,.25)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-18, -26);
    c.lineTo(18, -26);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  private renderTerrain(terrain: TerrainType[]): HTMLCanvasElement {
    const { tilesZ } = this.world.settings;
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const c = out.getContext('2d')!;
    const colors = new Map(terrain.map((t) => [t.id, t.color]));
    for (const t of this.world.tiles) {
      c.fillStyle = colors.get(t.terrainId) ?? '#000';
      c.fillRect(t.x * this.sx, (tilesZ - 1 - t.z) * this.sz, this.sx + 0.5, this.sz + 0.5);
    }
    return out;
  }
}
