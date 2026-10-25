// مسؤولية الملف: أنواع بيانات تعريف اللعبة (تأتي من قاعدة البيانات) وأنواع العالم المولَّد وحالة الدولة
// File responsibility: game-definition types (sourced from the database), generated-world types and nation state

/** مستوى جودة الرسوم / Graphics quality level */
export type QualityLevel = 'low' | 'medium' | 'high';

/** أنواع العناصر التي يمكن تحديدها في العالم / Selectable entity kinds */
export type EntityType = 'city' | 'empty_tile' | 'building' | 'mine' | 'port' | 'unit' | 'nation';

/** إعدادات توليد العالم وبداية اللعبة / World generation and game start settings */
export interface WorldSettings {
  seed: number;
  tilesX: number;
  tilesZ: number;
  tileSize: number;
  vertsPerTile: number;
  seaLevel: number;
  heightScale: number;
  depthScale: number;
  noiseScale: number;
  moistureScale: number;
  islandFalloff: number;
  nationName: string;
  capitalName: string;
  /** أنواع الأرض المسموح أن تبدأ عليها القرية / Terrain the first village may start on */
  capitalTerrain: string[];
  defaultQuality: QualityLevel | 'auto';
  startSiteCount: number;
  populationGrowthPerMinute: number;
  maxConcurrentBuilds: number;
  moveCostPercent: number;
  demolishRefundPercent: number;
  /** مدة يوم اللعبة بالدقائق الحقيقية؛ صفر = ساعة الجهاز / Game day length in real minutes; 0 = device clock */
  dayLengthMinutes: number;
  offlineCapHours: number;
  annexResource: string;
  annexCost: number;
}

/** نوع تضاريس وشروط تصنيف المربع إليه / Terrain type and the rule that assigns tiles to it */
export interface TerrainType {
  id: string;
  name: string;
  color: string;
  priority: number;
  minElevation: number;
  maxElevation: number;
  minMoisture: number;
  maxMoisture: number;
  isWater: boolean;
  requiresWaterNeighbor: boolean;
}

/** مورد اقتصادي / Economic resource */
export interface ResourceDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  startAmount: number;
}

/** فئة مبانٍ في شريط البناء / Building category */
export interface BuildingCategory {
  id: string;
  name: string;
}

/** مرحلة تطور: قرية، بلدة، مدينة... / Development stage: village, town, city... */
export interface Stage {
  id: string;
  name: string;
  order: number;
  /** السكان اللازمون لبلوغ المرحلة / Population needed to reach the stage */
  population: number;
  territoryRadius: number;
  description: string;
}

/** تعريف مبنى / Building definition */
export interface BuildingDef {
  id: string;
  name: string;
  category: string;
  allowedTerrain: string[];
  buildSeconds: number;
  cost: Record<string, number>;
  /** الإنتاج والاستهلاك في الدقيقة لكل مورد / Output and input per minute by resource */
  production: Record<string, number>;
  consumption: Record<string, number>;
  requiresTech: string | null;
  /** المرحلة التي يُفتح فيها / Stage that unlocks it */
  stage: string;
  /** عدد السكان الذين يسكنونه / Residents it houses */
  housing: number;
  /** شكل المجسم ثلاثي الأبعاد / 3D model style */
  model: string;
  /** لا يُبنى ولا يعمل إلا بجوار طريق متصل بالقرية / Builds and runs only next to a road connected to the village */
  requiresRoad: boolean;
}

/** وزارة في لوحة الحكم / Government ministry */
export interface Ministry {
  id: string;
  name: string;
  description: string;
}

/** أمر في القائمة الدائرية / Radial-menu command */
export interface ContextCommand {
  id: string;
  name: string;
  icon: string;
}

/** أوامر نوع عنصر معيّن / Commands available for one entity type */
export interface ContextMenuDef {
  entityType: EntityType;
  commands: ContextCommand[];
}

/** كل تعريفات اللعبة دفعة واحدة / Full game definitions bundle */
export interface GameDefinitions {
  version: string;
  world: WorldSettings;
  terrain: TerrainType[];
  resources: ResourceDef[];
  buildingCategories: BuildingCategory[];
  buildings: BuildingDef[];
  /** مرتبة تصاعديًا / Sorted ascending */
  stages: Stage[];
  ministries: Ministry[];
  contextMenus: ContextMenuDef[];
}

/** مربع منطقي في شبكة العالم / Logical tile of the world grid */
export interface Tile {
  x: number;
  z: number;
  terrainId: string;
  elevation: number;
  moisture: number;
}

/** العالم المولَّد / Generated world */
export interface World {
  settings: WorldSettings;
  vertsX: number;
  vertsZ: number;
  heights: Float32Array;
  tiles: Tile[];
}

/** مبنى موضوع على مربع / A building placed on a tile */
export interface PlacedBuilding {
  uid: string;
  buildingId: string;
  x: number;
  z: number;
  /** وقت بدء الإنشاء ووقت اكتماله (ميلي ثانية) / Construction start and completion times (ms) */
  startedAt: number;
  completesAt: number;
}

/** حالة الدولة أثناء اللعب / Nation state during play */
export interface GameState {
  /** موقع القرية الأولى الذي اختاره اللاعب / The first village site chosen by the player */
  settlement: { x: number; z: number };
  /** الكميات بكسور حتى لا يضيع إنتاج الثواني؛ تُعرض مقرّبة للأسفل / Fractional so per-second output is kept; shown floored */
  resources: Record<string, number>;
  population: number;
  /** أعلى مرحلة بلغتها الدولة (لا تتراجع) / Highest stage reached (never goes back) */
  stage: string;
  buildings: PlacedBuilding[];
  /** مربعات الدولة بصيغة "x,z" / Nation tiles as "x,z" keys */
  territory: string[];
  /** آخر وقت حُسب عنده الإنتاج / Last time production was applied */
  lastTick: number;
}
