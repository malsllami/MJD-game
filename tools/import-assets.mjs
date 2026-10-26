// مسؤولية الملف: أداة تطوير تستورد الأصول المجانية (CC0) إلى public/ بحجم مناسب للجوال — لا تعمل داخل اللعبة
// File responsibility: dev tool that imports the free (CC0) assets into public/ at a mobile-friendly size — never runs in the game
//
// الاستخدام / Usage:
//   node tools/import-assets.mjs --village <MegaKit glTF dir> --nature <Nature MegaKit glTF dir> \
//     --people <UAL2_Standard.glb> --ground 1
// المصادر (CC0) / Sources (CC0): Quaternius Medieval Village MegaKit, Stylized Nature MegaKit, Universal Animation Library 2
// (opengameart.org)، وخامات الأرض من Poly Haven / and ground textures from Poly Haven.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { prune, resample } from '@gltf-transform/functions';
import sharp from 'sharp';

const args = Object.fromEntries(process.argv.slice(2).reduce((out, a, i, all) => (a.startsWith('--') ? [...out, [a.slice(2), all[i + 1]]] : out), []));
const OUT = join(import.meta.dirname, '..', 'public');

/** قطع القرية المستخدمة / Village pieces in use */
const VILLAGE = [
  'Wall_Plaster_Straight', 'Wall_Plaster_WoodGrid', 'Wall_Plaster_Door_Round', 'Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Window_Thin_Round',
  'Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Door_Round', 'Wall_UnevenBrick_Window_Wide_Round', 'Wall_Arch',
  'Corner_Exterior_Wood', 'Corner_Exterior_Brick', 'Door_1_Round', 'DoorFrame_Round_WoodDark', 'Window_Wide_Round1', 'Window_Thin_Round1',
  'WindowShutters_Wide_Round_Open', 'Floor_WoodDark', 'Floor_Brick',
  'Roof_RoundTiles_4x4', 'Roof_RoundTiles_4x6', 'Roof_RoundTiles_6x6', 'Roof_RoundTiles_6x8', 'Roof_Front_Brick4', 'Roof_Front_Brick6',
  'Prop_Chimney', 'Prop_Chimney2', 'Prop_Wagon', 'Prop_Crate', 'Prop_WoodenFence_Single', 'Prop_WoodenFence_Extension1',
];
/** الطبيعة المستخدمة / Nature in use */
const NATURE = [
  'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'Pine_1', 'Pine_2', 'Pine_3', 'Pine_5',
  'Bush_Common_Flowers', 'Flower_3_Group', 'Flower_4_Group',
  'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Pebble_Round_1', 'Plant_1', 'Plant_1_Big', 'DeadTree_1',
];
/** الحركات المستخدمة من مكتبة الحركات 2 (هيكلها واحد، فلا تحتاج نقلًا بين هياكل) / Animations kept from library 2 (one skeleton, no retargeting) */
const PEOPLE_ANIMS = ['Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering', 'TreeChopping_Loop', 'Walk_Carry_Loop', 'Idle_FoldArms_Loop'];
/** خامات الأرض من Poly Haven / Ground textures from Poly Haven */
const GROUND = { grass: 'leafy_grass', dirt: 'dirt', soil: 'farm_furrows' };
/** عشب Poly Haven بني بأوراق متساقطة؛ يُحوّل لرمادي ثم يُلوَّن أخضر كالمروج مع بقاء تفاصيله / The Poly Haven grass is leafy brown; greyscaled then tinted lawn green, keeping its detail */
const GRASS_TINT = '#5a8c33';
/** تراب Poly Haven بني داكن؛ يُلوَّن رمليًا فتبدو الطرق الترابية رملية فاتحة / The Poly Haven dirt is dark brown; tinted sand so dirt roads look light and sandy */
const SAND_TINT = '#c9a46a';

/** أقصى ضلع لكل نوع خامة / Max side per texture kind */
const sideFor = (name) => (/normal|_nor|orm|rough/i.test(name) ? 512 : 1024);
/** الخامات التي تحتاج شفافية تبقى PNG / Textures needing alpha stay PNG */
const needsAlpha = (name) => /leaf|leaves|grass|flower|vine|glass|gradient/i.test(name);

/**
 * يحوّل قطع glTF إلى GLB بهندستها داخلها، وخاماتها المشتركة تُحوّل مرة واحدة إلى مجلد textures خارجها
 * Converts glTF pieces to GLB with their geometry inside; their shared textures are converted once into an outside textures folder
 */
async function importPieces(srcDir, names, outName, normalDir) {
  const out = join(OUT, 'models', outName);
  mkdirSync(join(out, 'textures'), { recursive: true });
  const done = new Set();
  for (const name of names) {
    const json = JSON.parse(readFileSync(join(srcDir, `${name}.gltf`), 'utf8'));
    if (json.buffers.length !== 1) throw new Error(`${name}: expected one buffer`);
    const bin = readFileSync(join(srcDir, json.buffers[0].uri));
    delete json.buffers[0].uri;
    for (const img of json.images ?? []) {
      const alpha = needsAlpha(img.uri);
      const target = img.uri.replace(/\.png$/i, alpha ? '.png' : '.jpg');
      if (!done.has(target)) {
        done.add(target);
        const glNormal = normalDir && existsSync(join(normalDir, img.uri)) ? join(normalDir, img.uri) : join(dirname(srcDir), 'Textures', img.uri);
        const source = existsSync(glNormal) ? glNormal : join(srcDir, img.uri);
        const side = sideFor(img.uri);
        if (alpha) await bleed(source, side, join(out, 'textures', target));
        else await sharp(source).resize(side, side, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#808080' }).jpeg({ quality: 82, mozjpeg: true }).toFile(join(out, 'textures', target));
      }
      img.uri = `textures/${target}`;
      img.mimeType = alpha ? 'image/png' : 'image/jpeg';
    }
    writeFileSync(join(out, `${name}.glb`), glb(json, bin));
  }
  console.log(`${outName}: ${names.length} قطعة، ${done.size} خامة`);
}

/**
 * خامة شفافة تُملأ مناطقها الشفافة بمتوسط لونها المرئي: بدون ذلك تختلط المناطق السوداء بالأوراق في المستويات الصغيرة
 * (mipmaps) فتبدو الأشجار داكنة من بعيد
 * An alpha texture whose transparent areas are filled with its visible average colour: otherwise black areas mix into leaves
 * at small mip levels and trees look dark from afar
 */
async function bleed(source, side, target) {
  const { data, info } = await sharp(source).resize(side, side, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    r += data[i] * a; g += data[i + 1] * a; b += data[i + 2] * a; n += a;
  }
  const mean = [r / n, g / n, b / n].map(Math.round);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * a + mean[c] * (1 - a));
  }
  await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(target);
}

/** حزمة GLB: رأس، ثم مقطع JSON، ثم مقطع BIN، كلٌّ بمحاذاة 4 بايت / A GLB: header, JSON chunk, BIN chunk, each 4-byte aligned */
function glb(json, bin) {
  const pad = (buf, fill) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);
  const text = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const data = pad(bin, 0);
  const chunk = (body, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(body.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, body]); };
  const body = Buffer.concat([chunk(text, 0x4e4f534a), chunk(data, 0x004e4942)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/** يبقي الحركات المطلوبة فقط ويحذف ما لا يُستخدم / Keeps only the wanted animations and prunes the rest */
async function importAnimations(src, keep, outFile) {
  const io = new NodeIO();
  const doc = await io.read(src);
  const root = doc.getRoot();
  // حذف الحركة لا يحذف بياناتها، فتُحذف قنواتها وعيّناتها، ثم يزيل prune ما لم يعد مستخدمًا (الأزمنة قد تكون مشتركة)
  // Disposing an animation keeps its data, so channels and samplers go too; prune then drops what is unused (times may be shared)
  for (const a of root.listAnimations()) {
    if (keep.includes(a.getName())) continue;
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  // حذف الإطارات المتكررة / Drop redundant keyframes
  await doc.transform(resample(), prune());
  mkdirSync(dirname(outFile), { recursive: true });
  await io.write(outFile, doc);
  console.log(`${basename(outFile)}: ${root.listAnimations().map((a) => a.getName()).join(', ')}`);
}

/** خامات الأرض بدقة 1k / Ground textures at 1k */
async function importGround() {
  const out = join(OUT, 'textures', 'ground');
  mkdirSync(out, { recursive: true });
  for (const [key, id] of Object.entries(GROUND)) {
    const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
    for (const [map, suffix] of [['Diffuse', 'color'], ['nor_gl', 'normal']]) {
      let buf = Buffer.from(await (await fetch(files[map]['1k'].jpg.url)).arrayBuffer());
      if (key === 'grass' && suffix === 'color') buf = await sharp(await sharp(buf).greyscale().linear(1.3, -25).toBuffer()).tint(GRASS_TINT).toBuffer();
      if (key === 'dirt' && suffix === 'color') buf = await sharp(await sharp(buf).greyscale().linear(0.7, 105).toBuffer()).tint(SAND_TINT).toBuffer();
      await sharp(buf).resize(suffix === 'normal' ? 512 : 1024).jpeg({ quality: 82, mozjpeg: true }).toFile(join(out, `${key}_${suffix}.jpg`));
    }
  }
  console.log('ground:', Object.keys(GROUND).join(', '));
}

if (args.village) await importPieces(args.village, VILLAGE, 'village', join(dirname(args.village), 'Textures', 'Normals Godot-Unity'));
if (args.nature) await importPieces(args.nature, NATURE, 'forest');
if (args.people) await importAnimations(args.people, PEOPLE_ANIMS, join(OUT, 'models', 'people', 'worker.glb'));
if (args.ground) await importGround();
