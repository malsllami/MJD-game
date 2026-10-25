// مسؤولية الملف: سطح البحر — ماء واقعي بانعكاسات أو بديل خفيف للأجهزة الضعيفة
// File responsibility: sea surface — realistic reflective water, or a light fallback for weak devices

import { Color3, DynamicTexture, MeshBuilder, Scene, StandardMaterial, Vector2, type AbstractMesh, type Mesh } from '@babylonjs/core';
import { WaterMaterial } from '@babylonjs/materials';

/**
 * ينشئ مستوى البحر عند الارتفاع صفر
 * Creates the sea plane at height zero
 */
export function createWater(scene: Scene, span: number, reflections: boolean, reflected: AbstractMesh[]): Mesh {
  // البحر يمتد بعيدًا حتى تختفي حافته في الضباب / The sea extends far enough for its edge to vanish into the fog
  const water = MeshBuilder.CreateGround('water', { width: span * 10, height: span * 10, subdivisions: 64 }, scene);
  water.isPickable = false;

  if (reflections) {
    const mat = new WaterMaterial('water-mat', scene, new Vector2(512, 512));
    mat.bumpTexture = createWaveNormalMap(scene);
    // بحر ثابت: بلا أمواج تتحرك ولا ارتفاع يغمر السواحل المنخفضة، مع ملمس سطح خفيف ثابت
    // A still sea: no moving waves and no swell flooding low shores, with a faint static surface texture
    mat.windForce = 0;
    mat.waveHeight = 0;
    mat.bumpHeight = 0.18;
    mat.waveLength = 0.12;
    mat.waveSpeed = 0;
    mat.waterColor = DAY_WATER.clone();
    mat.colorBlendFactor = 0.35;
    for (const m of reflected) mat.addToRenderList(m);
    water.material = mat;
  } else {
    const mat = new StandardMaterial('water-mat', scene);
    mat.diffuseColor = new Color3(0.13, 0.38, 0.47);
    mat.specularColor = new Color3(0.35, 0.35, 0.35);
    mat.specularPower = 64;
    mat.alpha = 0.88;
    water.material = mat;
  }
  return water;
}

const DAY_WATER = new Color3(0.1, 0.32, 0.42);
/** أزرق كحلي ليلًا، أوضح من السماء المظلمة التي يعكسها البحر / Night navy, clearer than the dark sky it reflects */
const NIGHT_WATER = new Color3(0.06, 0.16, 0.34);

/**
 * لون البحر حسب الوقت: ليلًا يقل انعكاس السماء المظلمة ويغلب لون البحر الكحلي
 * Sea colour by time: at night the dark-sky reflection fades and the navy sea colour dominates
 */
export function applyWaterNight(water: Mesh, night: number): void {
  const mat = water.material;
  if (mat instanceof WaterMaterial) {
    mat.waterColor = Color3.Lerp(DAY_WATER, NIGHT_WATER, night);
    mat.colorBlendFactor = 0.35 + 0.5 * night;
  } else if (mat instanceof StandardMaterial) {
    mat.diffuseColor = Color3.Lerp(new Color3(0.13, 0.38, 0.47), NIGHT_WATER, night);
    mat.emissiveColor = NIGHT_WATER.scale(0.35 * night);
  }
}

/**
 * يولّد خريطة اتجاهات (Normal map) قابلة للتكرار للأمواج دون أي ملف خارجي
 * Generates a tileable wave normal map procedurally — no external asset
 */
function createWaveNormalMap(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('water-bump', size, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  const waves = [
    [3, 1, 0.5], [1, 4, 0.35], [-5, 2, 0.2], [7, -3, 0.12], [2, -9, 0.08],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, a] of waves) {
        const phase = ((kx * x + ky * y) / size) * Math.PI * 2;
        const d = Math.cos(phase) * a;
        dx += d * kx;
        dy += d * ky;
      }
      const len = Math.hypot(dx * 0.08, dy * 0.08, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx * 0.08) / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy * 0.08) / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.update(false);
  return tex;
}
