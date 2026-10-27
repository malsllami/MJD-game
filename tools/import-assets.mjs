// مسؤولية الملف: أداة تطوير تستورد الأصول المجانية (CC0) إلى public/ بحجم مناسب للجوال — لا تعمل داخل اللعبة
// File responsibility: dev tool that imports the free (CC0) assets into public/ at a mobile-friendly size — never runs in the game
//
// الاستخدام / Usage:
//   node tools/import-assets.mjs --village <MegaKit glTF dir> --nature <Nature MegaKit glTF dir> \
//     --people <UAL2_Standard.glb> --characters <Universal Base Characters dir> --outfits <Modular Character Outfits dir> \
//     --animals <Farm Animals OBJ dir> --ground 1 --grass-variants 1 --paving 1
// المصادر (CC0) / Sources (CC0): Quaternius Medieval Village MegaKit, Stylized Nature MegaKit, Universal Animation Library 2,
// (opengameart.org)، و Universal Base Characters و Modular Character Outfits - Fantasy (quaternius.itch.io)، وخامات الأرض من Poly Haven / and ground textures from Poly Haven.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Accessor, Document, Format, NodeIO } from '@gltf-transform/core';
import { compactPrimitive, joinPrimitives, mergeDocuments, prune, resample, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import obj2gltf from 'obj2gltf';
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
  'Prop_Vine1', 'Balcony_Simple_Straight', 'Prop_MetalFence_Ornament', 'Prop_Support',
  // قاعة الحكم الكبيرة وبرجها / The large government hall and its tower
  'Roof_RoundTiles_8x8', 'Roof_RoundTiles_8x10', 'Roof_RoundTiles_8x12', 'Roof_Front_Brick8', 'Roof_Tower_RoundTiles',
];
/** الطبيعة المستخدمة / Nature in use */
const NATURE = [
  'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'Pine_1', 'Pine_2', 'Pine_3', 'Pine_5',
  'Bush_Common_Flowers', 'Flower_3_Group', 'Flower_4_Group',
  'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Pebble_Round_1', 'Plant_1', 'Plant_1_Big', 'DeadTree_1',
];
/** الحركات المستخدمة من مكتبة الحركات 2 (هيكلها واحد، فلا تحتاج نقلًا بين هياكل) / Animations kept from library 2 (one skeleton, no retargeting) */
const PEOPLE_ANIMS = ['Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering', 'TreeChopping_Loop', 'Walk_Carry_Loop', 'Idle_FoldArms_Loop', 'Yes', 'Chest_Open', 'Consume'];
/** حيوانات الحظائر من حزمة Quaternius للحيوانات / Barn animals from Quaternius's farm animal pack */
const ANIMALS = ['Cow', 'Sheep', 'Pig', 'Horse'];

/**
 * ألوان القرميد البديلة: خامة القرميد الأصلية تُحوّل لرمادي ثم تُلوَّن، فتبقى تفاصيلها ويتميز كل نوع مبنى بلون سقفه
 * Alternate roof-tile colours: the original tile texture greyscaled then tinted, keeping its detail so each building kind has its own roof colour
 */
const ROOF_COLORS = { Green: '#2f6b2e', Slate: '#4a5d70', Brown: '#6b3f24', Wine: '#7d1f22' };

/** خامات الأرض من Poly Haven / Ground textures from Poly Haven */
const GROUND = { grass: 'leafy_grass', dirt: 'dirt', soil: 'farm_furrows' };
/** عشب Poly Haven بني بأوراق متساقطة؛ يُحوّل لرمادي ثم يُلوَّن أخضر كالمروج مع بقاء تفاصيله / The Poly Haven grass is leafy brown; greyscaled then tinted lawn green, keeping its detail */
const GRASS_TINT = '#5a8c33';
/** تراب Poly Haven بني داكن؛ يُلوَّن رمليًا فتبدو الطرق الترابية رملية فاتحة / The Poly Haven dirt is dark brown; tinted sand so dirt roads look light and sandy */
const SAND_TINT = '#c9a46a';

/**
 * بدائل العشب لتنويع لون الأرض: عشب جاف مصفر وعشب كثيف داكن، يُولَّدان من خامة العشب نفسها
 * Grass variants to vary the ground colour: dry yellowish grass and lush dark grass, both derived from the grass texture itself
 */
/** بلاط حجري لساحة مجمع الحكم من Poly Haven / Stone paving for the government compound from Poly Haven */
const PAVING = 'cobblestone_floor_01';
const GRASS_VARIANTS = { dry: { saturation: 0.62, hue: -14, brightness: 1.02 }, lush: { saturation: 1.05, hue: 6, brightness: 0.72 } };

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

/**
 * يبقي الحركات المطلوبة فقط ويحذف المجسم، فيبقى الهيكل وحركاته مكتبةً تُربط بالشخصيات بأسماء العظام
 * Keeps only the wanted animations and drops the mesh, leaving the skeleton and its motions as a library bound to characters by bone name
 */
async function importAnimations(src, keep, outFile) {
  const io = new NodeIO();
  const doc = await io.read(src);
  const root = doc.getRoot();
  for (const n of root.listNodes()) if (n.getMesh()) n.dispose();
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

/**
 * قراءة glTF مع تجاوز الخامات الناقصة في الحزمة (تُستبدل بصورة 1×1؛ الخامات الفعلية تُضبط لاحقًا)
 * Reads a glTF tolerating textures missing from the pack (replaced by a 1×1 image; the real textures are set later)
 */
async function readGltf(io, file) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const resources = {};
  for (const b of json.buffers ?? []) resources[b.uri] = readFileSync(join(dirname(file), decodeURIComponent(b.uri)));
  for (const im of json.images ?? []) {
    const path = join(dirname(file), decodeURIComponent(im.uri));
    resources[im.uri] = existsSync(path) ? readFileSync(path) : TINY_PNG;
  }
  return io.readJSON({ json, resources });
}
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/**
 * يقتطع الرأس والرقبة من الجسم الكامل حسب أوزان العظام: يبقى كل مثلث تتبع رؤوسه الثلاثة عظام الرأس
 * Cuts the head and neck out of the full body by bone weights: a triangle stays when all three vertices follow head bones
 */
function cutHead(prim, joints, headBones) {
  const J = prim.getAttribute('JOINTS_0');
  const W = prim.getAttribute('WEIGHTS_0');
  const keep = new Uint8Array(J.getCount());
  const j = [], w = [];
  for (let v = 0; v < keep.length; v++) {
    J.getElement(v, j);
    W.getElement(v, w);
    const top = w.indexOf(Math.max(...w));
    keep[v] = headBones.has(joints[j[top]].getName()) ? 1 : 0;
  }
  const src = prim.getIndices().getArray();
  const out = [];
  for (let t = 0; t < src.length; t += 3) if (keep[src[t]] && keep[src[t + 1]] && keep[src[t + 2]]) out.push(src[t], src[t + 1], src[t + 2]);
  prim.getIndices().setArray(new Uint32Array(out));
  compactPrimitive(prim);
}

/**
 * يجمع كل قطع الشخصية على هيكل واحد وجلد واحد وشبكة واحدة؛ الهياكل المدموجة متطابقة (نفس الحزمة) فتُربط بالاسم
 * Gathers every character part onto one skeleton, one skin and one mesh; the merged skeletons are identical (same kit) so they bind by name
 */
/** أنواع موحدة للعظام والأوزان حتى تُدمج القطع / Uniform bone and weight types so parts can be joined */
function unifyAccessors(doc, prim) {
  const I = prim.getIndices();
  if (I.getComponentType() !== Accessor.ComponentType.UNSIGNED_INT) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I.getArray())).setBuffer(I.getBuffer()));
  const J = prim.getAttribute('JOINTS_0');
  if (J.getComponentType() !== Accessor.ComponentType.UNSIGNED_SHORT) prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(new Uint16Array(J.getArray())).setBuffer(J.getBuffer()));
  const W = prim.getAttribute('WEIGHTS_0');
  if (W.getComponentType() !== Accessor.ComponentType.FLOAT || W.getNormalized()) {
    const out = new Float32Array(W.getCount() * 4);
    const v = [];
    for (let i = 0; i < W.getCount(); i++) out.set(W.getElement(i, v), i * 4);
    prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(out).setBuffer(W.getBuffer()));
  }
}

function unifySkeleton(doc) {
  const root = doc.getRoot();
  const [skin, ...others] = root.listSkins();
  const index = new Map(skin.listJoints().map((n, i) => [n.getName(), i]));
  const parts = root.listNodes().filter((n) => n.getMesh());
  const [holder] = parts;
  const mesh = holder.getMesh();
  for (const node of parts) {
    const own = node.getSkin();
    const remap = own.listJoints().map((n) => index.get(n.getName()));
    if (remap.some((r) => r === undefined)) throw new Error(`${node.getName()}: unknown bone`);
    for (const prim of node.getMesh().listPrimitives()) {
      if (own !== skin && remap.some((r, i) => r !== i)) {
        // ترتيب العظام يختلف فتُعاد أرقامها / Bone order differs, so the indices are renumbered
        const joints = prim.getAttribute('JOINTS_0').clone();
        const v = [];
        for (let i = 0; i < joints.getCount(); i++) joints.setElement(i, joints.getElement(i, v).map((x) => remap[x]));
        prim.setAttribute('JOINTS_0', joints);
      }
      if (node !== holder) mesh.addPrimitive(prim);
    }
  }
  holder.setSkin(skin);
  for (const node of parts) if (node !== holder) node.dispose();
  // هياكل القطع المدموجة ومشاهدها لم تعد مستخدمة / The merged parts' skeletons and scenes are no longer used
  for (const s of others) s.dispose();
  for (const scene of root.listScenes().slice(1)) {
    scene.traverse((n) => n !== holder && n.dispose());
    scene.dispose();
  }
  const [buffer] = root.listBuffers();
  for (const a of root.listAccessors()) a.setBuffer(buffer);
  for (const b of root.listBuffers().slice(1)) b.dispose();
}

/**
 * الشخصيات بالملابس: ملابس الحزمة + رأس الشخصية الأساسية (بخامة جلد الملابس، فتخطيطها واحد) + شعر، بلا حركات
 * Dressed characters: the kit outfit + the base character's head (with the outfit skin texture, same layout) + hair, without motions
 */
const CHARACTERS = [
  { name: 'male_peasant', sex: 'Male', outfit: 'Male_Peasant', hair: ['Hair_SimpleParted'] },
  { name: 'female_peasant', sex: 'Female', outfit: 'Female_Peasant', hair: ['Hair_Buns'] },
  { name: 'male_ranger', sex: 'Male', outfit: 'Male_Ranger', hair: [] },
  { name: 'female_ranger', sex: 'Female', outfit: 'Female_Ranger', hair: [] },
];
/** خصائص الرؤوس التي تحتاجها اللعبة / The vertex attributes the game needs */
const CHARACTER_ATTRIBUTES = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']);
/** خامات الألوان: الأساسية لكل مادة، والبديلة تختارها اللعبة للتنويع / Colour textures: the base per material, the alternates the game picks for variety */
const CHARACTER_TEXTURES = {
  Peasant: ['Peasant/T_Peasant_BaseColor', 'Peasant/T_Peasant_2_BaseColor'],
  Ranger: ['Ranger/T_Ranger_BaseColor', 'Ranger/T_Ranger_3_BaseColor'],
};

async function importCharacters(baseDir, outfitDir) {
  const io = new NodeIO();
  const out = join(OUT, 'models', 'people');
  mkdirSync(join(out, 'textures'), { recursive: true });
  const done = new Set();
  /** خامة لون واحدة بحجم مناسب، تُحوّل مرة واحدة / One colour texture at a fitting size, converted once */
  const texture = async (doc, source, side) => {
    const name = basename(source).replace(/\.png$/i, '');
    if (!done.has(name)) {
      done.add(name);
      await sharp(source).resize(side, side, { fit: 'inside' }).flatten({ background: '#808080' }).jpeg({ quality: 84, mozjpeg: true }).toFile(join(out, 'textures', `${name}.jpg`));
    }
    // الصورة تبقى ملفًا خارجيًا مشتركًا؛ تُقرأ هنا فقط ليعرف المحوّل حجمها / The image stays a shared outside file; read here only so the converter knows its size
    return doc.createTexture(name).setURI(`textures/${name}.jpg`).setMimeType('image/jpeg').setImage(readFileSync(join(out, 'textures', `${name}.jpg`)));
  };
  const baseChars = join(baseDir, 'Base Characters');
  const hairDir = join(baseDir, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)');
  for (const c of CHARACTERS) {
    const doc = await readGltf(io, join(outfitDir, 'Exports', 'glTF (Godot-Unreal)', 'Outfits', `${c.outfit}.gltf`));
    const head = await readGltf(io, join(baseChars, 'Godot - UE', `Superhero_${c.sex}_FullBody.gltf`));
    // عظام الرأس: الرقبة والرأس وما تحته / Head bones: the neck, the head and everything under it
    const headBones = new Set(['neck_01']);
    head.getRoot().listNodes().find((n) => n.getName() === 'Head').traverse((n) => headBones.add(n.getName()));
    for (const node of head.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      for (const prim of mesh.listPrimitives()) if (/Superhero/.test(prim.getMaterial()?.getName() ?? '')) cutHead(prim, node.getSkin().listJoints(), headBones);
    }
    mergeDocuments(doc, head);
    for (const h of c.hair) mergeDocuments(doc, await readGltf(io, join(hairDir, `${h}.gltf`)));
    unifySkeleton(doc);

    // مواد بسيطة بخامة لون فقط: الشخصيات صغيرة في الكاميرا الاستراتيجية فلا حاجة لخرائط النتوء
    // Simple materials with a colour texture only: characters are small in the strategy camera, so no bump maps are needed
    const made = new Map();
    const material = async (kind) => {
      if (made.has(kind)) return made.get(kind);
      const [source, side, rough] = {
        Peasant: [join(outfitDir, 'Textures', `${CHARACTER_TEXTURES.Peasant[0]}.png`), 1024, 0.9],
        Ranger: [join(outfitDir, 'Textures', `${CHARACTER_TEXTURES.Ranger[0]}.png`), 1024, 0.85],
        Skin: [join(outfitDir, 'Textures', 'Base', `T_Regular_${c.sex}_Dark_BaseColor.png`), 512, 0.7],
        Hair_1: [join(baseDir, 'Hairstyles', 'Textures', 'T_Hair_1_BaseColor.png'), 256, 0.8],
        Hair_2: [join(baseDir, 'Hairstyles', 'Textures', 'T_Hair_2_BaseColor.png'), 256, 0.8],
        Eyes: [join(baseChars, 'Textures', 'T_Eye_Brown.png'), 128, 0.3],
      }[kind];
      const m = doc.createMaterial(`M_${kind}`).setBaseColorTexture(await texture(doc, source, side)).setMetallicFactor(0).setRoughnessFactor(rough);
      made.set(kind, m);
      return m;
    };
    for (const prim of doc.getRoot().listMeshes()[0].listPrimitives()) {
      const name = prim.getMaterial()?.getName() ?? '';
      const kind = /Peasant/.test(name) ? 'Peasant' : /Ranger/.test(name) ? 'Ranger' : /Hair_1/.test(name) ? 'Hair_1' : /Hair_2/.test(name) ? 'Hair_2' : /Eye/.test(name) ? 'Eyes' : 'Skin';
      prim.setMaterial(await material(kind));
      // ألوان الرؤوس وإحداثيات الخامة الثانية غير مستخدمة، ووجودها في بعض القطع فقط يمنع دمجها
      // Vertex colours and second UVs are unused, and having them on some parts only blocks joining
      for (const semantic of prim.listSemantics()) if (!CHARACTER_ATTRIBUTES.has(semantic)) prim.setAttribute(semantic, null);
    }
    // دمج القطع ذات المادة الواحدة يقلل أوامر الرسم لكل شخص / Joining parts that share a material cuts each person's draw calls
    // وتبسيط الهندسة الكثيفة (الأحذية وحدها 10 آلاف رأس) بخطأ لا يُرى من الكاميرا / and simplifying dense geometry (the boots alone are 10k vertices) within an error invisible from the camera
    const mesh = doc.getRoot().listMeshes()[0];
    for (const m of made.values()) {
      const group = mesh.listPrimitives().filter((p) => p.getMaterial() === m);
      if (group.length < 2) continue;
      for (const p of group) unifyAccessors(doc, p);
      mesh.addPrimitive(joinPrimitives(group));
      for (const p of group) p.dispose();
    }
    await doc.transform(prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.006 }), prune());
    const { json, resources } = await io.writeJSON(doc, { format: Format.GLTF });
    const bin = Buffer.from(resources[json.buffers[0].uri]);
    delete json.buffers[0].uri;
    writeFileSync(join(out, `${c.name}.glb`), glb(json, bin));
    console.log(`${c.name}: ${json.meshes[0].primitives.length} مادة`);
  }
  // الألوان البديلة / The alternate colourways
  for (const list of Object.values(CHARACTER_TEXTURES)) for (const t of list.slice(1)) await texture(new Document(), join(outfitDir, 'Textures', `${t}.png`), 1024);
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

/** بلاط الساحة بدقة 1k، أفتح قليلًا حتى يبرز تحت ضوء المشهد / Forecourt paving at 1k, slightly lighter so it stands out under the scene light */
async function importPaving() {
  const out = join(OUT, 'textures', 'ground');
  const files = await (await fetch(`https://api.polyhaven.com/files/${PAVING}`)).json();
  for (const [map, suffix] of [['Diffuse', 'color'], ['nor_gl', 'normal']]) {
    let buf = Buffer.from(await (await fetch(files[map]['1k'].jpg.url)).arrayBuffer());
    if (suffix === 'color') buf = await sharp(buf).modulate({ brightness: 1.15, saturation: 0.8 }).toBuffer();
    await sharp(buf).resize(suffix === 'normal' ? 512 : 1024).jpeg({ quality: 82, mozjpeg: true }).toFile(join(out, `paving_${suffix}.jpg`));
  }
  console.log('paving:', PAVING);
}

/** بدائل العشب من خامة العشب المستوردة / Grass variants from the imported grass texture */
async function importGrassVariants() {
  const dir = join(OUT, 'textures', 'ground');
  for (const [name, tone] of Object.entries(GRASS_VARIANTS)) {
    // تدوير ربع دورة حتى لا يتطابق نقش البديل مع الأصل / A quarter turn so the variant's pattern does not line up with the original
    await sharp(join(dir, 'grass_color.jpg')).rotate(90).modulate(tone).jpeg({ quality: 82, mozjpeg: true }).toFile(join(dir, `grass_${name}_color.jpg`));
  }
  console.log('grass variants:', Object.keys(GRASS_VARIANTS).join(', '));
}

if (args.village) {
  await importPieces(args.village, VILLAGE, 'village', join(dirname(args.village), 'Textures', 'Normals Godot-Unity'));
  for (const [name, tint] of Object.entries(ROOF_COLORS)) {
    const grey = await sharp(join(dirname(args.village), 'Textures', 'T_RoundTiles_BaseColor.png')).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).greyscale().linear(0.78, 0).toBuffer();
    await sharp(grey).tint(tint).jpeg({ quality: 82, mozjpeg: true }).toFile(join(OUT, 'models', 'village', 'textures', `T_RoundTiles_${name}.jpg`));
  }
  console.log('roofs:', Object.keys(ROOF_COLORS).join(', '));
}
if (args.nature) await importPieces(args.nature, NATURE, 'forest');
if (args.people) await importAnimations(args.people, PEOPLE_ANIMS, join(OUT, 'models', 'people', 'animations.glb'));
if (args.characters) await importCharacters(args.characters, args.outfits);
if (args.ground) await importGround();
if (args.ground || args['grass-variants']) await importGrassVariants();
if (args.ground || args.paving) await importPaving();
if (args.animals) {
  mkdirSync(join(OUT, 'models', 'animals'), { recursive: true });
  for (const name of ANIMALS) writeFileSync(join(OUT, 'models', 'animals', `${name}.glb`), await obj2gltf(join(args.animals, `${name}.obj`), { binary: true }));
  console.log('animals:', ANIMALS.join(', '));
}
