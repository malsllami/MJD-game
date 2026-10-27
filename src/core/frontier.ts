// مسؤولية الملف: الغابة المحيطة كمنطق نقي — قطع الغابة قطعةً قطعة بمدة وتكلفة، وضم القطعة عند اكتمالها مع خشبها، وما قد تكشفه
// من مكمن عشوائي (حسب جدول موارد الغابة ومستوى مبنى الحكم) بغنى متفاوت، أو أرض فارغة
// File responsibility: the surrounding forest as pure logic — clearing it parcel by parcel for a time and a cost, annexing the parcel
// with its wood once done, and the random deposit it may reveal (by the forest resources table and the government level) with a
// varying richness, or empty land

import {
  annexCost, capacityAt, discoverNearTerritory, isUnderConstruction, missingResources, pay, tileKey, type Check,
} from './economy';
import { governmentLevel, governmentLevelOf, isUpgrading } from './levels';
import { addCapped } from './workforce';
import type { Deposit, GameDefinitions, GameState, Tile, World } from './types';

/** التوسع بقطع الغابة مفعّل؟ (صفر مدة = الضم الفوري القديم) / Is growth by clearing on? (zero time = the old instant annex) */
export const isForestMode = (defs: GameDefinitions): boolean => defs.world.clearingSeconds > 0;

/** القطع الجارية الآن / Clearings running now */
export function runningClearings(state: GameState, now: number) {
  return (state.clearings ?? []).filter((c) => now < c.completesAt);
}

/** الأعمال الجارية التي يحدها البناء المتزامن: إنشاء وترقية وقطع / Running work capped by concurrent builds: construction, upgrades and clearing */
export function activeWorks(state: GameState, now: number): number {
  return state.buildings.filter((b) => isUnderConstruction(b, now) || isUpgrading(b, now)).length + runningClearings(state, now).length;
}

/**
 * قطعة الغابة التي فيها المربع: شبكة قطع بطول annexBlockSize تبدأ من حافة مجمع الحكم، فتنتظم القرية الأولى قطعًا كاملة حوله
 * The forest parcel holding a tile: a grid of annexBlockSize parcels starting at the compound's edge, so the first village is whole parcels around it
 */
export function clearingParcel(defs: GameDefinitions, world: World, state: GameState, tile: { x: number; z: number }): Tile[] {
  const size = Math.max(1, defs.world.annexBlockSize);
  const water = new Set(defs.terrain.filter((t) => t.isWater).map((t) => t.id));
  const ox = state.settlement.x - (state.settlement.radius ?? 0);
  const oz = state.settlement.z - (state.settlement.radius ?? 0);
  const x0 = ox + Math.floor((tile.x - ox) / size) * size;
  const z0 = oz + Math.floor((tile.z - oz) / size) * size;
  const out: Tile[] = [];
  for (let z = z0; z < z0 + size; z++) {
    for (let x = x0; x < x0 + size; x++) {
      if (x < 0 || z < 0 || x >= world.settings.tilesX || z >= world.settings.tilesZ) continue;
      const t = world.tiles[z * world.settings.tilesX + x];
      if (!water.has(t.terrainId)) out.push(t);
    }
  }
  return out;
}

/** مربعات القطعة الجديدة: خارج الدولة وليست قيد القطع / The parcel's new tiles: outside the nation and not being cleared */
function freshTiles(defs: GameDefinitions, world: World, state: GameState, tile: Tile): Tile[] {
  const owned = new Set([...state.territory, ...(state.clearings ?? []).flatMap((c) => c.tiles)]);
  return clearingParcel(defs, world, state, tile).filter((t) => !owned.has(tileKey(t.x, t.z)));
}

/**
 * حصة التوسع: ما قُطع (المكتمل والجاري) من المسموح حتى مستوى الحكم الحالي؛ allowed قيمتها null بلا حد
 * The expansion quota: what was cleared (done and running) out of what the current government level allows; allowed is null for no limit
 */
export function expansionQuota(defs: GameDefinitions, state: GameState, now: number): { used: number; allowed: number | null } {
  return { used: (state.clearedParcels ?? 0) + runningClearings(state, now).length, allowed: governmentLevel(defs, state).expansionParcels };
}

/** هل يمكن بدء قطع قطعة الغابة التي فيها المربع؟ / Can clearing the tile's forest parcel start? */
export function checkClearing(defs: GameDefinitions, world: World, state: GameState, tile: Tile, now: number): Check {
  if (defs.terrain.find((t) => t.id === tile.terrainId)?.isWater) return { ok: false, reason: 'لا يمكن قطع مربع مائي' };
  if (state.territory.includes(tileKey(tile.x, tile.z))) return { ok: false, reason: 'هذه القطعة داخل حدود الدولة بالفعل' };
  const fresh = freshTiles(defs, world, state, tile);
  if (!fresh.length) return { ok: false, reason: 'يجري قطع هذه القطعة الآن' };
  const owned = new Set(state.territory);
  const touches = fresh.some((t) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => owned.has(tileKey(t.x + dx, t.z + dz))));
  if (!touches) return { ok: false, reason: 'تُقطع الغابة المجاورة لحدود الدولة فقط' };
  const quota = expansionQuota(defs, state, now);
  if (quota.allowed !== null && quota.used >= quota.allowed) {
    return { ok: false, reason: `بلغت حد التوسع (${quota.allowed} قطعة) لمستوى «${governmentLevel(defs, state).name}»؛ رقِّ مبنى الحكم لتتوسع أكثر` };
  }
  if (activeWorks(state, now) >= defs.world.maxConcurrentBuilds) {
    return { ok: false, reason: `وصلت للحد الأقصى من الأعمال المتزامنة (${defs.world.maxConcurrentBuilds})؛ انتظر اكتمال عمل` };
  }
  const shortage = missingResources(defs, state, annexCost(defs));
  if (shortage) return { ok: false, reason: `الموارد غير كافية؛ ينقص ${shortage}` };
  return { ok: true };
}

/** بدء القطع: دفع التكلفة وبدء المدة (بعد نجاح checkClearing) / Start clearing: pay and start the timer (after checkClearing) */
export function startClearing(state: GameState, defs: GameDefinitions, world: World, tile: Tile, now: number, uid: string): GameState {
  const tiles = freshTiles(defs, world, state, tile).map((t) => tileKey(t.x, t.z));
  // نتيجة البقعة تُسحب الآن وتُحفظ، فلا يغيرها انتظار ترقية ولا إعادة تحميل / The spot's result is drawn now and kept, so neither waiting for an upgrade nor reloading changes it
  const taken = [...(state.foundDeposits ?? []), ...(state.clearings ?? []).flatMap((c) => (c.result ? [c.result] : []))];
  const result = drawDeposit(defs, world, tiles, governmentLevelOf(defs, state), taken);
  return {
    ...state,
    resources: pay(state.resources, annexCost(defs)),
    clearings: [...(state.clearings ?? []), { uid, tiles, startedAt: now, completesAt: now + defs.world.clearingSeconds * 1000, result }],
  };
}

/**
 * القطع المكتملة حتى now: تنضم مربعاتها للدولة، ويُضاف خشبها حتى السعة، وتُسحب لها نتيجة من جدول موارد الغابة
 * Clearings complete by now: their tiles join the nation, their wood is added up to capacity, and each draws from the forest resources table
 */
export function settleClearings(state: GameState, defs: GameDefinitions, world: World, now: number): GameState {
  const done = (state.clearings ?? []).filter((c) => now >= c.completesAt);
  if (!done.length) return state;
  const level = governmentLevelOf(defs, state);
  const territory = new Set(state.territory);
  const found = [...(state.foundDeposits ?? [])];
  const resources = { ...state.resources };
  const woodCap = capacityAt(state, defs, now).wood ?? Infinity;
  for (const c of done) {
    for (const k of c.tiles) territory.add(k);
    resources.wood = addCapped(resources.wood ?? 0, defs.world.clearingWood, woodCap);
    // حفظ أقدم بلا نتيجة محفوظة يُسحب له الآن / An older save without a kept result draws it now
    const deposit = c.result !== undefined ? c.result : drawDeposit(defs, world, c.tiles, level, found);
    if (deposit) found.push(deposit);
  }
  const next: GameState = {
    ...state,
    resources,
    territory: [...territory],
    clearings: (state.clearings ?? []).filter((c) => now < c.completesAt),
    foundDeposits: found,
    clearedParcels: (state.clearedParcels ?? 0) + done.length,
  };
  return discoverNearTerritory(next, defs, world);
}

/** رقم عشوائي ثابت من نص (0 إلى أقل من 1) / A stable random number from text (0 up to 1) */
function random(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * سحب مكمن للقطعة من الأنواع التي يسمح بها مستوى الحكم؛ ما تبقى من المئة أرض فارغة. السحب ثابت لنفس العالم والقطعة والمستوى
 * Draws a deposit for the parcel from the types the government level allows; the rest of the hundred is empty land. The draw is stable
 * for the same world, parcel and level
 */
export function drawDeposit(defs: GameDefinitions, world: World, tiles: string[], level: number, existing: Deposit[] = []): Deposit | null {
  if (!tiles.length) return null;
  const seed = `${world.settings.seed}|${[...tiles].sort()[0]}|${level}`;
  const roll = random(`${seed}|kind`) * 100;
  let sum = 0;
  const pick = defs.frontierResources.filter((r) => r.minLevel <= level).find((r) => roll < (sum += r.chance));
  const type = pick && defs.deposits.find((d) => d.id === pick.depositTypeId);
  if (!pick || !type) return null;
  const centre = tiles[Math.floor(random(`${seed}|centre`) * tiles.length)];
  const [x, z] = centre.split(',').map(Number);
  // المكمن مربع أو مربعان متجاوران داخل القطعة / The deposit is one tile or two adjacent ones within the parcel
  const beside = tiles.filter((k) => {
    const [tx, tz] = k.split(',').map(Number);
    return Math.abs(tx - x) + Math.abs(tz - z) === 1;
  });
  const extra = random(`${seed}|size`) < 0.5 && beside.length ? [beside[Math.floor(random(`${seed}|side`) * beside.length)]] : [];
  const taken = new Set(existing.flatMap((d) => d.tiles));
  const own = [centre, ...extra].filter((k) => !taken.has(k));
  if (!own.length) return null;
  const richness = Math.round((pick.minRichness + random(`${seed}|rich`) * (pick.maxRichness - pick.minRichness)) * 100) / 100;
  return { id: `found-${type.id}-${centre}`, typeId: type.id, resourceId: type.resourceId, x, z, tiles: own, richness };
}
