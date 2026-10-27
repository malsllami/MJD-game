// مسؤولية الملف: رسم الماء الطبيعي والآبار — برك بشاطئ غير منتظم وماء ضحل حول عمق أدكن وتموج خفيف وحجارة ونباتات حولها،
// وبئر القرية: حافة حجرية منخفضة وماء في داخله وإطار خشبي بدلو
// File responsibility: draws natural water and wells — ponds with an irregular shore, shallow water around a darker depth, a light ripple,
// and stones and plants around them; and the village well: a low stone rim with water inside and a timber frame with a bucket

import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture, type Scene, type ShadowGenerator } from '@babylonjs/core';
import type { ModelLibrary } from '../assets/model-library';
import { TILE_METRES } from '../assets/village-kit';
import { createNoise } from '../core/noise';
import type { World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';

/** نصف قطر الماء الضحل والعميق كنسبة من المربع / Shallow and deep water radius as a tile fraction */
const SHALLOW = 0.6;
const DEEP = 0.42;
/** سرعة انسياب التموج / How fast the ripple drifts */
const RIPPLE_SPEED = 0.012;
/** ما يُنثر على الشاطئ / What is scattered on the shore */
const SHORE = ['forest/Pebble_Round_1.glb', 'forest/Rock_Medium_2.glb', 'forest/Plant_1.glb', 'forest/Plant_1_Big.glb'];

/** يرسم البرك والآبار مرة واحدة / Draws the ponds and wells once */
export function drawWater(scene: Scene, world: World, library: ModelLibrary, shadows: ShadowGenerator | null): void {
  drawPonds(scene, world, library);
  for (const k of world.springs) drawWell(scene, world, k, shadows);
}

/**
 * البرك: لكل مربع قرصان (ضحل وعميق) بإزاحة وحجم من ضوضاء ثابتة فيصير الشاطئ غير منتظم، ثم حجارة ونباتات على الأطراف
 * Ponds: two discs per tile (shallow and deep) offset and sized by stable noise so the shore is irregular, then stones and plants at the edges
 */
function drawPonds(scene: Scene, world: World, library: ModelLibrary): void {
  if (!world.ponds.length) return;
  const s = world.settings.tileSize;
  const noise = createNoise(world.settings.seed + 606, 2);
  const shallow: Mesh[] = [];
  const deep: Mesh[] = [];
  const own = new Set(world.ponds);
  for (const k of world.ponds) {
    const [x, z] = k.split(',').map(Number);
    const c = tileCenter(world, x, z);
    const y = Math.max(0, sampleHeight(world, c.x, c.z));
    const wobble = (a: number) => (noise(x * 0.9 + a, z * 0.9 - a) - 0.5) * s * 0.18;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !own.has(`${x + dx},${z + dz}`)).length;
    const ring = MeshBuilder.CreateDisc('pond-shallow', { radius: s * SHALLOW * (0.92 + noise(x * 1.7, z * 1.7) * 0.2), tessellation: 20 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(c.x + wobble(1), y + 0.035, c.z + wobble(2));
    shallow.push(ring);
    const core = MeshBuilder.CreateDisc('pond-deep', { radius: s * DEEP * (edge ? 0.85 : 1.05), tessellation: 18 }, scene);
    core.rotation.x = Math.PI / 2;
    core.position.set(c.x + wobble(3) * 0.5, y + 0.05, c.z + wobble(4) * 0.5);
    deep.push(core);
    // حجارة ونباتات على الضلع المكشوف من الشاطئ / Stones and plants on the shore's open sides
    if (edge) {
      [0, 1].forEach((i) => {
        const a = noise(x * 3.1 + i, z * 2.3) * Math.PI * 2;
        const px = c.x + Math.cos(a) * s * 0.62;
        const pz = c.z + Math.sin(a) * s * 0.62;
        const path = SHORE[Math.floor(noise(x + i * 7, z) * SHORE.length) % SHORE.length];
        void library.spawn(path, { footprint: s * (path.includes('Plant') ? 0.16 : 0.12), yaw: a }).then(({ root }) => {
          root.position.set(px, Math.max(0, sampleHeight(world, px, pz)), pz);
        }).catch(() => undefined);
      });
    }
  }
  const merge = (parts: Mesh[], material: StandardMaterial) => {
    const m = Mesh.MergeMeshes(parts, true, true)!;
    m.material = material;
    m.isPickable = false;
  };
  const ripple = rippleTexture(scene);
  merge(shallow, pondMaterial(scene, 'pond-shallow', new Color3(0.32, 0.55, 0.58), 0.72, ripple));
  merge(deep, pondMaterial(scene, 'pond-deep', new Color3(0.12, 0.3, 0.42), 0.92, ripple));
  scene.onBeforeRenderObservable.add(() => {
    ripple.uOffset += RIPPLE_SPEED * scene.getEngine().getDeltaTime() / 1000;
    ripple.vOffset += RIPPLE_SPEED * 0.6 * scene.getEngine().getDeltaTime() / 1000;
  });
}

/** مادة ماء بلون وشفافية وتموج / A water material with a colour, transparency and a ripple */
function pondMaterial(scene: Scene, name: string, color: Color3, alpha: number, ripple: Texture): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.55, 0.62, 0.66);
  m.specularPower = 48;
  m.alpha = alpha;
  m.bumpTexture = ripple;
  return m;
}

/** خريطة تموج ناعمة من ضوضاء، تُكرر على سطح الماء / A soft ripple normal map from noise, tiled over the water */
export function rippleTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const t = new DynamicTexture('ripple', { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  const n = createNoise(77, 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = n(x * 0.09, y * 0.09);
      img.data[i] = 128 + (v - 0.5) * 50;
      img.data[i + 1] = 128 + (n(x * 0.09 + 9, y * 0.09) - 0.5) * 50;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  t.update();
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.uScale = 3;
  t.vScale = 3;
  t.level = 0.35;
  return t;
}

/**
 * بئر القرية: حافة حجرية منخفضة غير منتظمة، وماء داكن داخلها، وقائمتان خشبيتان بعارضة وحبل ودلو؛ صغير لا يملأ مربعه
 * The village well: a low, uneven stone rim, dark water inside, and two timber posts with a beam, a rope and a bucket; small, not filling its tile
 */
function drawWell(scene: Scene, world: World, key: string, shadows: ShadowGenerator | null): void {
  const m = world.settings.tileSize / TILE_METRES;
  const [x, z] = key.split(',').map(Number);
  const c = tileCenter(world, x, z);
  const y = Math.max(0, sampleHeight(world, c.x, c.z));
  const parts: { mesh: Mesh; material: StandardMaterial }[] = [];
  const stone = new StandardMaterial('well-stone', scene);
  stone.diffuseTexture = new Texture(`${import.meta.env.BASE_URL}models/village/textures/T_UnevenBrick_BaseColor.jpg`, scene, false, false);
  (stone.diffuseTexture as Texture).uScale = 3;
  stone.specularColor = new Color3(0.04, 0.04, 0.04);
  const wood = new StandardMaterial('well-wood', scene);
  wood.diffuseColor = new Color3(0.4, 0.28, 0.17);
  wood.specularColor = new Color3(0.03, 0.03, 0.03);
  const water = new StandardMaterial('well-water', scene);
  water.diffuseColor = new Color3(0.08, 0.2, 0.28);
  water.specularColor = new Color3(0.5, 0.55, 0.6);

  const rim = MeshBuilder.CreateCylinder('well-rim', { height: 0.75 * m, diameter: 2.2 * m, tessellation: 14 }, scene);
  rim.position.set(c.x, y + 0.375 * m, c.z);
  parts.push({ mesh: rim, material: stone });
  const inner = MeshBuilder.CreateDisc('well-water', { radius: 0.78 * m, tessellation: 16 }, scene);
  inner.rotation.x = Math.PI / 2;
  inner.position.set(c.x, y + 0.76 * m, c.z);
  parts.push({ mesh: inner, material: water });
  for (const side of [-1, 1]) {
    const post = MeshBuilder.CreateBox('well-post', { width: 0.16 * m, depth: 0.16 * m, height: 2.2 * m }, scene);
    post.position.set(c.x + side * 1.05 * m, y + 1.1 * m, c.z);
    parts.push({ mesh: post, material: wood });
  }
  const beam = MeshBuilder.CreateCylinder('well-beam', { height: 2.3 * m, diameter: 0.12 * m, tessellation: 8 }, scene);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(c.x, y + 2.05 * m, c.z);
  parts.push({ mesh: beam, material: wood });
  const rope = MeshBuilder.CreateCylinder('well-rope', { height: 0.9 * m, diameter: 0.03 * m, tessellation: 5 }, scene);
  rope.position.set(c.x, y + 1.6 * m, c.z);
  parts.push({ mesh: rope, material: wood });
  const bucket = MeshBuilder.CreateCylinder('well-bucket', { height: 0.32 * m, diameterTop: 0.36 * m, diameterBottom: 0.28 * m, tessellation: 10 }, scene);
  bucket.position.set(c.x, y + 1.05 * m, c.z);
  parts.push({ mesh: bucket, material: wood });
  for (const { mesh, material } of parts) {
    mesh.material = material;
    mesh.isPickable = false;
    shadows?.addShadowCaster(mesh);
  }
}
