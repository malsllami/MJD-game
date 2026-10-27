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
  /** طول ضلع قطعة الأرض التي تُضم دفعة واحدة / Side length of the land parcel annexed at once */
  annexBlockSize: number;
  /** توليد العالم: المنطقة المسطحة حول مواقع العاصمة، والسلاسل الجبلية، والبحيرات / World shape: flat capital zones, ranges, lakes */
  flatZoneRadius: number;
  massifCount: number;
  massifRadius: number;
  lakeCount: number;
  lakeRadius: number;
  /** الاكتشاف والمسح / Discovery and survey */
  discoveryRadius: number;
  surveyRadius: number;
  surveyResource: string;
  surveyCost: number;
  governmentName: string;
  /** شكل العالم: أرض مستوية متصلة، أو قارة بجبال وبحيرات / World shape: connected flat land, or a continent with ranges and lakes */
  worldMode: WorldMode;
  /** معرف مبنى السوق، أو فارغ / The market building's id, or empty */
  marketBuilding: string;
  /** معرف مبنى التطوير، أو فارغ / The development building's id, or empty */
  developmentBuilding: string;
  /** توجيه البناء بعدد المربعات؛ صفر يلغي اقتراح تلك المنطقة / Placement guidance in tiles; zero turns that zone's suggestion off */
  adminZoneRadius: number;
  residentialZoneRadius: number;
  industrialRoadDistance: number;
  /** المربعات المحجوزة حول مبنى الحكم لساحته وحديقته (1 = 3 × 3) / Tiles reserved around the government building (1 = 3 × 3) */
  governmentRadius: number;
  /** بعد موارد البداية عن مبنى الحكم داخل القرية؛ صفر = خارجها / Starter resources' distance inside the village; zero = outside it */
  starterDepositDistance: number;
}

/** المنطقة المقترحة للمبنى / A building's suggested zone */
export type PlacementZone = 'residential' | 'administrative' | 'industrial' | 'agricultural';

export type WorldMode = 'flat' | 'continent';

/** مكان المكمن في العالم / Where a deposit forms */
export type DepositPlace = 'mountain' | 'forest' | 'desert';

/** نوع مكمن: معدن في سلسلة جبلية، أو غابة، أو حقل نفط / Deposit type: ore in a range, a forest, or an oil field */
export interface DepositType {
  id: string;
  name: string;
  resourceId: string;
  place: DepositPlace;
  count: number;
  icon: string;
  color: string;
}

/** مكمن موضوع في العالم بمربعاته / A deposit placed in the world, with its tiles */
export interface Deposit {
  id: string;
  typeId: string;
  resourceId: string;
  /** مركز المكمن / Deposit centre */
  x: number;
  z: number;
  /** مربعات المكمن بصيغة "x,z" / Deposit tiles as "x,z" keys */
  tiles: string[];
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
  /** السعة قبل بناء أي مخزن؛ null تعني بلا حد (خادم أقدم) / Capacity before any store; null means unlimited (older server) */
  baseCapacity: number | null;
}

/** مهنة سكان / A residents' trade */
export interface Profession {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** سعر مورد في السوق بالذهب / A resource's market price in gold */
export interface MarketPrice {
  resourceId: string;
  /** ما يدفعه اللاعب لشراء وحدة / What the player pays to buy one unit */
  buyPrice: number;
  /** ما يناله اللاعب ببيع وحدة / What the player gets for selling one unit */
  sellPrice: number;
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
  /** المباني المكتملة اللازمة لترقية الدولة إلى هذه المرحلة / Completed buildings needed to upgrade into this stage */
  requiredBuildings: string[];
  /** تكلفة الترقية إلى هذه المرحلة / Cost of upgrading into this stage */
  upgradeCost: Record<string, number>;
}

/** طراز سور القرية: أوتاد، ثم سياج أعلى بأبراج، ثم حجر / Village wall look: stakes, then a taller palisade with towers, then stone */
export type WallStyle = 'stakes' | 'palisade' | 'stone';

/** مستوى من مستويات مبنى الحكم / A government building level */
export interface GovernmentLevel {
  level: number;
  name: string;
  /** المرحلة التي تكون فيها الدولة عند هذا المستوى / The stage the nation is in at this level */
  stage: string;
  /** شروط الترقية إلى هذا المستوى / Conditions to upgrade into this level */
  population: number;
  requiredBuildings: string[];
  upgradeCost: Record<string, number>;
  /** أعلى مستوى يُسمح للمباني بالترقية إليه / The highest level buildings may be upgraded to */
  maxBuildingLevel: number;
  /** طراز سور القرية، أو null بلا سور / The village wall look, or null for no wall */
  wallStyle: WallStyle | null;
  description: string;
}

/** طراز شكل المبنى حسب مستواه / A building's look by its level */
export type BuildingStyle = 'wood' | 'stone';

/** مستوى من مستويات المباني / A building level */
export interface BuildingLevel {
  level: number;
  /** يُضرب فيه الإنتاج والاستهلاك والتخزين / Multiplies output, input and storage */
  productionFactor: number;
  /** يُضرب فيه سكان المسكن وعمال المبنى / Multiplies a home's residents and a building's workers */
  populationFactor: number;
  /** تكلفة الترقية إلى هذا المستوى ومدتها كنسبة من تكلفة البناء ومدته / Upgrade cost and time as % of the build cost and time */
  costPercent: number;
  timePercent: number;
  /** شكل المبنى، أو null فيتبع مرحلة الدولة (خادم أقدم) / The look, or null to follow the nation's stage (older server) */
  style: BuildingStyle | null;
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
  /** معرف المورد الذي يجب أن يُبنى المبنى على مكمنه، أو null / Resource whose deposit the building must sit on, or null */
  requiresDeposit: string | null;
  /** للسكن: مهنة سكانه؛ ولغيره: مهنة عماله؛ أو null / Housing: its residents' trade; others: its workers' trade; or null */
  profession: string | null;
  /** العمال اللازمون ليعمل بكامل طاقته (صفر = لا يحتاج عمالًا) / Workers needed for full output (zero = needs none) */
  workers: number;
  /** السكان اللازمون ليظهر في شريط البناء / Population needed for it to appear in the build bar */
  requiredPopulation: number;
  /** مبانٍ مكتملة لازمة ليظهر / Completed buildings needed for it to appear */
  requiredBuildings: string[];
  /** سعة التخزين التي يضيفها لكل مورد / Storage capacity it adds per resource */
  storage: Record<string, number>;
  /** المنطقة المقترحة لبنائه، أو null بلا اقتراح / Where it is suggested to go, or null for no suggestion */
  zone: PlacementZone | null;
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
  deposits: DepositType[];
  ministries: Ministry[];
  contextMenus: ContextMenuDef[];
  professions: Profession[];
  marketPrices: MarketPrice[];
  /** مرتبة تصاعديًا، والأول مستوى البداية / Ascending; the first is the starting level */
  governmentLevels: GovernmentLevel[];
  /** مرتبة تصاعديًا، والأول المستوى 1 / Ascending; the first is level 1 */
  buildingLevels: BuildingLevel[];
  /** معرفات المباني القائمة مع بداية اللعبة بالترتيب / Ids of the buildings standing at the start, in order */
  startBuildings: string[];
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
  /** مراكز المناطق المسطحة المقترحة للعاصمة / Centres of the flat zones offered as capital sites */
  basins: { x: number; z: number }[];
  deposits: Deposit[];
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
  /** سكان المسكن الآن (للمساكن فقط) / Residents living here now (housing only) */
  residents?: number;
  /** مستوى المبنى (1 إن غاب في حفظ أقدم)، ووقت اكتمال ترقيته الجارية إليه / The building's level (1 when absent), and when its running upgrade to it completes */
  level?: number;
  upgradeCompletesAt?: number;
}

/**
 * طريق على حافة بين مربعين: "h:x,z" من الزاوية (x,z) إلى (x+1,z)، و"v:x,z" من (x,z) إلى (x,z+1)
 * A road on the edge between two tiles: "h:x,z" runs from corner (x,z) to (x+1,z); "v:x,z" from (x,z) to (x,z+1)
 */
export interface PlacedRoad {
  uid: string;
  buildingId: string;
  edge: string;
  startedAt: number;
  completesAt: number;
}

/** حالة الدولة أثناء اللعب / Nation state during play */
export interface GameState {
  /** موقع القرية الأولى الذي اختاره اللاعب / The first village site chosen by the player */
  settlement: { x: number; z: number; /** مجمع الحكم المحجوز حوله؛ يغيب في حفظ أقدم (مربع واحد) / Reserved compound around it; absent in older saves */ radius?: number };
  /** الكميات بكسور حتى لا يضيع إنتاج الثواني؛ تُعرض مقرّبة للأسفل / Fractional so per-second output is kept; shown floored */
  resources: Record<string, number>;
  population: number;
  /** أعلى مرحلة بلغتها الدولة (لا تتراجع) / Highest stage reached (never goes back) */
  stage: string;
  /** مستوى مبنى الحكم؛ يغيب في حفظ أقدم فيُستنتج من المرحلة / The government level; absent in older saves, so derived from the stage */
  governmentLevel?: number;
  buildings: PlacedBuilding[];
  /** الطرق على حدود المربعات / Roads on tile edges */
  roads: PlacedRoad[];
  /** الأسوار والبوابات على حدود المربعات؛ لا تدخل في اتصال الطرق / Walls and gates on tile edges; never part of road connectivity */
  walls: PlacedRoad[];
  /** مربعات الدولة بصيغة "x,z" / Nation tiles as "x,z" keys */
  territory: string[];
  /** معرفات المكامن المكتشفة / Discovered deposit ids */
  discovered: string[];
  /** آخر وقت حُسب عنده الإنتاج / Last time production was applied */
  lastTick: number;
}
