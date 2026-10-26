// مسؤولية الملف: تجميع جداول قاعدة البيانات الخام في تعريفات لعبة كاملة ومرتبة
// File responsibility: assembles raw database tables into complete, ordered game definitions

import type { DepositType, EntityType, GameDefinitions, Profession, Stage, WorldSettings } from './types';

/** صف خام بترتيب اختياري / Raw row with optional ordering */
interface Ordered {
  order?: number | null;
}

/** صف (مبنى، مورد، كمية في الدقيقة) / (building, resource, per-minute) row */
type PerMinuteRow = { buildingId: string; resourceId: string; perMinute: number | null };

/** الجداول كما يرسلها الخادم / Tables as sent by the server */
export interface RawTables {
  world: Partial<WorldSettings>;
  terrain: GameDefinitions['terrain'];
  resources: (GameDefinitions['resources'][number] & Ordered)[];
  buildingCategories: (GameDefinitions['buildingCategories'][number] & Ordered)[];
  buildings: ({
    id: string; name: string; category: string; allowedTerrain: string[]; buildSeconds: number;
    requiresTech: string; stage: string; housing: number | null; model: string; requiresRoad: boolean; requiresDeposit?: string;
    profession?: string; workers?: number | null; requiredPopulation?: number | null; requiredBuildings?: string[];
  } & Ordered)[];
  buildingCosts: { buildingId: string; resourceId: string; amount: number | null }[];
  buildingProduction: PerMinuteRow[];
  buildingConsumption: PerMinuteRow[];
  stages: (Omit<Stage, 'order' | 'requiredBuildings' | 'upgradeCost'> & { order: number | null; requiredBuildings?: string[]; upgradeCost?: string[] })[];
  ministries: (GameDefinitions['ministries'][number] & Ordered)[];
  contextCommands: { entityType: EntityType; id: string; name: string; icon: string; order: number | null }[];
  /** اختياري: لا يرسله خادم أقدم من إضافة العالم والمكامن / Optional: absent from servers older than the world addition */
  depositTypes?: (DepositType & { count: number | null })[];
  /** اختيارية: لا يرسلها خادم أقدم من إضافة الاقتصاد الحي / Optional: absent from servers older than the living economy addition */
  professions?: Profession[];
  storage?: { buildingId: string; resourceId: string; capacity: number | null }[];
  marketPrices?: { resourceId: string; buyPrice: number | null; sellPrice: number | null }[];
}

/** "gold:500" ← { gold: 500 }؛ الأرقام العربية مقبولة / "gold:500" → { gold: 500 }; Arabic digits accepted */
export function parseAmounts(items: string[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items ?? []) {
    const [id, value] = String(item).split(/[:：]/).map((s) => s.trim());
    const n = Number(String(value ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)));
    if (id && Number.isFinite(n) && n > 0) out[id] = (out[id] ?? 0) + n;
  }
  return out;
}

/** الجداول التي لا تعمل اللعبة بدونها / Tables the game cannot run without */
export const RAW_TABLE_IDS: (keyof RawTables)[] = [
  'world', 'terrain', 'resources', 'buildingCategories', 'buildings', 'buildingCosts',
  'buildingProduction', 'buildingConsumption', 'stages', 'ministries', 'contextCommands',
];

const REQUIRED_WORLD: (keyof WorldSettings)[] = [
  'seed', 'tilesX', 'tilesZ', 'tileSize', 'vertsPerTile', 'seaLevel', 'heightScale', 'depthScale',
  'noiseScale', 'moistureScale', 'islandFalloff', 'nationName', 'capitalName', 'capitalTerrain', 'defaultQuality',
  'startSiteCount', 'populationGrowthPerMinute', 'maxConcurrentBuilds', 'moveCostPercent', 'demolishRefundPercent',
  'dayLengthMinutes', 'offlineCapHours', 'annexResource', 'annexCost',
];

/**
 * إعدادات أُضيفت لاحقًا: إن لم تصل من خادم أقدم تُستخدم قيمة السلوك السابق حتى لا تتوقف اللعبة
 * Settings added later: if an older server omits them, the previous behaviour applies so the game keeps running
 */
const BACKWARD_COMPATIBLE: Partial<WorldSettings> = {
  annexBlockSize: 1,
  // بلا مناطق مسطحة ولا سلاسل ولا بحيرات مضافة، وكل المكامن ظاهرة، والمسح مجاني
  // No added flat zones, ranges or lakes; every deposit visible; surveying is free
  flatZoneRadius: 0,
  massifCount: 0,
  massifRadius: 0,
  lakeCount: 0,
  lakeRadius: 0,
  discoveryRadius: 9999,
  surveyRadius: 0,
  surveyResource: '',
  surveyCost: 0,
  governmentName: '',
  worldMode: 'continent',
  marketBuilding: '',
  developmentBuilding: '',
};

/**
 * إعدادات العالم مع قيم التوافق للخوادم القديمة؛ نوع عالم غير معروف يُعامل كقارة
 * World settings with backward-compatible defaults; an unknown world mode is treated as a continent
 */
function worldSettings(raw: Partial<WorldSettings>): WorldSettings {
  const world = { ...BACKWARD_COMPATIBLE, ...raw } as WorldSettings;
  const mode = String(world.worldMode ?? '').trim().toLowerCase();
  return { ...world, worldMode: mode === 'flat' ? 'flat' : 'continent' };
}

/** جمع صفوف (مبنى، مورد، كمية) في قاموس لكل مبنى / Sum (building, resource, amount) rows per building */
function perBuilding<T extends { buildingId: string; resourceId: string }>(rows: T[], amount: (r: T) => number | null) {
  const out = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const entry = out.get(r.buildingId) ?? {};
    entry[r.resourceId] = (entry[r.resourceId] ?? 0) + (amount(r) ?? 0);
    out.set(r.buildingId, entry);
  }
  return out;
}

const byOrder = (a: Ordered, b: Ordered): number => (a.order ?? 0) - (b.order ?? 0);

/**
 * يبني التعريفات ويتحقق من اكتمال إعدادات العالم ووجود مرحلة واحدة على الأقل
 * Builds definitions and validates complete world settings and at least one stage
 */
export function assembleDefinitions(raw: RawTables, version: string): GameDefinitions {
  const missing = REQUIRED_WORLD.filter((k) => raw.world[k] === undefined || raw.world[k] === null);
  if (missing.length) throw new Error(`إعدادات العالم ناقصة: ${missing.join('، ')}. شغّل آخر دالة إضافة في Apps Script`);
  if (!raw.stages.length) throw new Error('جدول مراحل التطور فارغ. شغّل آخر دالة إضافة في Apps Script');

  const costs = perBuilding(raw.buildingCosts, (r) => r.amount);
  const production = perBuilding(raw.buildingProduction, (r) => r.perMinute);
  const consumption = perBuilding(raw.buildingConsumption, (r) => r.perMinute);
  const stages: Stage[] = [...raw.stages].sort(byOrder).map((s, i) => ({
    id: s.id, name: s.name, order: s.order ?? i + 1, population: s.population ?? 0, territoryRadius: s.territoryRadius ?? 0, description: s.description,
    requiredBuildings: (s.requiredBuildings ?? []).filter(Boolean), upgradeCost: parseAmounts(s.upgradeCost),
  }));
  // سعة كل مخزن لكل مورد / Each store's capacity per resource
  const storage = new Map<string, Record<string, number>>();
  for (const r of raw.storage ?? []) {
    if (!r.buildingId || !r.resourceId || !r.capacity) continue;
    storage.set(r.buildingId, { ...(storage.get(r.buildingId) ?? {}), [r.resourceId]: (storage.get(r.buildingId)?.[r.resourceId] ?? 0) + r.capacity });
  }

  const menus = new Map<EntityType, RawTables['contextCommands']>();
  for (const c of raw.contextCommands) menus.set(c.entityType, [...(menus.get(c.entityType) ?? []), c]);

  return {
    version,
    world: worldSettings(raw.world),
    terrain: raw.terrain.map(({ id, name, color, priority, minElevation, maxElevation, minMoisture, maxMoisture, isWater, requiresWaterNeighbor }) => ({
      id, name, color, priority, minElevation, maxElevation, minMoisture, maxMoisture, isWater, requiresWaterNeighbor,
    })),
    resources: [...raw.resources].sort(byOrder).map(({ id, name, icon, color, startAmount, baseCapacity }) => ({
      id, name, icon, color, startAmount, baseCapacity: typeof baseCapacity === 'number' && baseCapacity > 0 ? baseCapacity : null,
    })),
    buildingCategories: [...raw.buildingCategories].sort(byOrder).map(({ id, name }) => ({ id, name })),
    buildings: [...raw.buildings].sort(byOrder).map((b) => ({
      id: b.id,
      name: b.name,
      category: b.category,
      allowedTerrain: b.allowedTerrain,
      buildSeconds: b.buildSeconds,
      cost: costs.get(b.id) ?? {},
      production: production.get(b.id) ?? {},
      consumption: consumption.get(b.id) ?? {},
      requiresTech: b.requiresTech || null,
      // مبنى بلا مرحلة يُفتح من البداية / A building with no stage is open from the start
      stage: b.stage || stages[0].id,
      housing: b.housing ?? 0,
      model: b.model,
      requiresRoad: b.requiresRoad === true,
      requiresDeposit: b.requiresDeposit || null,
      profession: b.profession || null,
      workers: b.workers ?? 0,
      requiredPopulation: b.requiredPopulation ?? 0,
      requiredBuildings: (b.requiredBuildings ?? []).filter(Boolean),
      storage: storage.get(b.id) ?? {},
    })),
    stages,
    deposits: (raw.depositTypes ?? []).map(({ id, name, resourceId, place, count, icon, color }) => ({ id, name, resourceId, place, count: count ?? 0, icon, color })),
    ministries: [...raw.ministries].sort(byOrder).map(({ id, name, description }) => ({ id, name, description })),
    contextMenus: [...menus].map(([entityType, list]) => ({
      entityType,
      commands: [...list].sort(byOrder).map(({ id, name, icon }) => ({ id, name, icon })),
    })),
    professions: (raw.professions ?? []).map(({ id, name, icon, color }: Profession) => ({ id, name, icon, color })),
    marketPrices: (raw.marketPrices ?? []).filter((p) => p.resourceId).map((p) => ({ resourceId: p.resourceId, buyPrice: p.buyPrice ?? 0, sellPrice: p.sellPrice ?? 0 })),
  };
}
