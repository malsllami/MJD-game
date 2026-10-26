// مسؤولية الملف: تجميع مبانٍ كاملة من قطع حزمة القرية الوسيطية (جدران، زوايا، أسقف، أسوار، دعائم) بوحدات المتر
// File responsibility: assembles whole buildings from Medieval Village kit pieces (walls, corners, roofs, fences, supports) in metres
//
// كل جدار بعرض 2 م وارتفاع 3 م، وواجهته الخارجية نحو +z؛ والأسقف بمقاسات 4×4 و4×6 و6×6 و6×8.
// Each wall is 2 m wide and 3 m tall with its outer face toward +z; roofs come as 4×4, 4×6, 6×6 and 6×8.

/** قطعة في مبنى مجمّع: الموضع بالمتر من مركز المبنى / A piece of an assembled building: position in metres from the centre */
export interface KitPiece {
  path: string;
  x: number;
  z: number;
  y?: number;
  yaw?: number;
  /** إن وُجد: يُضبط النموذج على هذا البعد الأفقي بالمتر بدل مقاسه الأصلي (لنماذج من حزم أخرى) / If set: fit to this horizontal extent in metres instead of native size */
  fit?: number;
}

/** مبنى مجمّع: قطعه، وأكبر بعد أفقي له بالمتر، وحجمه كنسبة من ضلع المربع / An assembly: its pieces, extent in metres, and size as a tile fraction */
export interface Assembly {
  pieces: KitPiece[];
  extent: number;
  size: number;
}

const V = (name: string) => `village/${name}.glb`;
const F = (name: string) => `forest/${name}.glb`;
const WALL_HEIGHT = 3;
const ROOF_OVERHANG = 1.5;

/** نوع الجدران / Wall finish */
type Finish = 'timber' | 'plaster' | 'brick';
const WALLS: Record<Finish, { plain: string; door: string; window: string; corner: string }> = {
  timber: { plain: V('Wall_Plaster_WoodGrid'), door: V('Wall_Plaster_Door_Round'), window: V('Wall_Plaster_WoodGrid'), corner: V('Corner_Exterior_Wood') },
  plaster: { plain: V('Wall_Plaster_Straight'), door: V('Wall_Plaster_Door_Round'), window: V('Wall_Plaster_Window_Wide_Round'), corner: V('Corner_Exterior_Wood') },
  brick: { plain: V('Wall_UnevenBrick_Straight'), door: V('Wall_UnevenBrick_Door_Round'), window: V('Wall_UnevenBrick_Window_Wide_Round'), corner: V('Corner_Exterior_Brick') },
};

/** مواصفات بيت / House specification */
interface HouseSpec {
  /** العرض والعمق بالمتر (مضاعفات 2، والأسقف المتاحة 4×4 و4×6 و6×6 و6×8) / Width and depth in metres */
  w: 4 | 6;
  d: 4 | 6 | 8;
  finish: Finish;
  /** إضافات حول البيت أو عليه / Extras around or on the house */
  extras?: KitPiece[];
  size: number;
}

/**
 * بيت مستطيل: جدران على الأضلاع الأربعة (الباب في منتصف الواجهة الأمامية +z)، وزوايا، وسقف بنفس المقاس
 * A rectangular house: walls on all four sides (the door mid-front, +z), corners, and a matching roof
 */
export function house({ w, d, finish, extras = [], size }: HouseSpec): Assembly {
  const kit = WALLS[finish];
  const pieces: KitPiece[] = [];
  const side = (count: number, place: (i: number, offset: number) => KitPiece) => {
    for (let i = 0; i < count; i++) pieces.push(place(i, -count + 1 + i * 2));
  };
  const front = w / 2;
  side(w / 2, (i, o) => ({ path: i === Math.floor(w / 4) ? kit.door : kit.window, x: o, z: d / 2 }));
  side(w / 2, (_, o) => ({ path: kit.plain, x: o, z: -d / 2, yaw: Math.PI }));
  side(d / 2, (i, o) => ({ path: i % 2 ? kit.window : kit.plain, x: front, z: o, yaw: Math.PI / 2 }));
  side(d / 2, (_, o) => ({ path: kit.plain, x: -front, z: o, yaw: -Math.PI / 2 }));
  for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) pieces.push({ path: kit.corner, x: (cx * w) / 2, z: (cz * d) / 2 });
  pieces.push({ path: V(`Roof_RoundTiles_${w}x${d}`), x: 0, z: 0, y: WALL_HEIGHT });
  // جملون أمامي وخلفي يسد مثلث السقف / Front and back gables close the roof triangle
  pieces.push({ path: V(`Roof_Front_Brick${w}`), x: 0, z: d / 2, y: WALL_HEIGHT }, { path: V(`Roof_Front_Brick${w}`), x: 0, z: -d / 2, y: WALL_HEIGHT, yaw: Math.PI });
  return { pieces: [...pieces, ...extras], extent: Math.max(w, d) + ROOF_OVERHANG, size };
}

/** سور خشبي على ضلع بطول n قطع (كل قطعة 2 م) / A wooden fence along a side of n pieces (2 m each) */
function fenceLine(x0: number, z0: number, n: number, alongX: boolean): KitPiece[] {
  return Array.from({ length: n }, (_, i) => ({
    path: V(i ? 'Prop_WoodenFence_Extension1' : 'Prop_WoodenFence_Single'),
    x: alongX ? x0 + 1 + i * 2 : x0,
    z: alongX ? z0 : z0 + 1 + i * 2,
    yaw: alongX ? 0 : Math.PI / 2,
  }));
}

/** سور مربع حول مساحة بنصف ضلع half (من مضاعفات 2) مع فتحة في الأمام / A square fence of half-side half with a front gap */
export function fenceRing(half: number): KitPiece[] {
  const n = half;
  return [
    ...fenceLine(-half, -half, n, true),
    ...fenceLine(-half, -half, n, false),
    ...fenceLine(half, -half, n, false),
    ...fenceLine(-half, half, n / 2 - 1, true),
    ...fenceLine(2, half, n / 2 - 1, true),
  ];
}

/** مظلة مفتوحة 4×4 م: أربعة أعمدة خشبية تحت سقف قرميد / An open 4×4 m shelter: four timber posts under a tiled roof */
function shelter(x: number, z: number): KitPiece[] {
  return [
    ...[[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]].map(([dx, dz]) => ({ path: V('Corner_Exterior_Wood'), x: x + dx, z: z + dz })),
    { path: V('Roof_RoundTiles_4x4'), x, z, y: WALL_HEIGHT },
  ];
}

/** أشكال العصر البدائي لكل نمط / Primitive-era looks per style */
export const PRIMITIVE_LOOKS: Record<string, Assembly[]> = {
  house: [
    house({ w: 4, d: 4, finish: 'timber', size: 0.6 }),
    house({ w: 4, d: 6, finish: 'timber', size: 0.66, extras: [{ path: V('Prop_Crate'), x: 3, z: 3.4 }] }),
  ],
  civic: [house({ w: 6, d: 6, finish: 'timber', size: 0.74, extras: [{ path: V('Prop_Chimney'), x: 2, z: -1.5, y: 3.6 }] })],
  industry: [{ pieces: [...shelter(-2.6, -1), ...shelter(2.6, -1), { path: V('Prop_Crate'), x: 3.6, z: 3.2 }, { path: V('Prop_Wagon'), x: -1, z: 3.6, yaw: Math.PI / 2 }], extent: 11, size: 0.8 }],
  sawmill: [{
    pieces: [...shelter(-1, -1.2), { path: V('Prop_Wagon'), x: 3.4, z: 1.2, yaw: -0.4 }, { path: V('Prop_Crate'), x: -2.8, z: 2.8 }, { path: V('Prop_Crate'), x: -1.6, z: 3.2 }, { path: F('DeadTree_1'), x: 3, z: -3, fit: 3 }],
    extent: 9, size: 0.78,
  }],
  smithy: [house({ w: 4, d: 4, finish: 'brick', size: 0.6, extras: [{ path: V('Prop_Chimney2'), x: 1.2, z: -1.2, y: 2.8 }, { path: V('Prop_Crate'), x: 3, z: 2.6 }] })],
  barn: [house({ w: 4, d: 6, finish: 'timber', size: 0.66, extras: fenceRing(6) })],
  // حقل محروث بصفوف قمح وسور خشبي؛ التربة نفسها ترسمها خامة الأرض / A tilled field with wheat rows and a wooden fence; the soil itself is ground texture
  field: [{
    pieces: [...fenceRing(6), ...[-4, -2, 0, 2, 4].flatMap((x) => [-4, -1.3, 1.3, 4].map((z) => ({ path: F('Plant_1'), x, z, fit: 1.5 })))],
    extent: 12.5, size: 0.9,
  }],
  market: [{ pieces: [...shelter(-2.6, -2.4), ...shelter(2.6, -2.4), ...shelter(0, 2.8), { path: V('Prop_Crate'), x: -2.4, z: -2.4 }, { path: V('Prop_Crate'), x: 2.8, z: -2.2 }, { path: V('Prop_Wagon'), x: -4, z: 3.4, yaw: 1.2 }], extent: 11.5, size: 0.84 }],
  // خيمة من ألواح مائلة على الأرض / A tent of planks leaning on the ground
  // خيمة: سقف مائل على الأرض مسدود من الخلف ومفتوح من الأمام / A tent: a roof on the ground, closed at the back, open at the front
  tent: [{ pieces: [{ path: V('Roof_RoundTiles_4x4'), x: 0, z: 0, y: 0.5 }, { path: V('Roof_Front_Brick4'), x: 0, z: -2, y: 0.5, yaw: Math.PI }, { path: V('Prop_Crate'), x: 2.6, z: 2 }], extent: 6, size: 0.5 }],
  well: [{ pieces: [...shelter(0, 0), { path: F('Rock_Medium_2'), x: 0, z: 0, fit: 1.8 }, { path: V('Prop_Crate'), x: 2.6, z: 2.4 }], extent: 6.5, size: 0.45 }],
  quarry: [{ pieces: [{ path: F('Rock_Medium_1'), x: -1.5, z: -1 }, { path: F('Rock_Medium_3'), x: 2, z: -1.5 }, { path: F('Rock_Medium_2'), x: 0, z: 2 }, { path: V('Prop_Wagon'), x: 3.5, z: 2.5, yaw: -0.6 }, { path: V('Prop_Crate'), x: -3, z: 2.5 }], extent: 9, size: 0.8 }],
  'oil-rig': [{ pieces: [...shelter(0, 0), { path: F('Rock_Medium_3'), x: -3, z: 2.4, fit: 2 }, { path: V('Prop_Crate'), x: 3, z: 2.6 }, { path: V('Prop_Crate'), x: 3, z: -2.4 }], extent: 8, size: 0.62 }],
};

/** أشكال العصر الانتقالي: بيوت جصية وحجرية أكبر / Transitional-era looks: larger plaster and brick houses */
export const TRANSITIONAL_LOOKS: Record<string, Assembly[]> = {
  house: [house({ w: 4, d: 6, finish: 'plaster', size: 0.66, extras: [{ path: V('Prop_Chimney'), x: 1.2, z: -1.5, y: 3.6 }] }), house({ w: 6, d: 6, finish: 'plaster', size: 0.72 })],
  civic: [house({ w: 6, d: 8, finish: 'brick', size: 0.8 })],
  smithy: PRIMITIVE_LOOKS.smithy,
  sawmill: PRIMITIVE_LOOKS.sawmill,
  barn: PRIMITIVE_LOOKS.barn,
  market: PRIMITIVE_LOOKS.market,
  well: PRIMITIVE_LOOKS.well,
  quarry: PRIMITIVE_LOOKS.quarry,
};

/**
 * مبنى الحكم حسب المرحلة: قاعة خشبية، ثم قاعة حجرية كبيرة (المدينة تستخدم نموذجها الحديث)
 * The government building by stage: a timber hall, then a large stone hall (the city uses its modern model)
 */
export function governmentAssembly(level: number): Assembly | null {
  if (level <= 1) return house({ w: 6, d: 6, finish: 'timber', size: 0.7, extras: [{ path: V('Prop_Chimney'), x: 2, z: -1.6, y: 3.6 }, ...fenceRing(6).map((p) => ({ ...p, x: p.x * 1.25, z: p.z * 1.25 }))] });
  if (level === 2) return house({ w: 6, d: 8, finish: 'brick', size: 0.8, extras: [{ path: V('Prop_Chimney2'), x: 2, z: -2.5, y: 3.6 }] });
  return null;
}
