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
  /** لون القرميد إن لم يكن الأحمر الأصلي / The roof-tile colour when not the original red */
  roof?: RoofColor;
}

/** ألوان القرميد البديلة (خاماتها تولدها أداة الاستيراد) / Alternate roof-tile colours (their textures come from the import tool) */
export type RoofColor = 'Green' | 'Slate' | 'Brown' | 'Wine';
/** اسم مادة القرميد في قطع الحزمة / The roof-tile material name in the kit pieces */
export const ROOF_MATERIAL = 'MI_RoundTiles';
export const roofTexture = (color: RoofColor) => `village/textures/T_RoundTiles_${color}.jpg`;

/** مبنى مجمّع: قطعه، وأكبر بعد أفقي له بالمتر، وحجمه كنسبة من ضلع المربع / An assembly: its pieces, extent in metres, and size as a tile fraction */
export interface Assembly {
  pieces: KitPiece[];
  extent: number;
  size: number;
}

const V = (name: string) => `village/${name}.glb`;
/** سطح ماء يُرسم بالكود بدل نموذج / A water surface drawn in code instead of a model */
export const WATER_SURFACE = 'procedural:water';
const F = (name: string) => `forest/${name}.glb`;
const WALL_HEIGHT = 3;
const ROOF_OVERHANG = 1.5;
/**
 * ضلع المربع بالمتر لكل البيوت: مقياس واحد يجعل المبنى الأكبر يبدو أكبر فعلًا، والكوخ أصغر من القاعة
 * A tile side in metres for every house: one scale so a bigger building really looks bigger, a hut smaller than a hall
 */
export const TILE_METRES = 9.5;
/** أقصى حجم للبيت كنسبة من المربع حتى يبقى طريق حوله / Max house size as a tile fraction so a road still fits around it */
const MAX_HOUSE_SIZE = 0.96;
/** سارية علم تُرسم بالكود: fit طولها بالمتر / A flagpole drawn in code: fit is its height in metres */
export const FLAG_POLE = 'procedural:flag';
/** سور حجري منخفض يُرسم بالكود: fit طوله بالمتر / A low stone wall drawn in code: fit is its length in metres */
export const LOW_WALL = 'procedural:low-wall';

/** نوع الجدران / Wall finish */
type Finish = 'timber' | 'plaster' | 'brick';
const WALLS: Record<Finish, { plain: string; door: string; window: string; corner: string }> = {
  timber: { plain: V('Wall_Plaster_WoodGrid'), door: V('Wall_Plaster_Door_Round'), window: V('Wall_Plaster_WoodGrid'), corner: V('Corner_Exterior_Wood') },
  plaster: { plain: V('Wall_Plaster_Straight'), door: V('Wall_Plaster_Door_Round'), window: V('Wall_Plaster_Window_Wide_Round'), corner: V('Corner_Exterior_Wood') },
  brick: { plain: V('Wall_UnevenBrick_Straight'), door: V('Wall_UnevenBrick_Door_Round'), window: V('Wall_UnevenBrick_Window_Wide_Round'), corner: V('Corner_Exterior_Brick') },
};

/** مواصفات بيت / House specification */
interface HouseSpec {
  /** العرض والعمق بالمتر (مضاعفات 2، والأسقف المتاحة 4×4 و4×6 و6×6 و6×8 و8×8 و8×10 و8×12) / Width and depth in metres */
  w: 4 | 6 | 8;
  d: 4 | 6 | 8 | 10 | 12;
  finish: Finish;
  /** لون السقف (الأحمر الأصلي إن غاب) / Roof colour (the original red when absent) */
  roof?: RoofColor;
  /** عدد الطوابق؛ الطابق الثاني بشرفة أمامية / Storeys; the second has a front balcony */
  floors?: 1 | 2;
  /** فناء: زهور عند المدخل ونبتة متسلقة على الجدار / A yard: flowers by the door and a climbing vine on the wall */
  yard?: boolean;
  /** إضافات حول البيت أو عليه / Extras around or on the house */
  extras?: KitPiece[];
}

/**
 * بيت مستطيل: جدران على الأضلاع الأربعة (الباب في منتصف الواجهة الأمامية +z)، وزوايا، وسقف بنفس المقاس
 * A rectangular house: walls on all four sides (the door mid-front, +z), corners, and a matching roof
 */
export function house({ w, d, finish, roof, floors = 1, yard = false, extras = [] }: HouseSpec): Assembly {
  const kit = WALLS[finish];
  const pieces: KitPiece[] = [];
  const front = w / 2;
  for (let f = 0; f < floors; f++) {
    const y = f * WALL_HEIGHT;
    const side = (count: number, place: (i: number, offset: number) => KitPiece) => {
      for (let i = 0; i < count; i++) {
        const wall = { ...place(i, -count + 1 + i * 2), y };
        pieces.push(wall, ...fittings(wall, kit, finish));
      }
    };
    // الباب في الطابق الأرضي، والنوافذ في الطابق الثاني / The door on the ground floor, windows upstairs
    side(w / 2, (i, o) => ({ path: !f && i === Math.floor(w / 4) ? kit.door : kit.window, x: o, z: d / 2 }));
    side(w / 2, (_, o) => ({ path: f ? kit.window : kit.plain, x: o, z: -d / 2, yaw: Math.PI }));
    side(d / 2, (i, o) => ({ path: i % 2 ? kit.window : kit.plain, x: front, z: o, yaw: Math.PI / 2 }));
    side(d / 2, (i, o) => ({ path: f && i % 2 ? kit.window : kit.plain, x: -front, z: o, yaw: -Math.PI / 2 }));
    for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) pieces.push({ path: kit.corner, x: (cx * w) / 2, z: (cz * d) / 2, y });
  }
  const top = floors * WALL_HEIGHT;
  if (floors === 2) {
    // شرفة أمام نافذة الطابق الثاني بدعامتين تحتها / A balcony at the upstairs front window on two braces
    const bx = Math.floor(w / 4) * 2 - w / 2 + 1;
    pieces.push({ path: V('Balcony_Simple_Straight'), x: bx, z: d / 2, y: WALL_HEIGHT });
    for (const dx of [-0.85, 0.85]) pieces.push({ path: V('Prop_Support'), x: bx + dx, z: d / 2, y: WALL_HEIGHT - 2.92 + 0.02 });
  }
  pieces.push({ path: V(`Roof_RoundTiles_${w}x${d}`), x: 0, z: 0, y: top, roof });
  // جملون أمامي وخلفي يسد مثلث السقف / Front and back gables close the roof triangle
  pieces.push({ path: V(`Roof_Front_Brick${w}`), x: 0, z: d / 2, y: top }, { path: V(`Roof_Front_Brick${w}`), x: 0, z: -d / 2, y: top, yaw: Math.PI });
  if (yard) {
    pieces.push(
      { path: F('Flower_3_Group'), x: -front + 0.6, z: d / 2 + 1.2, fit: 1.1 }, { path: F('Flower_4_Group'), x: front - 0.6, z: d / 2 + 1.2, fit: 1 },
      { path: F('Bush_Common_Flowers'), x: front + 1.1, z: d / 2 - 0.6, fit: 1.3 },
      // نبتة متسلقة تتدلى من أعلى الجدار الجانبي / A vine hanging from the top of the side wall
      { path: V('Prop_Vine1'), x: -front - 0.1, z: d / 2 - 1, y: WALL_HEIGHT - 0.3, yaw: -Math.PI / 2 },
    );
  }
  const extent = Math.max(w, d) + ROOF_OVERHANG;
  return { pieces: [...pieces, ...extras], extent, size: Math.min(MAX_HOUSE_SIZE, extent / TILE_METRES) };
}

/**
 * تجهيزات فتحة الجدار: إطار نافذة بزجاج (ومصاريع مفتوحة في الواجهة)، أو إطار باب وبابه
 * Fittings for a wall opening: a glazed window frame (with open shutters on the front), or a door frame and its door
 */
function fittings(wall: KitPiece, kit: (typeof WALLS)[Finish], finish: Finish): KitPiece[] {
  const at = { x: wall.x, z: wall.z, y: wall.y, yaw: wall.yaw };
  // نافذة الجدار الخشبي شبكة بلا فتحة / The timber wall's window is a grid with no opening
  if (wall.path === kit.window && finish !== 'timber') {
    return [{ path: V('Window_Wide_Round1'), ...at }, ...(wall.yaw ? [] : [{ path: V('WindowShutters_Wide_Round_Open'), ...at }])];
  }
  // الباب في الواجهة الأمامية فقط، ومفصله على يساره / The door is front-only, hinged on its left
  if (wall.path === kit.door) return [{ path: V('DoorFrame_Round_WoodDark'), ...at }, { path: V('Door_1_Round'), ...at, x: wall.x - 0.55 }];
  return [];
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
  // بيوت متنوعة الأسقف بأفنية مزهرة / Houses with varied roofs and flowered yards
  house: [
    house({ w: 4, d: 4, finish: 'timber', yard: true }),
    house({ w: 4, d: 6, finish: 'timber', roof: 'Brown', extras: [{ path: V('Prop_Crate'), x: 3, z: 3.4 }] }),
    house({ w: 4, d: 4, finish: 'timber', roof: 'Green', yard: true }),
  ],
  civic: [house({ w: 6, d: 6, finish: 'timber', roof: 'Green', yard: true, extras: [{ path: V('Prop_Chimney'), x: 2, z: -1.5, y: 3.6 }] })],
  industry: [{ pieces: [...shelter(-2.6, -1), ...shelter(2.6, -1), { path: V('Prop_Crate'), x: 3.6, z: 3.2 }, { path: V('Prop_Wagon'), x: -1, z: 3.6, yaw: Math.PI / 2 }], extent: 11, size: 0.92 }],
  sawmill: [{
    pieces: [...shelter(-1, -1.2), { path: V('Prop_Wagon'), x: 3.4, z: 1.2, yaw: -0.4 }, { path: V('Prop_Crate'), x: -2.8, z: 2.8 }, { path: V('Prop_Crate'), x: -1.6, z: 3.2 }, { path: F('DeadTree_1'), x: 3, z: -3, fit: 3 }],
    extent: 9, size: 0.88,
  }],
  smithy: [house({ w: 4, d: 4, finish: 'brick', roof: 'Slate', extras: [{ path: V('Prop_Chimney2'), x: 1.2, z: -1.2, y: 2.8 }, { path: V('Prop_Crate'), x: 3, z: 2.6 }] })],
  barn: [house({ w: 4, d: 6, finish: 'timber', extras: fenceRing(4) })],
  // حقل محروث بصفوف قمح وسور خشبي؛ التربة نفسها ترسمها خامة الأرض / A tilled field with wheat rows and a wooden fence; the soil itself is ground texture
  field: [{
    pieces: [...fenceRing(6), ...[-4, -2, 0, 2, 4].flatMap((x) => [-4, -1.3, 1.3, 4].map((z) => ({ path: F('Plant_1'), x, z, fit: 1.5 })))],
    extent: 12.5, size: 0.9,
  }],
  market: [{ pieces: [...shelter(-2.6, -2.4), ...shelter(2.6, -2.4), ...shelter(0, 2.8), { path: V('Prop_Crate'), x: -2.4, z: -2.4 }, { path: V('Prop_Crate'), x: 2.8, z: -2.2 }, { path: V('Prop_Wagon'), x: -4, z: 3.4, yaw: 1.2 }], extent: 11.5, size: 0.96 }],
  // خيمة من ألواح مائلة على الأرض / A tent of planks leaning on the ground
  // خيمة: سقف مائل على الأرض مسدود من الخلف ومفتوح من الأمام / A tent: a roof on the ground, closed at the back, open at the front
  tent: [{ pieces: [{ path: V('Roof_RoundTiles_4x4'), x: 0, z: 0, y: 0.5 }, { path: V('Roof_Front_Brick4'), x: 0, z: -2, y: 0.5, yaw: Math.PI }, { path: V('Prop_Crate'), x: 2.6, z: 2 }], extent: 6, size: 0.56 }],
  well: [{ pieces: [...shelter(0, 0), { path: F('Rock_Medium_2'), x: 0, z: 0, fit: 1.8 }, { path: V('Prop_Crate'), x: 2.6, z: 2.4 }], extent: 6.5, size: 0.56 }],
  quarry: [{ pieces: [{ path: F('Rock_Medium_1'), x: -1.5, z: -1 }, { path: F('Rock_Medium_3'), x: 2, z: -1.5 }, { path: F('Rock_Medium_2'), x: 0, z: 2 }, { path: V('Prop_Wagon'), x: 3.5, z: 2.5, yaw: -0.6 }, { path: V('Prop_Crate'), x: -3, z: 2.5 }], extent: 9, size: 0.9 }],
  'oil-rig': [{ pieces: [...shelter(0, 0), { path: F('Rock_Medium_3'), x: -3, z: 2.4, fit: 2 }, { path: V('Prop_Crate'), x: 3, z: 2.6 }, { path: V('Prop_Crate'), x: 3, z: -2.4 }], extent: 8, size: 0.74 }],
};

/** قطع متكررة للأشكال المميزة / Recurring pieces for the distinct looks */
const crate = (x: number, z: number): KitPiece => ({ path: V('Prop_Crate'), x, z });
const wagon = (x: number, z: number, yaw = 0): KitPiece => ({ path: V('Prop_Wagon'), x, z, yaw });
const chimney = (x: number, z: number, tall = false): KitPiece => ({ path: V(tall ? 'Prop_Chimney2' : 'Prop_Chimney'), x, z, y: tall ? 2.8 : 3.6 });

/**
 * شكل مميز لكل نوع سكن ومخزن ومبنى عام، حتى يُعرف المبنى من شكله
 * A distinct look for each kind of housing, store and public building, so a building is known by its shape
 */
const DISTINCT_LOOKS: Record<string, Assembly[]> = {
  'house-farmer': [house({ w: 4, d: 4, finish: 'timber', roof: 'Brown', yard: true, extras: [wagon(3.4, 1.5, 0.4), { path: F('Plant_1'), x: -3, z: 3, fit: 1.4 }, { path: F('Plant_1'), x: -1.8, z: 3.4, fit: 1.2 }] })],
  'house-carpenter': [house({ w: 4, d: 6, finish: 'timber', roof: 'Green', extras: [{ path: F('DeadTree_1'), x: 3.4, z: -2, fit: 2.6 }, crate(3.2, 2.6), crate(2.2, 3.4)] })],
  'house-smith': [house({ w: 4, d: 4, finish: 'brick', roof: 'Slate', extras: [chimney(1.2, -1.2, true), crate(3, 2.6)] })],
  'house-miner': [house({ w: 4, d: 4, finish: 'plaster', extras: [{ path: F('Rock_Medium_2'), x: 3.2, z: 2.6, fit: 1.8 }, wagon(-3.4, 1, -0.3)] })],
  'house-trader': [house({ w: 4, d: 6, finish: 'plaster', roof: 'Wine', yard: true, extras: [crate(3.2, 3), crate(3.2, 1.9), crate(2.1, 3.4)] })],
  'house-herder': [house({ w: 4, d: 4, finish: 'timber', roof: 'Brown', extras: fenceRing(4) })],
  'storage-farm': [house({ w: 6, d: 8, finish: 'timber', roof: 'Brown', extras: [wagon(4.6, 2, 0.2), crate(-4.4, 3.6), crate(-4.4, 2.4)] })],
  'storage-materials': [house({ w: 6, d: 8, finish: 'brick', roof: 'Slate', extras: [{ path: F('Rock_Medium_1'), x: 4.6, z: 3, fit: 2 }, crate(-4.4, 3.6), { path: F('DeadTree_1'), x: -4.6, z: -2.8, fit: 2.6 }] })],
  bank: [house({
    w: 6, d: 6, finish: 'brick', roof: 'Wine', floors: 2,
    extras: [{ ...chimney(2, -1.6), y: 6.6 }, { path: V('Prop_MetalFence_Ornament'), x: -2.6, z: 4.6 }, { path: V('Prop_MetalFence_Ornament'), x: 2.6, z: 4.6 }],
  })],
  development: [house({ w: 6, d: 6, finish: 'plaster', roof: 'Slate', floors: 2, yard: true, extras: [{ ...chimney(2, -1.6), y: 6.6 }, crate(3.8, 3.6), crate(-3.8, 3.6)] })],
  pond: [{
    pieces: [
      { path: WATER_SURFACE, x: 0, z: 0, fit: 7.2 },
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ path: F(i % 2 ? 'Rock_Medium_2' : 'Pebble_Round_1'), x: Math.cos(i * 0.785) * 4, z: Math.sin(i * 0.785) * 4, fit: i % 2 ? 1.4 : 0.8 })),
      { path: F('Plant_1_Big'), x: 3.4, z: -3.2, fit: 1.6 },
    ],
    extent: 9, size: 0.92,
  }],
  garden: [{
    pieces: [
      { path: F('CommonTree_1'), x: -2.4, z: -2.2, fit: 3.2 }, { path: F('CommonTree_2'), x: 2.6, z: -2.4, fit: 3 }, { path: F('Bush_Common_Flowers'), x: 2.2, z: 2.4, fit: 1.8 },
      { path: F('Bush_Common_Flowers'), x: -2.6, z: 2.2, fit: 1.6 }, { path: F('Flower_3_Group'), x: 0, z: 0.4, fit: 1.4 }, { path: F('Flower_4_Group'), x: 0.6, z: 2.8, fit: 1.2 },
      ...fenceRing(4).map((p) => ({ ...p, x: p.x * 1.05, z: p.z * 1.05 })),
    ],
    extent: 9, size: 0.85,
  }],
};
Object.assign(PRIMITIVE_LOOKS, DISTINCT_LOOKS);

/** أشكال العصر الانتقالي: بيوت جصية وحجرية أكبر / Transitional-era looks: larger plaster and brick houses */
export const TRANSITIONAL_LOOKS: Record<string, Assembly[]> = {
  // بيوت البلدة بطابقين وألوان أسقف متنوعة / Town houses with two storeys and varied roof colours
  house: [
    house({ w: 4, d: 6, finish: 'plaster', yard: true, extras: [{ path: V('Prop_Chimney'), x: 1.2, z: -1.5, y: 3.6 }] }),
    house({ w: 6, d: 6, finish: 'timber', roof: 'Green', floors: 2, yard: true }),
    house({ w: 4, d: 6, finish: 'plaster', roof: 'Wine', floors: 2 }),
    house({ w: 6, d: 6, finish: 'plaster', roof: 'Brown', floors: 2, yard: true }),
  ],
  civic: [house({ w: 6, d: 8, finish: 'brick', roof: 'Green', floors: 2, yard: true })],
  smithy: PRIMITIVE_LOOKS.smithy,
  sawmill: PRIMITIVE_LOOKS.sawmill,
  barn: PRIMITIVE_LOOKS.barn,
  market: PRIMITIVE_LOOKS.market,
  well: PRIMITIVE_LOOKS.well,
  quarry: PRIMITIVE_LOOKS.quarry,
};

/**
 * ساحة مرصوفة أمام القاعة بعرض cols وعمق rows قطعة (كل قطعة 2×2 م) تبدأ من z0
 * A paved forecourt before the hall, cols wide and rows deep in 2×2 m slabs, starting at z0
 */
function forecourt(cols: number, rows: number, z0: number): KitPiece[] {
  return Array.from({ length: cols * rows }, (_, i) => ({ path: V('Floor_Brick'), x: (i % cols) * 2 - cols + 1, z: z0 + Math.floor(i / cols) * 2 + 1, y: 0.02 }));
}

/** نقل قطع المبنى للخلف حتى تتسع الساحة أمامه / Shift the building's pieces back to make room for the forecourt */
const shiftBack = (pieces: KitPiece[], dz: number): KitPiece[] => pieces.map((p) => ({ ...p, z: p.z - dz }));
/** نقل قطع المبنى / Move a building's pieces */
const moveBy = (pieces: KitPiece[], dx: number, dz: number): KitPiece[] => pieces.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz }));

/**
 * برج مربع 4 × 4 م بعدة طوابق ونوافذ في الطوابق العليا وسقف برج مخروطي، يقف على (x, z)
 * A 4 × 4 m square tower of several storeys, windows upstairs and a conical tower roof, standing at (x, z)
 */
function tower(x: number, z: number, floors: number, finish: Finish): KitPiece[] {
  const kit = WALLS[finish];
  const pieces: KitPiece[] = [];
  for (let f = 0; f < floors; f++) {
    const y = f * WALL_HEIGHT;
    const path = f ? kit.window : kit.plain;
    for (const o of [-1, 1]) {
      pieces.push(
        { path, x: x + o, z: z + 2, y }, { path: kit.plain, x: x + o, z: z - 2, y, yaw: Math.PI },
        { path: kit.plain, x: x + 2, z: z + o, y, yaw: Math.PI / 2 }, { path: kit.plain, x: x - 2, z: z + o, y, yaw: -Math.PI / 2 },
      );
    }
    for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) pieces.push({ path: kit.corner, x: x + cx * 2, z: z + cz * 2, y });
  }
  pieces.push({ path: V('Roof_Tower_RoundTiles'), x, z, y: floors * WALL_HEIGHT, roof: 'Green' });
  return pieces;
}

/** مستطيل بالمتر من مركز المجمع (الواجهة نحو +z) / A rectangle in metres from the compound centre (front toward +z) */
export interface Bed {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * مدخل المجمع في سوره الأمامي: الطريق الرئيسي يسير على خط الشبكة يسار المربع الأوسط، أي نصف مربع عن المركز
 * (والمجمع مدار نصف دورة، فيقع على +x في إحداثياته)
 * The compound's entrance in its front wall: the main road runs on the grid line left of the middle tile, half a tile from
 * the centre (and the compound is turned half a turn, so it sits at +x in its own coordinates)
 */
export const COMPOUND_ENTRANCE_X = TILE_METRES / 2;

/** عرض الحديقة على كل جانب بالمتر / The garden's width on each side in metres */
const GARDEN_SIDE = 5.4;

/**
 * الساحة المرصوفة: من السور الأمامي حتى خلف القاعة بين حديقتي الجانبين، وما حولها أخضر. half نصف ضلع المجمع بالمتر
 * The paved forecourt: from the front wall to behind the hall between the two side gardens, green all around it.
 * half is half the compound side in metres
 */
export function compoundPlaza(half: number): Bed {
  return { x0: -half + GARDEN_SIDE, z0: -half + 3.2, x1: half - GARDEN_SIDE, z1: half - 0.6 };
}

/**
 * مجمع الحكم على tiles × tiles مربعات: قاعة في الخلف تكبر مع كل مستوى، وساحة أمامية مرصوفة بمدخل وساريتي علم، وحدائق على
 * الجانبين والخلف، وسور حجري منخفض بمدخل على الطريق الرئيسي؛ وفي العصر الحجري قاعة من الطوب بجناحين
 * The government compound on tiles × tiles: a hall at the back growing each level, a paved forecourt with an entrance and two
 * flagpoles, gardens on the sides and back, and a low stone wall open onto the main road; in the stone era a brick hall with two wings
 */
export function compoundAssembly(level: number, stone: boolean, tiles: number): Assembly {
  const half = (tiles * TILE_METRES) / 2;
  const edge = half - 0.6;
  const gx = COMPOUND_ENTRANCE_X;
  const pieces: KitPiece[] = [];

  // القاعة: أعرض وأعمق من أي بيت، وتزداد أبراجها مع المستوى / The hall: wider and deeper than any house, gaining towers as the level rises
  const roof: RoofColor = 'Green';
  const finish: Finish = stone ? 'brick' : level >= 3 ? 'plaster' : 'timber';
  const hall = house({ w: 8, d: level >= 3 || stone ? 12 : 10, finish, roof, floors: 2, extras: [{ path: V(stone ? 'Prop_Chimney2' : 'Prop_Chimney'), x: 2.6, z: -3, y: 6.6 }] });
  pieces.push(...moveBy(hall.pieces, 0, -4.4));
  const towers = stone ? 2 : level >= 5 ? 2 : level >= 3 ? 1 : 0;
  for (let i = 0; i < towers; i++) pieces.push(...tower(i ? -6.4 : 6.4, -0.6, stone ? 3 : 2 + Math.min(1, level - 3), finish));

  // المدخل: قوس حجري في السور الأمامي بين ساريتي علم، وصناديق وعربة عند السور
  // The entrance: a stone arch in the front wall between two flagpoles, crates and a wagon by the wall
  pieces.push({ path: V('Wall_Arch'), x: gx, z: edge, fit: 3.6 });
  pieces.push({ path: FLAG_POLE, x: gx - 3, z: edge - 1.6, fit: 6 + Math.min(level, 6) * 0.3 }, { path: FLAG_POLE, x: gx + 3, z: edge - 1.6, fit: 6 + Math.min(level, 6) * 0.3 });
  pieces.push(crate(-4.6, edge - 1.4), crate(-5.6, edge - 2.3));
  if (level >= 2) pieces.push(wagon(-3, 3.6, 0.4));

  // الحدائق: أشجار وشجيرات وزهور تزداد مع المستوى / The gardens: trees, bushes and flowers that grow in number with the level
  const sideX = half - GARDEN_SIDE / 2 - 0.4;
  for (const side of [-1, 1]) {
    pieces.push({ path: F(side < 0 ? 'CommonTree_1' : 'CommonTree_2'), x: side * sideX, z: -9.4, fit: 3.8 });
    pieces.push({ path: F('CommonTree_3'), x: side * sideX, z: 5.2, fit: 3.2 });
    pieces.push({ path: F('Bush_Common_Flowers'), x: side * sideX, z: 10, fit: 1.8 }, { path: F('Bush_Common_Flowers'), x: side * sideX, z: -2.4, fit: 1.7 });
    pieces.push({ path: F('Flower_3_Group'), x: side * (sideX - 1), z: 1.4, fit: 1.3 }, { path: F('Flower_4_Group'), x: side * (sideX + 0.9), z: -5.8, fit: 1.2 });
    if (level >= 2) pieces.push({ path: F('CommonTree_4'), x: side * sideX, z: -5, fit: 3 });
    if (level >= 3) pieces.push({ path: F('Flower_4_Group'), x: side * (sideX + 0.8), z: 7.6, fit: 1.2 }, { path: F('Flower_3_Group'), x: side * (sideX - 0.9), z: -12, fit: 1.2 });
  }
  for (let i = -2; i <= 2; i++) pieces.push({ path: F(i % 2 ? 'Flower_4_Group' : 'Bush_Common_Flowers'), x: i * 2.6, z: -half + 1.8, fit: i % 2 ? 1.1 : 1.5 });

  // السور المنخفض: ثلاثة أضلاع كاملة، والأمامي مفتوح عند المدخل / The low wall: three full sides, the front open at the entrance
  const gap = 1.8;
  pieces.push(
    { path: LOW_WALL, x: 0, z: -edge, fit: edge * 2 },
    { path: LOW_WALL, x: -edge, z: 0, fit: edge * 2, yaw: Math.PI / 2 },
    { path: LOW_WALL, x: edge, z: 0, fit: edge * 2, yaw: Math.PI / 2 },
    { path: LOW_WALL, x: (-edge + gx - gap) / 2, z: edge, fit: gx - gap + edge },
    { path: LOW_WALL, x: (edge + gx + gap) / 2, z: edge, fit: edge - gx - gap },
  );
  return { pieces, extent: tiles * TILE_METRES, size: tiles };
}

/**
 * مبنى الحكم حسب المرحلة: قاعة بطابقين أكبر من كل البيوت، أمامها ساحة مرصوفة بسارية علم؛ خشبية في القرية وحجرية في البلدة
 * (المدينة تستخدم نموذجها الحديث)
 * The government building by stage: a two-storey hall bigger than every house, with a paved forecourt and a flagpole;
 * timber in the village and stone in the town (the city uses its modern model)
 */
export function governmentAssembly(level: number): Assembly | null {
  if (level <= 1) {
    const hall = house({ w: 6, d: 6, finish: 'timber', roof: 'Green', floors: 2, extras: [{ ...chimney(2, -1.6), y: 6.6 }] });
    return {
      pieces: [
        ...shiftBack(hall.pieces, 1.8),
        ...forecourt(4, 2, 1.4),
        { path: FLAG_POLE, x: -3.4, z: 4.6, fit: 6 },
        { path: F('Bush_Common_Flowers'), x: 3.6, z: 4.4, fit: 1.4 }, { path: F('Flower_3_Group'), x: 4.2, z: 2.6, fit: 1.1 },
        { path: F('Flower_4_Group'), x: -4.3, z: 2.4, fit: 1 }, crate(4.2, -4.4), crate(-4.2, -4.4),
      ],
      extent: 11,
      size: 1,
    };
  }
  // البلدة: قاعة حجرية أعمق بساحة أوسع وسور مزخرف وأشجار / Town: a deeper stone hall with a wider forecourt, an ornate fence and trees
  if (level === 2) {
    const hall = house({ w: 6, d: 8, finish: 'brick', roof: 'Green', floors: 2, extras: [{ path: V('Prop_Chimney2'), x: 2, z: -2.5, y: 6.6 }] });
    return {
      pieces: [
        ...shiftBack(hall.pieces, 1.6),
        ...forecourt(4, 2, 2.4),
        { path: FLAG_POLE, x: -3.4, z: 5.6, fit: 7 }, { path: FLAG_POLE, x: 3.4, z: 5.6, fit: 7 },
        { path: V('Prop_MetalFence_Ornament'), x: -2.6, z: 6.6 }, { path: V('Prop_MetalFence_Ornament'), x: 2.6, z: 6.6 },
        { path: F('CommonTree_1'), x: -4.8, z: -4.6, fit: 2.6 }, { path: F('CommonTree_2'), x: 4.8, z: -4.6, fit: 2.4 },
        { path: F('Bush_Common_Flowers'), x: -4.6, z: 2.4, fit: 1.4 }, { path: F('Bush_Common_Flowers'), x: 4.6, z: 2.4, fit: 1.4 },
      ],
      extent: 13,
      size: 1,
    };
  }
  return null;
}
