// مسؤولية الملف: المستويات كمنطق نقي — مستوى كل مبنى ومضاعفاته (الإنتاج والسكان والعمال والتخزين)، ومستوى مبنى الحكم الحالي
// File responsibility: levels as pure logic — each building's level and its factors (output, residents, workers, storage),
// and the government building's current level

import type { BuildingDef, BuildingLevel, GameDefinitions, GameState, GovernmentLevel, PlacedBuilding } from './types';

/** هل تجري ترقية المبنى الآن؟ يبقى يعمل بمستواه السابق حتى تكتمل / Is the building being upgraded now? It runs at its old level until done */
export function isUpgrading(b: PlacedBuilding, now: number): boolean {
  return b.upgradeCompletesAt !== undefined && now < b.upgradeCompletesAt;
}

/** مستوى المبنى الفعلي الآن (الحفظ الأقدم بلا مستوى = 1) / The building's effective level now (an older save without one = 1) */
export function levelOf(b: PlacedBuilding, now: number): number {
  return Math.max(1, (b.level ?? 1) - (isUpgrading(b, now) ? 1 : 0));
}

/** صف المستوى، وآخر صف لما يتجاوز الجدول / The level's row, or the last one beyond the table */
export function levelRow(defs: GameDefinitions, level: number): BuildingLevel {
  return defs.buildingLevels[Math.min(level, defs.buildingLevels.length) - 1];
}

/** مضاعفا المبنى الآن / The building's two factors now */
export function factorsOf(defs: GameDefinitions, b: PlacedBuilding, now: number): { production: number; population: number } {
  const row = levelRow(defs, levelOf(b, now));
  return { production: row.productionFactor, population: row.populationFactor };
}

/** سكان المسكن وعمال المبنى بعد المضاعف / A home's residents and a building's workers after the factor */
export const housingAt = (def: BuildingDef, factor: number): number => Math.floor(def.housing * factor);
export const workersAt = (def: BuildingDef, factor: number): number => Math.ceil(def.workers * factor);

/** هل في ترقية المبنى فائدة؟ (إنتاج أو سكان أو عمال أو تخزين) / Does upgrading the building do anything? */
export function isUpgradable(def: BuildingDef): boolean {
  return Object.keys(def.production).length > 0 || def.housing > 0 || def.workers > 0 || Object.keys(def.storage).length > 0;
}

/** رقم مستوى الحكم؛ الحفظ الأقدم يُستنتج من مرحلته / The government level number; an older save derives it from its stage */
export function governmentLevelOf(defs: GameDefinitions, state: GameState): number {
  if (state.governmentLevel) return Math.min(state.governmentLevel, defs.governmentLevels.length);
  return defs.governmentLevels.findIndex((l) => l.stage === state.stage) + 1 || 1;
}

/** صف مستوى الحكم الحالي / The current government level's row */
export function governmentLevel(defs: GameDefinitions, state: GameState): GovernmentLevel {
  return defs.governmentLevels[governmentLevelOf(defs, state) - 1];
}
