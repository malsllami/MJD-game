// مسؤولية الملف: مادة أرض واقعية تمزج خامات Poly Haven — عشب في كل مكان، وتراب تحت الطرق والمباني، وتربة محروثة تحت الحقول
// File responsibility: a realistic ground material blending Poly Haven textures — grass everywhere, dirt under roads and buildings, tilled soil under fields
//
// خريطة المزج ترسم من حالة الدولة على لوحة رسم، ولا يُعاد رسمها إلا عند تغيّر ما يُرسم.
// The blend map is painted from the nation's state on a canvas, and repainted only when what it shows changes.

import { Color3, DynamicTexture, Texture, type Mesh, type Scene } from '@babylonjs/core';
import { MixMaterial } from '@babylonjs/materials/mix';
import { edgeCorners } from '../core/economy';
import type { World } from '../core/types';

const TEXTURES = `${import.meta.env.BASE_URL}textures/ground/`;
/** عدد المربعات التي تغطيها خامة العشب والتراب مرة واحدة / Tiles covered by one repeat of the grass and dirt textures */
const GRASS_REPEAT_TILES = 3;
const SOIL_REPEAT_TILES = 1;
/** عرض الطريق الترابي كنسبة من المربع / Dirt road width as a tile fraction */
const ROAD_WIDTH = 0.34;

/** ما يُرسم على الأرض / What is painted on the ground */
export interface GroundMarks {
  /** مربعات التراب: المباني ومبنى الحكم / Dirt tiles: buildings and the government building */
  dirt: { x: number; z: number }[];
  /** مربعات التربة المحروثة: الحقول / Tilled soil tiles: fields */
  soil: { x: number; z: number }[];
  /** حواف الطرق / Road edges */
  roads: string[];
}

export class GroundPainter {
  private readonly mask: DynamicTexture;
  private readonly px: number;
  private signature = '';

  constructor(scene: Scene, mesh: Mesh, world: World, resolution: number) {
    const { tilesX, tilesZ } = world.settings;
    this.px = resolution / Math.max(tilesX, tilesZ);
    this.mask = new DynamicTexture('ground-mask', { width: Math.round(tilesX * this.px), height: Math.round(tilesZ * this.px) }, scene, true);
    this.mask.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.mask.wrapV = Texture.CLAMP_ADDRESSMODE;

    const material = new MixMaterial('ground-mat', scene);
    material.mixTexture1 = this.mask;
    const layer = (name: string, repeat: number) => {
      const t = new Texture(`${TEXTURES}${name}_color.jpg`, scene);
      t.uScale = tilesX / repeat;
      t.vScale = tilesZ / repeat;
      t.anisotropicFilteringLevel = 8;
      return t;
    };
    material.diffuseTexture1 = layer('grass', GRASS_REPEAT_TILES);
    material.diffuseTexture2 = layer('dirt', GRASS_REPEAT_TILES);
    material.diffuseTexture3 = layer('soil', SOIL_REPEAT_TILES);
    material.diffuseTexture4 = material.diffuseTexture1;
    material.specularColor = new Color3(0.02, 0.02, 0.02);
    mesh.material = material;
    this.paint({ dirt: [], soil: [], roads: [] });
  }

  /** رسم العلامات على الأرض إن تغيّرت / Paint the marks on the ground if they changed */
  paint(marks: GroundMarks): void {
    const signature = JSON.stringify(marks);
    if (signature === this.signature) return;
    this.signature = signature;
    const ctx = this.mask.getContext() as CanvasRenderingContext2D;
    const { width, height } = this.mask.getSize();
    const px = this.px;
    // الأحمر = العشب، الأخضر = التراب، الأزرق = التربة، والشفافية كاملة / Red = grass, green = dirt, blue = soil, full alpha
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgb(255,0,0)';
    ctx.fillRect(0, 0, width, height);
    // حواف ناعمة: طبقة عريضة خفيفة ثم طبقة أضيق كاملة / Soft edges: a wide faint pass, then a narrower full pass
    const soft = (draw: (grow: number) => void) => {
      ctx.globalAlpha = 0.45;
      draw(px * 0.08);
      ctx.globalAlpha = 1;
      draw(-px * 0.02);
    };
    ctx.fillStyle = 'rgb(255,255,0)';
    ctx.strokeStyle = 'rgb(255,255,0)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    soft((grow) => {
      for (const t of marks.dirt) ctx.fillRect(t.x * px + px * 0.08 - grow, t.z * px + px * 0.08 - grow, px * 0.84 + grow * 2, px * 0.84 + grow * 2);
      ctx.lineWidth = px * ROAD_WIDTH + grow * 2;
      ctx.beginPath();
      for (const edge of marks.roads) {
        const [[ax, az], [bx, bz]] = edgeCorners(edge);
        ctx.moveTo(ax * px, az * px);
        ctx.lineTo(bx * px, bz * px);
      }
      ctx.stroke();
    });
    ctx.fillStyle = 'rgb(255,0,255)';
    soft((grow) => {
      for (const t of marks.soil) ctx.fillRect(t.x * px + px * 0.06 - grow, t.z * px + px * 0.06 - grow, px * 0.88 + grow * 2, px * 0.88 + grow * 2);
    });
    ctx.globalAlpha = 1;
    this.mask.update(false);
  }
}
