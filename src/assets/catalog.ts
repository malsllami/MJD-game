// مسؤولية الملف: فهرس الأصول البصرية — يربط قيمة عمود "النموذج" في الشيت بنماذج Kenney ثلاثية الأبعاد
// File responsibility: visual asset catalogue — maps the sheet's "model" column to Kenney 3D models
//
// هذا تنسيق بصري تقني وليس بيانات أعمال: الشيت يحدد نمط كل مبنى، وهذا الملف يحدد شكل كل نمط.
// Technical visual mapping, not business data: the sheet sets each building's style; this file sets each style's look.

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
export function settlementParts(level: number): ModelPart[] {
  const square: ModelPart[] = [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]
    .map(([x, z]) => ({ path: 'nature/tree_oak.glb', x, z, size: 0.18 }));
  if (level <= 1) return [{ path: 'commercial/building-e.glb', size: 0.62 }, ...square];
  if (level === 2) {
    return [{ path: 'commercial/building-skyscraper-a.glb', size: 0.5 }, { path: SHOPS[2], x: -0.36, size: 0.26, yaw: Math.PI / 2 }, { path: SHOPS[3], x: 0.36, size: 0.26, yaw: -Math.PI / 2 }, ...square];
  }
  return [{ path: 'commercial/building-skyscraper-c.glb', size: 0.55 }, { path: TOWERS[1], x: -0.36, z: 0.2, size: 0.24 }, { path: TOWERS[4], x: 0.36, z: -0.2, size: 0.24 }, ...square];
}

/** نماذج الطبيعة حسب نوع الأرض: [المسار، الحجم كنسبة من المربع، الكثافة لكل مربع] / Nature by terrain */
export const NATURE_BY_TERRAIN: Record<string, [string, number, number][]> = {
  // العالم 160 × 160 مربعًا، فالنباتات الصغيرة أقل كثافة لتبقى خفيفة على الجوال / A 160 × 160 world, so small plants stay sparse for mobile
  plain: [['nature/tree_default.glb', 0.32, 0.9], ['nature/tree_oak.glb', 0.36, 0.6], ['nature/tree_detailed.glb', 0.32, 0.5], ['nature/plant_bush.glb', 0.14, 0.5], ['nature/grass_large.glb', 0.1, 0.7], ['nature/flower_yellowA.glb', 0.06, 0.25]],
  coast: [['nature/tree_palm.glb', 0.34, 0.5], ['nature/tree_palmTall.glb', 0.36, 0.3], ['nature/rock_smallA.glb', 0.1, 0.4], ['nature/grass.glb', 0.08, 0.8]],
  desert: [['nature/rock_smallB.glb', 0.12, 0.6], ['nature/stone_largeA.glb', 0.18, 0.15], ['nature/plant_bushSmall.glb', 0.1, 0.3]],
  plateau: [['nature/tree_pineDefaultA.glb', 0.32, 0.8], ['nature/tree_fat.glb', 0.32, 0.4], ['nature/rock_largeB.glb', 0.2, 0.25], ['nature/plant_bushLarge.glb', 0.16, 0.5]],
  mountain: [['nature/tree_pineTallA.glb', 0.34, 0.7], ['nature/tree_pineRoundA.glb', 0.3, 0.5], ['nature/rock_largeA.glb', 0.28, 0.5], ['nature/rock_largeC.glb', 0.24, 0.4]],
  peak: [['nature/rock_largeB.glb', 0.24, 0.3], ['nature/stone_tallA.glb', 0.16, 0.2]],
};

/**
 * إعادة تلوين مواد الطبيعة: أوراق Kenney وأعشابها فيروزية في الأصل، فتُستبدل بدرجات خضراء طبيعية
 * Nature recolouring: Kenney leaves and grass are teal by design, so they are swapped for natural greens
 */
export const MATERIAL_COLORS: Record<string, [number, number, number]> = {
  leafsGreen: [0.32, 0.6, 0.22],
  leafsDark: [0.2, 0.44, 0.2],
  leafsFall: [0.86, 0.52, 0.18],
  grass: [0.44, 0.68, 0.26],
};

/** نماذج السيارات / Car models */
export const CAR_MODELS = ['sedan', 'suv', 'taxi', 'police', 'ambulance', 'delivery', 'truck', 'van', 'hatchback-sports', 'garbage-truck'].map((n) => `cars/${n}.glb`);
