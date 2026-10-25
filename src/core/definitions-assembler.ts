// مسؤولية الملف: تجميع جداول قاعدة البيانات الخام في تعريفات لعبة كاملة ومرتبة
// File responsibility: assembles raw database tables into complete, ordered game definitions

import type { EntityType, GameDefinitions, Stage, WorldSettings } from './types';

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
    requiresTech: string; stage: string; housing: number | null; model: string; requiresRoad: boolean;
  } & Ordered)[];
  buildingCosts: { buildingId: string; resourceId: string; amount: number | null }[];
  buildingProduction: PerMinuteRow[];
  buildingConsumption: PerMinuteRow[];
  stages: (Omit<Stage, 'order'> & { order: number | null })[];
  ministries: (GameDefinitions['ministries'][number] & Ordered)[];
  contextCommands: { entityType: EntityType; id: string; name: string; icon: string; order: number | null }[];
}

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
  }));

  const menus = new Map<EntityType, RawTables['contextCommands']>();
  for (const c of raw.contextCommands) menus.set(c.entityType, [...(menus.get(c.entityType) ?? []), c]);

  return {
    version,
    world: raw.world as WorldSettings,
    terrain: raw.terrain.map(({ id, name, color, priority, minElevation, maxElevation, minMoisture, maxMoisture, isWater, requiresWaterNeighbor }) => ({
      id, name, color, priority, minElevation, maxElevation, minMoisture, maxMoisture, isWater, requiresWaterNeighbor,
    })),
    resources: [...raw.resources].sort(byOrder).map(({ id, name, icon, color, startAmount }) => ({ id, name, icon, color, startAmount })),
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
    })),
    stages,
    ministries: [...raw.ministries].sort(byOrder).map(({ id, name, description }) => ({ id, name, description })),
    contextMenus: [...menus].map(([entityType, list]) => ({
      entityType,
      commands: [...list].sort(byOrder).map(({ id, name, icon }) => ({ id, name, icon })),
    })),
  };
}
