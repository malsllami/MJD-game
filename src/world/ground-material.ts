// مسؤولية الملف: مادة أرض واقعية تمزج خامات Poly Haven — عشب متنوع اللون في كل مكان، وتراب تحت الطرق والمباني، وتربة محروثة تحت الحقول
// File responsibility: a realistic ground material blending Poly Haven textures — colour-varied grass everywhere, dirt under roads and buildings, tilled soil under fields
//
// خريطة المزج الأولى ترسم من حالة الدولة على لوحة رسم، ولا يُعاد رسمها إلا عند تغيّر ما يُرسم؛ والثانية بقع عشب جاف وداكن
// ثابتة من بذرة العالم تكسر تكرار الخامة، وتُمحى تحت التراب والتربة، وقناتها الزرقاء بلاط حجري لساحة مجمع الحكم.
// The first blend map is painted from the nation's state on a canvas, repainted only when what it shows changes; the second holds
// dry and lush grass patches fixed by the world seed that break up the texture's repetition, erased under dirt and soil, and its
// blue channel is stone paving for the government compound.

import { Color3, DynamicTexture, Texture, type Mesh, type Scene } from '@babylonjs/core';
import { MixMaterial } from '@babylonjs/materials/mix';
import { edgeCorners } from '../core/economy';
import { createNoise } from '../core/noise';
import type { World } from '../core/types';

const TEXTURES = `${import.meta.env.BASE_URL}textures/ground/`;
/** عدد المربعات التي تغطيها خامة العشب والتراب مرة واحدة / Tiles covered by one repeat of the grass and dirt textures */
const GRASS_REPEAT_TILES = 3;
/** بدائل العشب بتكرار مختلف حتى لا تتطابق نقوشها / Grass variants repeat differently so their patterns never line up */
const VARIANT_REPEAT_TILES = 4.3;
const SOIL_REPEAT_TILES = 1;
/** البلاط الحجري يتكرر كل نصف مربع فتبدو حجارته بحجم حقيقي / Paving repeats every half tile so its stones look life-size */
const PAVING_REPEAT_TILES = 0.5;
/** عرض الطريق الترابي كنسبة من المربع / Dirt road width as a tile fraction */
const ROAD_WIDTH = 0.24;
/** خفض سطوع الأرض كلها حتى لا يطغى العشب على المباني / Dims the whole ground so the grass never outshines the buildings */
const GROUND_TINT = new Color3(0.72, 0.75, 0.7);
/** عدد عينات الضوضاء لكل مربع في خريطة البقع / Noise samples per tile in the patch map */
const PATCH_SAMPLES = 4;
/** حلقات التدرج حول التراب: كل حلقة أوسع وأخف من التي قبلها / Fade rings around dirt: each ring wider and fainter than the last */
const FADE_RINGS = [{ grow: 0.2, alpha: 0.16 }, { grow: 0.13, alpha: 0.24 }, { grow: 0.07, alpha: 0.4 }, { grow: -0.02, alpha: 1 }];

/** ما يُرسم على الأرض / What is painted on the ground */
export interface GroundMarks {
  /** مربعات التراب: المباني ومبنى الحكم / Dirt tiles: buildings and the government building */
  dirt: { x: number; z: number }[];
  /** مربعات التربة المحروثة: الحقول / Tilled soil tiles: fields */
  soil: { x: number; z: number }[];
  /** حواف الطرق / Road edges */
  roads: string[];
  /** مستطيلات البلاط الحجري بإحداثيات المربعات، وأحواض الحدائق المحفورة منها / Paving rectangles in tile coordinates, and the garden beds cut from them */
  paving?: Rect[];
  gardens?: Rect[];
}

/** مستطيل بإحداثيات المربعات (قد تكون كسرية) / A rectangle in tile coordinates (may be fractional) */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export class GroundPainter {
  private readonly mask: DynamicTexture;
  private readonly patches: DynamicTexture;
  /** بقع العشب قبل محوها تحت التراب، تُرسم مرة واحدة / Grass patches before erasing under dirt, drawn once */
  private readonly patchBase: HTMLCanvasElement;
  private readonly px: number;
  private signature = '';

  constructor(scene: Scene, mesh: Mesh, world: World, resolution: number) {
    const { tilesX, tilesZ } = world.settings;
    this.px = resolution / Math.max(tilesX, tilesZ);
    const size = { width: Math.round(tilesX * this.px), height: Math.round(tilesZ * this.px) };
    this.mask = new DynamicTexture('ground-mask', size, scene, true);
    this.patches = new DynamicTexture('ground-patches', size, scene, true);
    for (const t of [this.mask, this.patches]) {
      t.wrapU = Texture.CLAMP_ADDRESSMODE;
      t.wrapV = Texture.CLAMP_ADDRESSMODE;
    }
    this.patchBase = patchCanvas(world, size.width, size.height);

    const material = new MixMaterial('ground-mat', scene);
    material.mixTexture1 = this.mask;
    material.mixTexture2 = this.patches;
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
    material.diffuseTexture5 = layer('grass_dry', VARIANT_REPEAT_TILES);
    material.diffuseTexture6 = layer('grass_lush', VARIANT_REPEAT_TILES);
    material.diffuseTexture7 = layer('paving', PAVING_REPEAT_TILES);
    material.diffuseTexture8 = material.diffuseTexture1;
    material.diffuseColor = GROUND_TINT;
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
    // الأحمر = العشب، الأخضر = التراب، الأزرق = التربة، والشفافية كاملة / Red = grass, green = dirt, blue = soil, full alpha
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgb(255,0,0)';
    ctx.fillRect(0, 0, width, height);
    this.drawMarks(ctx, marks, 'rgb(255,255,0)', 'rgb(255,0,255)');
    ctx.globalAlpha = 1;
    this.mask.update(false);

    // البقع تُمحى تحت التراب والتربة حتى لا تغطيهما / Patches are erased under dirt and soil so they never cover them
    const pc = this.patches.getContext() as CanvasRenderingContext2D;
    pc.globalAlpha = 1;
    pc.drawImage(this.patchBase, 0, 0);
    this.drawMarks(pc, marks, 'rgb(0,0,0)', 'rgb(0,0,0)');
    pc.globalAlpha = 1;
    // البلاط في القناة الزرقاء، والحدائق عشب داكن داخله / Paving in the blue channel, gardens as lush grass inside it
    const px = this.px;
    const fill = (rects: Rect[] | undefined, color: string) => {
      pc.fillStyle = color;
      for (const r of rects ?? []) pc.fillRect(r.x0 * px, r.z0 * px, (r.x1 - r.x0) * px, (r.z1 - r.z0) * px);
    };
    fill(marks.paving, 'rgb(0,0,255)');
    fill(marks.gardens, 'rgb(0,150,0)');
    this.patches.update(false);
  }

  /** رسم التراب (المباني والطرق) والتربة بحواف متدرجة / Draw dirt (buildings and roads) and soil with faded edges */
  private drawMarks(ctx: CanvasRenderingContext2D, marks: GroundMarks, dirt: string, soil: string): void {
    const px = this.px;
    // حلقات متتالية تتسع وتخف فيذوب التراب في العشب تدريجيًا / Successive wider, fainter rings so dirt melts into the grass
    const faded = (draw: (grow: number) => void) => {
      for (const ring of FADE_RINGS) {
        ctx.globalAlpha = ring.alpha;
        draw(px * ring.grow);
      }
    };
    ctx.fillStyle = dirt;
    ctx.strokeStyle = dirt;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    faded((grow) => {
      for (const t of marks.dirt) roundSquare(ctx, t.x * px + px * 0.08 - grow, t.z * px + px * 0.08 - grow, px * 0.84 + grow * 2, px * 0.18 + grow);
      ctx.lineWidth = px * ROAD_WIDTH + grow * 2;
      ctx.beginPath();
      for (const edge of marks.roads) {
        const [[ax, az], [bx, bz]] = edgeCorners(edge);
        ctx.moveTo(ax * px, az * px);
        ctx.lineTo(bx * px, bz * px);
      }
      ctx.stroke();
    });
    ctx.fillStyle = soil;
    faded((grow) => {
      for (const t of marks.soil) roundSquare(ctx, t.x * px + px * 0.06 - grow, t.z * px + px * 0.06 - grow, px * 0.88 + grow * 2, px * 0.1 + grow);
    });
  }
}

/** مربع بزوايا مستديرة؛ الضلع side والقطر radius / A rounded square of side and corner radius */
function roundSquare(ctx: CanvasRenderingContext2D, x: number, y: number, side: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, side, side, Math.max(0, Math.min(radius, side / 2)));
  ctx.fill();
}

/**
 * بقع العشب: الأحمر عشب جاف والأخضر عشب داكن، من ضوضاء ناعمة ببذرة العالم، تُكبَّر بتنعيم إلى حجم الخريطة
 * Grass patches: red is dry grass and green lush grass, from smooth noise by the world seed, upscaled smoothly to the map size
 */
function patchCanvas(world: World, width: number, height: number): HTMLCanvasElement {
  const { tilesX, tilesZ, seed } = world.settings;
  const w = tilesX * PATCH_SAMPLES;
  const h = tilesZ * PATCH_SAMPLES;
  const dry = createNoise(seed + 303, 4);
  const lush = createNoise(seed + 404, 4);
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d')!;
  const img = sctx.createImageData(w, h);
  // منحنى يحوّل الضوضاء إلى بقع متفرقة بحواف ناعمة / A curve turning noise into scattered soft-edged patches
  const patch = (n: number, from: number, to: number, peak: number) => Math.round(255 * peak * Math.min(1, Math.max(0, (n - from) / (to - from))));
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = (z * w + x) * 4;
      img.data[i] = patch(dry(x * 0.045, z * 0.045), 0.52, 0.7, 0.75);
      img.data[i + 1] = patch(lush(x * 0.06, z * 0.06), 0.5, 0.68, 0.65);
      img.data[i + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, width, height);
  return out;
}
