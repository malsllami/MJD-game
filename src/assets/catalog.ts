// مسؤولية الملف: فهرس الأصول البصرية — يربط قيمة عمود "النموذج" في الشيت بشكل كل عصر: مبانٍ مجمّعة من حزمة القرية
// الوسيطية في العصرين البدائي والانتقالي، ونماذج Kenney الحديثة في المدينة
// File responsibility: visual asset catalogue — maps the sheet's "model" column to each era's look: buildings assembled from the
// medieval village kit in the primitive and transitional eras, and modern Kenney models in the city
//
// هذا تنسيق بصري تقني وليس بيانات أعمال: الشيت يحدد نمط كل مبنى، وهذا الملف يحدد شكل كل نمط.
// Technical visual mapping, not business data: the sheet sets each building's style; this file sets each style's look.

import { governmentAssembly, PRIMITIVE_LOOKS, TRANSITIONAL_LOOKS, type Assembly } from './village-kit';

/** قطعة في نموذج مركّب: الموضع والحجم كنسبة من ضلع المربع / A composite part: position and size as fractions of a tile side */
export interface ModelPart {
  path: string;
  x?: number;
  z?: number;
  size: number;
  yaw?: number;
}

/** نمط بصري: عدة أشكال بديلة، يُختار منها واحد ثابت لكل مبنى / A style: alternative looks; one is picked per building */
export type StyleVariants = ModelPart[][];

/** شكل مبنى: قطع مضبوطة على المربع، أو مبنى مجمّع بالمتر / A building look: tile-fitted parts, or a metre-based assembly */
export type Look = ModelPart[] | Assembly;

/**
 * مبانٍ قائمة نمطها في الشيت مشترك مع غيرها، فتأخذ شكلًا خاصًا بها (تنسيق بصري تقني فقط)
 * Existing buildings whose sheet style is shared with others get a look of their own (a technical visual mapping only)
 */
const STYLE_OVERRIDES: Record<string, string> = { market: 'market', development_center: 'development' };

/** نمط شكل المبنى / A building's look style */
export const styleOf = (def: { id: string; model: string }): string => STYLE_OVERRIDES[def.id] ?? def.model;

/** العصر البصري حسب ترتيب المرحلة / Visual era by stage order */
export type Era = 'primitive' | 'transitional' | 'modern';
export const eraOf = (stageOrder: number): Era => (stageOrder <= 1 ? 'primitive' : stageOrder === 2 ? 'transitional' : 'modern');

/**
 * أشكال النمط في العصر: شكل العصر نفسه، وإلا أقرب عصر له شكل، وإلا الشكل المدني
 * The style's looks in an era: that era's own, else the nearest era that has one, else the civic look
 */
export function looksFor(style: string, era: Era): Look[] {
  const byEra: Record<Era, Look[] | undefined> = { primitive: PRIMITIVE_LOOKS[style], transitional: TRANSITIONAL_LOOKS[style], modern: STYLE_MODELS[style] };
  const order: Era[] = era === 'primitive' ? ['primitive', 'transitional', 'modern'] : era === 'transitional' ? ['transitional', 'primitive', 'modern'] : ['modern', 'transitional', 'primitive'];
  for (const e of order) if (byEra[e]?.length) return byEra[e]!;
  return STYLE_MODELS.civic;
}

const range = (prefix: string, from: string, to: string): string[] => {
  const out: string[] = [];
  for (let c = from.charCodeAt(0); c <= to.charCodeAt(0); c++) out.push(`${prefix}${String.fromCharCode(c)}.glb`);
  return out;
};
const single = (paths: string[], size: number): StyleVariants => paths.map((path) => [{ path, size }]);

const HOUSES = range('suburban/building-type-', 'a', 'u');
const SHOPS = range('commercial/building-', 'a', 'n');
const TOWERS = range('commercial/building-skyscraper-', 'a', 'e');
const FACTORIES = range('industrial/building-', 'a', 't');

export const STYLE_MODELS: Record<string, StyleVariants> = {
  house: single(HOUSES, 0.78),
  tower: single([...SHOPS.slice(6), ...TOWERS], 0.8),
  civic: single(SHOPS.slice(0, 8), 0.82),
  industry: single(FACTORIES, 0.85),
  palace: [[{ path: 'commercial/building-skyscraper-c.glb', size: 0.7 }, { path: 'nature/plant_bushLarge.glb', x: -0.38, z: -0.38, size: 0.2 }, { path: 'nature/plant_bushLarge.glb', x: 0.38, z: -0.38, size: 0.2 }]],
  utility: [
    [{ path: 'industrial/detail-tank-large.glb', x: -0.18, size: 0.42 }, { path: 'industrial/detail-tank-large.glb', x: 0.22, z: 0.15, size: 0.38 }],
    [{ path: 'industrial/water-tower.glb', size: 0.55 }, { path: 'industrial/detail-tank.glb', x: 0.3, z: 0.25, size: 0.3 }],
  ],
  field: [
    [-0.3, 0, 0.3].flatMap((x) => [-0.3, 0, 0.3].map((z) => ({ path: 'nature/crops_wheatStageB.glb', x, z, size: 0.3 }))),
    [-0.3, 0, 0.3].flatMap((x) => [-0.3, 0, 0.3].map((z) => ({ path: 'nature/crops_cornStageD.glb', x, z, size: 0.3 }))),
  ],
  barn: [[{ path: 'industrial/building-b.glb', x: -0.12, z: -0.1, size: 0.6 }, { path: 'nature/crops_leafsStageB.glb', x: 0.32, z: 0.3, size: 0.28 }, { path: 'nature/log_stack.glb', x: 0.3, z: -0.32, size: 0.22 }]],
  park: [[
    { path: 'nature/tree_oak.glb', x: -0.25, z: -0.2, size: 0.4 }, { path: 'nature/tree_default.glb', x: 0.25, z: -0.25, size: 0.36 },
    { path: 'nature/plant_bushLarge.glb', x: 0.2, z: 0.25, size: 0.25 }, { path: 'nature/flower_yellowA.glb', x: -0.2, z: 0.25, size: 0.12 },
    { path: 'nature/flower_redA.glb', x: 0, z: 0.05, size: 0.12 }, { path: 'nature/grass_large.glb', x: -0.35, z: 0.05, size: 0.15 },
  ]],
  sawmill: [[{ path: 'industrial/building-c.glb', x: -0.15, z: -0.12, size: 0.6 }, { path: 'nature/log_stackLarge.glb', x: 0.3, z: 0.25, size: 0.32 }, { path: 'nature/log_stack.glb', x: -0.3, z: 0.32, size: 0.22 }, { path: 'nature/stump_round.glb', x: 0.32, z: -0.3, size: 0.12 }]],
  smithy: [[{ path: 'industrial/building-d.glb', size: 0.7 }, { path: 'industrial/chimney-medium.glb', x: 0.3, z: 0.3, size: 0.18 }]],
  'oil-rig': [[{ path: 'industrial/detail-tank.glb', x: -0.2, z: 0.15, size: 0.35 }, { path: 'industrial/chimney-small.glb', x: 0.22, z: -0.15, size: 0.2 }, { path: 'industrial/detail-tank.glb', x: 0.2, z: 0.28, size: 0.25 }]],
  quarry: [[{ path: 'nature/rock_largeA.glb', x: -0.2, z: -0.15, size: 0.45 }, { path: 'nature/rock_largeC.glb', x: 0.25, z: 0.1, size: 0.35 }, { path: 'nature/stone_tallA.glb', x: -0.25, z: 0.3, size: 0.2 }, { path: 'nature/log_stack.glb', x: 0.25, z: -0.3, size: 0.2 }]],
};

/**
 * مبنى الحكم حسب المرحلة: مبنى رسمي في ساحة تحيط بها الأشجار، يكبر ويرتفع مع كل مرحلة
 * The government building by stage: an official building in a tree-lined square, larger and taller each stage
 */
export function settlementLook(level: number): Look {
  return governmentAssembly(level) ?? settlementParts(level);
}

function settlementParts(level: number): ModelPart[] {
  const square: ModelPart[] = [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]
    .map(([x, z]) => ({ path: 'nature/tree_oak.glb', x, z, size: 0.18 }));
  if (level <= 1) return [{ path: 'commercial/building-e.glb', size: 0.62 }, ...square];
  if (level === 2) {
    return [{ path: 'commercial/building-skyscraper-a.glb', size: 0.5 }, { path: SHOPS[2], x: -0.36, size: 0.26, yaw: Math.PI / 2 }, { path: SHOPS[3], x: 0.36, size: 0.26, yaw: -Math.PI / 2 }, ...square];
  }
  return [{ path: 'commercial/building-skyscraper-c.glb', size: 0.55 }, { path: TOWERS[1], x: -0.36, z: 0.2, size: 0.24 }, { path: TOWERS[4], x: 0.36, z: -0.2, size: 0.24 }, ...square];
}

/**
 * نوع نبات أو صخرة: النموذج المفصّل، ونموذج خفيف للمسافات البعيدة (غيابه يعني الظهور قرب الكاميرا فقط)،
 * والحجم كنسبة من المربع، والكثافة لكل مربع
 * A plant or rock kind: the detailed model, a light model for far distances (absent means it shows near the camera only),
 * its size as a tile fraction, and its density per tile
 */
export interface NatureKind {
  path: string;
  light?: string;
  size: number;
  perTile: number;
  /** الأشجار تتبع بقع الغابات / Trees follow the forest patches */
  tree: boolean;
}

const tree = (path: string, light: string, size: number, perTile: number): NatureKind => ({ path, light, size, perTile, tree: true });
const ground = (path: string, size: number, perTile: number, light?: string): NatureKind => ({ path, light, size, perTile, tree: false });

/** نماذج الطبيعة حسب نوع الأرض (أشجار Quaternius قريبًا، وKenney الخفيفة بعيدًا) / Nature by terrain (Quaternius trees near, light Kenney far) */
export const NATURE_BY_TERRAIN: Record<string, NatureKind[]> = {
  plain: [
    tree('forest/CommonTree_1.glb', 'nature/tree_default.glb', 0.36, 0.45), tree('forest/CommonTree_2.glb', 'nature/tree_oak.glb', 0.36, 0.35),
    tree('forest/CommonTree_4.glb', 'nature/tree_detailed.glb', 0.3, 0.3), tree('forest/Pine_2.glb', 'nature/tree_pineDefaultA.glb', 0.32, 0.25),
    ground('forest/Bush_Common_Flowers.glb', 0.12, 0.35), ground('forest/Flower_3_Group.glb', 0.06, 0.25),
    ground('forest/Plant_1.glb', 0.07, 0.3),
  ],
  coast: [tree('nature/tree_palm.glb', 'nature/tree_palm.glb', 0.34, 0.5), ground('forest/Pebble_Round_1.glb', 0.06, 0.4), ground('forest/Plant_1.glb', 0.06, 0.4)],
  desert: [ground('forest/Rock_Medium_2.glb', 0.14, 0.3, 'nature/rock_smallB.glb'), ground('forest/Plant_1.glb', 0.06, 0.2)],
  plateau: [tree('forest/Pine_1.glb', 'nature/tree_pineDefaultA.glb', 0.34, 0.6), tree('forest/Pine_3.glb', 'nature/tree_pineRoundA.glb', 0.3, 0.4), ground('forest/Rock_Medium_1.glb', 0.18, 0.2, 'nature/rock_largeB.glb'), ground('forest/Bush_Common_Flowers.glb', 0.12, 0.4)],
  mountain: [tree('forest/Pine_5.glb', 'nature/tree_pineTallA.glb', 0.34, 0.6), ground('forest/Rock_Medium_3.glb', 0.26, 0.5, 'nature/rock_largeA.glb')],
  peak: [ground('forest/Rock_Medium_1.glb', 0.24, 0.3, 'nature/rock_largeB.glb')],
};

/** نتوءات صخرية تعلّم مكامن المعادن والحجر على السهل / Rock outcrops marking ore and stone deposits on the plain */
export const OUTCROP_NATURE: NatureKind[] = [
  ground('forest/Rock_Medium_1.glb', 0.4, 0.8, 'nature/rock_largeA.glb'), ground('forest/Rock_Medium_3.glb', 0.34, 0.7, 'nature/rock_largeC.glb'),
  ground('forest/Rock_Medium_2.glb', 0.22, 0.6, 'nature/rock_largeB.glb'), ground('forest/Pebble_Round_1.glb', 0.08, 1),
];

/**
 * إعادة تلوين مواد الطبيعة: أوراق Kenney وأعشابها فيروزية في الأصل، فتُستبدل بدرجات خضراء طبيعية
 * Nature recolouring: Kenney leaves and grass are teal by design, so they are swapped for natural greens
 */
export const MATERIAL_COLORS: Record<string, [number, number, number]> = {
  leafsGreen: [0.32, 0.6, 0.22],
  leafsDark: [0.2, 0.44, 0.2],
  leafsFall: [0.86, 0.52, 0.18],
  grass: [0.44, 0.68, 0.26],
  // خامة أوراق Quaternius الملونة داكنة (أعلى قيمها نحو 90، 123، 0) فتُضاعف لتصل إلى أخضر طبيعي متوسط
  // Quaternius's coloured leaf texture is dark (peaks near 90, 123, 0), so it is multiplied up to a natural mid green
  Leaves_NormalTree: [2.1, 1.95, 1.6],
  Leaves_Pine: [2.4, 2.1, 1.7],
};

/**
 * حد الشفافية للأوراق: أقل من قيمة النموذج حتى تبقى الأوراق كثيفة في المستويات الصغيرة من الخامة (من بعيد)
 * Leaf alpha cutoff: below the model's own so leaves stay dense at small texture levels (from afar)
 */
export const LEAF_ALPHA_CUTOFF = 0.08;

/** نماذج السيارات / Car models */
export const CAR_MODELS = ['sedan', 'suv', 'taxi', 'police', 'ambulance', 'delivery', 'truck', 'van', 'hatchback-sports', 'garbage-truck'].map((n) => `cars/${n}.glb`);
