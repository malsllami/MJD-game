// مسؤولية الملف: الترقيات كمنطق نقي — ترقية مبنى الحكم مستوى بعد مستوى (السكان، المباني، التكلفة، وتغيّر المرحلة عند حدودها)،
// وترقية كل مبنى بتكلفة ومدة حتى المستوى الذي يسمح به مبنى الحكم
// File responsibility: upgrades as pure logic — the government building level by level (population, buildings, cost, and the stage
// change at its thresholds), and each building for a cost and time up to the level the government allows

import { builtIds, enterStage, isUnderConstruction, missingResources, pay, type Check } from './economy';
import { governmentLevel, governmentLevelOf, isUpgradable, isUpgrading, levelRow } from './levels';
import type { GameDefinitions, GameState, World } from './types';
import { formatNumber } from '../utils/format';

/** شرط واحد للترقية مع حالته / One upgrade condition with its state */
export interface Requirement {
  label: string;
  met: boolean;
}

/**
 * شروط الترقية إلى مستوى الحكم التالي؛ null حين يكون في أعلى مستوى
 * Conditions to upgrade into the next government level; null at the top level
 */
export function upgradeRequirements(defs: GameDefinitions, state: GameState, now: number): { stage: string; items: Requirement[] } | null {
  const next = defs.governmentLevels[governmentLevelOf(defs, state)];
  if (!next) return null;
  const built = builtIds(state, now);
  const name = (id: string) => defs.buildings.find((b) => b.id === id)?.name ?? id;
  const resource = (id: string) => defs.resources.find((r) => r.id === id)?.name ?? id;
  const items: Requirement[] = [{ label: `${formatNumber(next.population)} نسمة (الآن ${formatNumber(Math.floor(state.population))})`, met: Math.floor(state.population) >= next.population }];
  for (const id of next.requiredBuildings) items.push({ label: `بناء ${name(id)}`, met: built.has(id) });
  for (const [id, n] of Object.entries(next.upgradeCost)) items.push({ label: `${formatNumber(n)} ${resource(id)}`, met: Math.floor(state.resources[id] ?? 0) >= n });
  return { stage: next.name, items };
}

/** هل يمكن ترقية مبنى الحكم الآن؟ / Can the government building be upgraded now? */
export function checkUpgrade(defs: GameDefinitions, state: GameState, now: number): Check {
  const req = upgradeRequirements(defs, state, now);
  if (!req) return { ok: false, reason: 'مبنى الحكم في أعلى مستوى' };
  const missing = req.items.filter((r) => !r.met).map((r) => r.label);
  return missing.length ? { ok: false, reason: `ينقص للترقية إلى ${req.stage}: ${missing.join('، ')}` } : { ok: true };
}

/**
 * ترقية مبنى الحكم مستوى واحدًا: دفع التكلفة، وإن كان المستوى في مرحلة جديدة تنتقل الدولة إليها وتتسع حدودها (بعد نجاح checkUpgrade)
 * Upgrade the government one level: pay, and when the level lies in a new stage the nation enters it and its borders widen (after checkUpgrade)
 */
export function upgradeGovernment(state: GameState, defs: GameDefinitions, world: World): GameState {
  const next = defs.governmentLevels[governmentLevelOf(defs, state)];
  if (!next || missingResources(defs, state, next.upgradeCost)) return state;
  const paid = { ...state, resources: pay(state.resources, next.upgradeCost), governmentLevel: next.level };
  return next.stage === state.stage ? paid : enterStage(paid, defs, world, next.stage);
}

/** تكلفة ترقية المبنى إلى المستوى ومدتها بالثواني / The cost and seconds of upgrading a building to the level */
export function buildingUpgradeCost(defs: GameDefinitions, buildingId: string, toLevel: number): { cost: Record<string, number>; seconds: number } {
  const def = defs.buildings.find((b) => b.id === buildingId)!;
  const row = levelRow(defs, toLevel);
  const cost = Object.fromEntries(Object.entries(def.cost).map(([id, n]) => [id, Math.ceil((n * row.costPercent) / 100)]).filter(([, n]) => (n as number) > 0));
  return { cost, seconds: Math.ceil((def.buildSeconds * row.timePercent) / 100) };
}

/** هل يمكن ترقية المبنى الآن؟ / Can the building be upgraded now? */
export function checkBuildingUpgrade(defs: GameDefinitions, state: GameState, uid: string, now: number): Check {
  const placed = state.buildings.find((b) => b.uid === uid);
  const def = placed && defs.buildings.find((b) => b.id === placed.buildingId);
  if (!placed || !def) return { ok: false, reason: 'المبنى غير موجود' };
  if (!isUpgradable(def)) return { ok: false, reason: `${def.name} لا يُرقّى` };
  if (isUnderConstruction(placed, now) || isUpgrading(placed, now)) return { ok: false, reason: `${def.name} قيد البناء؛ انتظر اكتماله` };
  const next = (placed.level ?? 1) + 1;
  if (next > defs.buildingLevels.length) return { ok: false, reason: `${def.name} في أعلى مستوى` };
  const government = governmentLevel(defs, state);
  if (next > government.maxBuildingLevel) return { ok: false, reason: `رقِّ مبنى الحكم أولًا؛ يسمح «${government.name}» بالمستوى ${formatNumber(government.maxBuildingLevel)} للمباني` };
  const active = state.buildings.filter((b) => isUnderConstruction(b, now) || isUpgrading(b, now)).length;
  if (active >= defs.world.maxConcurrentBuilds) return { ok: false, reason: `وصلت للحد الأقصى من البناء المتزامن (${defs.world.maxConcurrentBuilds})؛ انتظر اكتمال مبنى` };
  const shortage = missingResources(defs, state, buildingUpgradeCost(defs, def.id, next).cost);
  if (shortage) return { ok: false, reason: `الموارد غير كافية؛ ينقص ${shortage}` };
  return { ok: true };
}

/**
 * ترقية المبنى مستوى واحدًا: دفع التكلفة وبدء المدة؛ يبقى يعمل بمستواه السابق حتى تكتمل (بعد نجاح checkBuildingUpgrade)
 * Upgrade the building one level: pay and start the timer; it keeps running at its old level until done (after checkBuildingUpgrade)
 */
export function upgradeBuilding(state: GameState, defs: GameDefinitions, uid: string, now: number): GameState {
  const placed = state.buildings.find((b) => b.uid === uid);
  if (!placed) return state;
  const next = (placed.level ?? 1) + 1;
  const { cost, seconds } = buildingUpgradeCost(defs, placed.buildingId, next);
  return {
    ...state,
    resources: pay(state.resources, cost),
    buildings: state.buildings.map((b) => (b.uid === uid ? { ...b, level: next, upgradeCompletesAt: now + seconds * 1000 } : b)),
  };
}
