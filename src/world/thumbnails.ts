// مسؤولية الملف: صور مصغرة لبطاقات البناء تُرسم من نماذج المباني نفسها، في طبقة خاصة لا تراها كاميرا اللعبة
// File responsibility: build-card thumbnails rendered from the building models themselves, on a private layer the game camera never sees
//
// الرسم في نسيج مستقل بكاميرا خاصة، فلا تتغير كاميرا المشهد ولا يتأثر النقر أو السحب أثناءه.
// Rendering goes to a separate texture with its own camera, so the scene camera, clicks and drags are untouched meanwhile.

import { ArcRotateCamera, Color4, HemisphericLight, RenderTargetTexture, TransformNode, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { ModelLibrary } from '../assets/model-library';
import { partsFor, spawnParts } from './building-models';

/** طبقة الصور المصغرة: خارج طبقات المشهد الافتراضية / Thumbnail layer: outside the scene's default layers */
const THUMB_LAYER = 0x10000000;
/** موضع منصة التصوير تحت العالم / The photo stage, below the world */
const STAGE_Y = -400;
const WIDTH = 192;
const HEIGHT = 128;

export class Thumbnails {
  private readonly cache = new Map<string, Promise<string>>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly camera: ArcRotateCamera;
  private readonly light: HemisphericLight;

  constructor(private readonly scene: Scene, private readonly library: ModelLibrary, private readonly tileSize: number) {
    const active = scene.activeCamera;
    this.camera = new ArcRotateCamera('thumb-camera', -Math.PI / 3, 1.0, tileSize * 2, new Vector3(0, STAGE_Y, 0), scene);
    this.camera.layerMask = THUMB_LAYER;
    this.camera.minZ = 0.05;
    scene.activeCamera = active;
    this.light = new HemisphericLight('thumb-light', new Vector3(0.4, 1, -0.3), scene);
    this.light.intensity = 1.25;
    this.light.groundColor.set(0.35, 0.38, 0.4);
    this.light.includeOnlyWithLayerMask = THUMB_LAYER;
  }

  /**
   * صورة النمط (تُرسم مرة واحدة، والطلبات تُصف واحدًا تلو الآخر)
   * The style's picture (rendered once; requests are queued one after another)
   */
  get(style: string): Promise<string> {
    let pending = this.cache.get(style);
    if (!pending) {
      pending = this.queue.then(() => this.render(style));
      this.queue = pending.catch(() => undefined);
      this.cache.set(style, pending);
    }
    return pending;
  }

  private async render(style: string): Promise<string> {
    const holder = new TransformNode(`thumb-${style}`, this.scene);
    holder.position.y = STAGE_Y;
    const meshes = await spawnParts(this.library, this.scene, holder, partsFor(style, style), this.tileSize);
    for (const m of meshes) m.layerMask = THUMB_LAYER;
    const texture = new RenderTargetTexture(`thumb-rt-${style}`, { width: WIDTH, height: HEIGHT }, this.scene, false);
    texture.activeCamera = this.camera;
    texture.renderList = meshes;
    texture.clearColor = new Color4(0, 0, 0, 0);
    // إضاءة الصورة وحدها: أضواء المشهد (نهار أو ليل) لا تؤثر فيها / Only the thumbnail light: scene lights (day or night) stay out
    const others = this.scene.lights.filter((l) => l !== this.light);
    const saved = others.map((l) => l.excludeWithLayerMask);
    try {
      // تحديث مواضع كل الأجزاء (الأب قبل الابن) قبل قياس الحدود / Update every part's transform (parents first) before measuring bounds
      holder.computeWorldMatrix(true);
      for (const node of holder.getDescendants(false)) (node as TransformNode).computeWorldMatrix?.(true);
      const { min, max } = holder.getHierarchyBoundingVectors(true);
      const size = max.subtract(min);
      this.camera.target.copyFrom(min.add(size.scale(0.5)));
      this.camera.radius = Math.max(size.x, size.y, size.z) * 1.75;
      // الإضاءة تُضبط قبل فحص الجاهزية لأن تغييرها يعيد تجهيز المواد / Lights are set before the readiness check, since changing them recompiles materials
      others.forEach((l) => (l.excludeWithLayerMask |= THUMB_LAYER));
      await whenReady(texture, meshes);
      texture.render();
      const pixels = await texture.readPixels();
      if (!pixels) throw new Error('thumbnail read failed');
      return toDataUrl(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));
    } finally {
      others.forEach((l, i) => (l.excludeWithLayerMask = saved[i]));
      texture.dispose();
      holder.dispose();
    }
  }
}

/** انتظار جاهزية المواد والنسيج قبل الرسم / Wait for materials and the texture to be ready before rendering */
function whenReady(texture: RenderTargetTexture, meshes: AbstractMesh[]): Promise<void> {
  return new Promise((resolve) => {
    const check = () => (texture.isReadyForRendering() && meshes.every((m) => m.isReady(true)) ? resolve() : setTimeout(check, 30));
    check();
  });
}

/** بكسلات النسيج (من الأسفل للأعلى) إلى صورة PNG / Texture pixels (bottom-up) to a PNG data URL */
function toDataUrl(pixels: Uint8Array): string {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(WIDTH, HEIGHT);
  const row = WIDTH * 4;
  for (let y = 0; y < HEIGHT; y++) image.data.set(pixels.subarray((HEIGHT - 1 - y) * row, (HEIGHT - y) * row), y * row);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
