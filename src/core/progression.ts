// مسؤولية الملف: ترقية الدولة من مبنى الحكم كمنطق نقي — شروط المرحلة التالية (السكان، المباني، التكلفة) والترقية نفسها
// File responsibility: upgrading the nation from the government building as pure logic — next-stage conditions (population,
// buildings, cost) and the upgrade itself

import { builtIds, enterStage, missingResources, nextStage, pay, type Check } from './economy';
import type { GameDefinitions, GameState, World } from './types';
import { formatNumber } from '../utils/format';

/** شرط واحد للترقية مع حالته / One upgrade condition with its state */
export interface Requirement {
  label: string;
  met: boolean;
}

/**
 * شروط الانتقال إلى المرحلة التالية؛ null حين تكون الدولة في أعلى مرحلة
 * Conditions to move into the next stage; null when the nation is at the top stage
 */
export function upgradeRequirements(defs: GameDefinitions, state: GameState, now: number): { stage: string; items: Requirement[] } | null {
  const next = nextStage(defs, state.stage);
  if (!next) return null;
  const built = builtIds(state, now);
  const name = (id: string) => defs.buildings.find((b) => b.id === id)?.name ?? id;
  const resource = (id: string) => defs.resources.find((r) => r.id === id)?.name ?? id;
  const items: Requirement[] = [{ label: `${formatNumber(next.population)} نسمة (الآن ${formatNumber(Math.floor(state.population))})`, met: Math.floor(state.population) >= next.population }];
  for (const id of next.requiredBuildings) items.push({ label: `بناء ${name(id)}`, met: built.has(id) });
  for (const [id, n] of Object.entries(next.upgradeCost)) items.push({ label: `${formatNumber(n)} ${resource(id)}`, met: Math.floor(state.resources[id] ?? 0) >= n });
  return { stage: next.name, items };
}

/** هل يمكن ترقية الدولة الآن؟ / Can the nation be upgraded now? */
export function checkUpgrade(defs: GameDefinitions, state: GameState, now: number): Check {
  const req = upgradeRequirements(defs, state, now);
  if (!req) return { ok: false, reason: 'الدولة في أعلى مرحلة' };
  const missing = req.items.filter((r) => !r.met).map((r) => r.label);
  return missing.length ? { ok: false, reason: `ينقص للترقية إلى ${req.stage}: ${missing.join('، ')}` } : { ok: true };
}

/**
 * ترقية مبنى الحكم: دفع التكلفة والانتقال للمرحلة التالية وتوسيع الحدود (بعد نجاح checkUpgrade)
 * Upgrade the government building: pay, move into the next stage and widen the borders (after checkUpgrade succeeds)
 */
export function upgradeGovernment(state: GameState, defs: GameDefinitions, world: World): GameState {
  const next = nextStage(defs, state.stage)!;
  if (missingResources(defs, state, next.upgradeCost)) return state;
  return enterStage({ ...state, resources: pay(state.resources, next.upgradeCost) }, defs, world, next.id);
}
