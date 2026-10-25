// مسؤولية الملف: منطق الاقتصاد النقي — الحدود، المراحل، السكان، وضع المباني، الإنتاج والاستهلاك عبر الزمن، الغياب، والضم
// File responsibility: pure economy logic — territory, stages, population, placement, production and consumption over time, absence, annexation
//
// كل دالة تعيد حالة جديدة دون تعديل القديمة، والوقت يُمرَّر صراحة، فتبقى قابلة للاختبار.
// Every function returns a new state without mutating the old one, and time is passed explicitly.

import type { BuildingDef, GameDefinitions, GameState, PlacedBuilding, Stage, Tile, World } from './types';

/** مفتاح مربع / Tile key */
export const tileKey = (x: number, z: number): string => `${x},${z}`;

/** نتيجة التحقق: مسموح، أو ممنوع مع السبب / Check result: allowed, or refused with the reason */
export type Check = { ok: true } | { ok: false; reason: string };

/** حالة مبنى موضوع / Placed building status */
export type BuildingStatus =
  | { kind: 'constructing' }
  | { kind: 'operating' }
  | { kind: 'stopped'; missing: string[] }
  | { kind: 'disconnected' };

/** أنماط المجسم التي تُعامل كطرق / Model styles treated as roads */
export const ROAD_MODELS = new Set(['road', 'paved-road']);

export const isRoad = (def: BuildingDef | undefined): boolean => !!def && ROAD_MODELS.has(def.model);

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const MINUTE_MS = 60_000;
/** أقصى طول دفعة حساب: نفاد المورد يُكتشف خلال دقيقة على الأكثر / Max step length: a depleted input is caught within a minute */
const STEP_MS = MINUTE_MS;

// ===== المراحل والحدود / Stages and territory =====

/** المرحلة بمعرّفها / Stage by id */
export function stageById(defs: GameDefinitions, id: string): Stage {
  return defs.stages.find((s) => s.id === id) ?? defs.stages[0];
}

/** المرحلة التالية أو null / Next stage or null */
export function nextStage(defs: GameDefinitions, id: string): Stage | null {
  const i = defs.stages.findIndex((s) => s.id === id);
  return defs.stages[i + 1] ?? null;
}

/** مربعات اليابسة ضمن مربع حول نقطة (الحدود مربعة) / Land tiles within a square around a point (borders are square) */
export function landAround(defs: GameDefinitions, world: World, cx: number, cz: number, radius: number): string[] {
  const water = waterIds(defs);
  return world.tiles
    .filter((t) => !water.has(t.terrainId) && Math.abs(t.x - cx) <= radius && Math.abs(t.z - cz) <= radius)
    .map((t) => tileKey(t.x, t.z));
}

/**
 * قطعة الضم التي يقع فيها المربع: قطع ثابتة على شبكة العالم بطول ضلع annexBlockSize
 * The annex parcel holding a tile: fixed parcels on the world grid of side annexBlockSize
 */
export function annexBlock(defs: GameDefinitions, world: World, tile: Tile): Tile[] {
  const size = Math.max(1, defs.world.annexBlockSize);
  const water = waterIds(defs);
  const x0 = Math.floor(tile.x / size) * size;
  const z0 = Math.floor(tile.z / size) * size;
  const out: Tile[] = [];
  for (let z = z0; z < z0 + size; z++) {
    for (let x = x0; x < x0 + size; x++) {
      const t = world.tiles[z * world.settings.tilesX + x];
      if (t && x < world.settings.tilesX && !water.has(t.terrainId)) out.push(t);
    }
  }
  return out;
}

/**
 * حالة البداية في الموقع الذي اختاره اللاعب: الموارد الابتدائية، المرحلة الأولى، وحدودها
 * Start state at the chosen site: starting resources, the first stage and its territory
 */
export function createInitialState(defs: GameDefinitions, world: World, site: { x: number; z: number }, now: number): GameState {
  const resources: Record<string, number> = {};
  for (const r of defs.resources) resources[r.id] = r.startAmount;
  const first = defs.stages[0];
  return {
    settlement: { x: site.x, z: site.z },
    resources,
    population: 0,
    stage: first.id,
    buildings: [],
    territory: landAround(defs, world, site.x, site.z, first.territoryRadius),
    lastTick: now,
  };
}

/**
 * ترقية المرحلة عند بلوغ السكان المطلوبين، مع توسيع الحدود (لا تتراجع المرحلة أبدًا)
 * Advance the stage when population is reached, widening territory (the stage never goes back)
 */
export function applyStageProgress(state: GameState, defs: GameDefinitions, world: World): GameState {
  let next = nextStage(defs, state.stage);
  if (!next || state.population < next.population) return state;
  let stage = state.stage;
  while (next && state.population >= next.population) {
    stage = next.id;
    next = nextStage(defs, stage);
  }
  const reached = stageById(defs, stage);
  const territory = new Set(state.territory);
  for (const k of landAround(defs, world, state.settlement.x, state.settlement.z, reached.territoryRadius)) territory.add(k);
  return { ...state, stage, territory: [...territory] };
}

// ===== المباني / Buildings =====

export function isUnderConstruction(b: PlacedBuilding, now: number): boolean {
  return now < b.completesAt;
}

export function buildingAt(state: GameState, x: number, z: number): PlacedBuilding | undefined {
  return state.buildings.find((b) => b.x === x && b.z === z);
}

export function isSettlementTile(state: GameState, x: number, z: number): boolean {
  return state.settlement.x === x && state.settlement.z === z;
}

/** الموارد التي ينقصها المبنى ليعمل / Inputs the building lacks to operate */
function missingInputs(def: BuildingDef, resources: Record<string, number>): string[] {
  return Object.keys(def.consumption).filter((id) => (resources[id] ?? 0) <= 0);
}

// ===== الطرق / Roads =====

/**
 * مربعات الطرق المتصلة بمركز القرية (بحث عبر الطرق المتجاورة)؛ includePlanned تشمل الطرق تحت الإنشاء
 * Road tiles connected to the village centre (search across adjacent roads); includePlanned counts roads under construction
 */
export function connectedRoads(state: GameState, defs: GameDefinitions, at: number, includePlanned = false): Set<string> {
  const byId = new Map(defs.buildings.map((b) => [b.id, b]));
  const roads = new Set(
    state.buildings
      .filter((b) => isRoad(byId.get(b.buildingId)) && (includePlanned || b.completesAt <= at))
      .map((b) => tileKey(b.x, b.z)),
  );
  const connected = new Set<string>();
  const queue = [tileKey(state.settlement.x, state.settlement.z)];
  while (queue.length) {
    const [x, z] = queue.pop()!.split(',').map(Number);
    for (const [dx, dz] of NEIGHBOURS) {
      const k = tileKey(x + dx, z + dz);
      if (roads.has(k) && !connected.has(k)) {
        connected.add(k);
        queue.push(k);
      }
    }
  }
  return connected;
}

/** هل يجاور المربع طريقًا متصلًا أو مركز القرية؟ / Does the tile touch a connected road or the village centre? */
export function hasRoadAccess(state: GameState, x: number, z: number, connected: Set<string>): boolean {
  return NEIGHBOURS.some(([dx, dz]) => connected.has(tileKey(x + dx, z + dz)) || isSettlementTile(state, x + dx, z + dz));
}

/** حالة المبنى الآن / Building status now */
export function buildingStatus(placed: PlacedBuilding, state: GameState, defs: GameDefinitions, now: number): BuildingStatus {
  if (isUnderConstruction(placed, now)) return { kind: 'constructing' };
  const def = defs.buildings.find((b) => b.id === placed.buildingId);
  if (def?.requiresRoad && !hasRoadAccess(state, placed.x, placed.z, connectedRoads(state, defs, now))) return { kind: 'disconnected' };
  const missing = def ? missingInputs(def, state.resources) : [];
  return missing.length ? { kind: 'stopped', missing } : { kind: 'operating' };
}

/** خيارات التحقق للنقل / Check options used when moving */
interface PlacementOptions {
  ignoreUid?: string;
  alreadyBuilt?: boolean;
  cost?: Record<string, number>;
}

/**
 * هل يمكن وضع هذا المبنى على هذا المربع الآن؟ يعيد أول سبب يمنع ذلك
 * Can this building go on this tile now? Returns the first blocking reason
 */
export function checkPlacement(defs: GameDefinitions, state: GameState, building: BuildingDef, tile: Tile, now: number, opts: PlacementOptions = {}): Check {
  const required = stageById(defs, building.stage);
  if (!opts.alreadyBuilt && required.order > stageById(defs, state.stage).order) {
    return { ok: false, reason: `${building.name} يُفتح في مرحلة ${required.name} عند ${required.population} نسمة` };
  }
  if (!opts.alreadyBuilt && building.requiresTech) return { ok: false, reason: `${building.name} يتطلب بحثًا لم يُنجز بعد` };
  if (isSettlementTile(state, tile.x, tile.z)) return { ok: false, reason: 'هذا المربع يشغله مركز القرية' };
  if (!state.territory.includes(tileKey(tile.x, tile.z))) return { ok: false, reason: 'المربع خارج حدود الدولة؛ ضمّه للدولة أولًا' };
  const occupant = buildingAt(state, tile.x, tile.z);
  if (occupant && occupant.uid !== opts.ignoreUid) return { ok: false, reason: 'يوجد مبنى في هذا المربع' };
  if (!building.allowedTerrain.includes(tile.terrainId)) {
    const names = building.allowedTerrain.map((id) => defs.terrain.find((t) => t.id === id)?.name ?? id).join('، ');
    return { ok: false, reason: `${building.name} يُبنى على: ${names}` };
  }
  if (building.requiresRoad) {
    // الطرق المخططة تكفي للبناء، والتشغيل يحتاج اكتمالها / Planned roads allow building; operating needs them finished
    const roads = connectedRoads(opts.ignoreUid ? { ...state, buildings: state.buildings.filter((b) => b.uid !== opts.ignoreUid) } : state, defs, now, true);
    if (!hasRoadAccess(state, tile.x, tile.z, roads)) return { ok: false, reason: `${building.name} يحتاج طريقًا متصلًا بالقرية بجواره` };
  }
  if (!opts.alreadyBuilt && !isRoad(building)) {
    const byId = new Map(defs.buildings.map((b) => [b.id, b]));
    const active = state.buildings.filter((b) => isUnderConstruction(b, now) && !isRoad(byId.get(b.buildingId))).length;
    if (active >= defs.world.maxConcurrentBuilds) {
      return { ok: false, reason: `وصلت للحد الأقصى من البناء المتزامن (${defs.world.maxConcurrentBuilds})؛ انتظر اكتمال مبنى` };
    }
  }
  const shortage = missingResources(defs, state, opts.cost ?? building.cost);
  if (shortage) return { ok: false, reason: `الموارد غير كافية؛ ينقص ${shortage}` };
  return { ok: true };
}

/** نتيجة رسم مسار طريق / Outcome of drawing a road path */
export interface RoadPathResult {
  state: GameState;
  placed: number;
  /** سبب توقف الرسم قبل نهاية المسار / Why drawing stopped before the path's end */
  stoppedBy: string | null;
}

/**
 * رسم طريق على مسار مربعات: يتخطى مركز القرية والمربعات التي فيها طريق، ويتوقف عند أول مربع لا يُسمح فيه
 * Lay a road along a tile path: skips the village centre and existing roads, stops at the first refused tile
 */
export function placeRoadPath(state: GameState, defs: GameDefinitions, road: BuildingDef, path: Tile[], now: number, uid: () => string): RoadPathResult {
  let current = state;
  let placed = 0;
  for (const tile of path) {
    // مركز القرية نقطة اتصال، فالبدء منه أو المرور به لا يوقف الرسم / The village centre is a hub; starting or passing there is fine
    if (isSettlementTile(current, tile.x, tile.z)) continue;
    const existing = buildingAt(current, tile.x, tile.z);
    if (existing && isRoad(defs.buildings.find((b) => b.id === existing.buildingId))) continue;
    const check = checkPlacement(defs, current, road, tile, now);
    if (!check.ok) return { state: current, placed, stoppedBy: check.reason };
    current = placeBuilding(current, road, tile, now, uid());
    placed++;
  }
  return { state: current, placed, stoppedBy: null };
}

/** مسار مربعات متصل بين نقطتين (أفقي ثم عمودي) / Connected tile path between two points (horizontal then vertical) */
export function tilePath(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  let { x, z } = from;
  out.push({ x, z });
  while (x !== to.x) {
    x += Math.sign(to.x - x);
    out.push({ x, z });
  }
  while (z !== to.z) {
    z += Math.sign(to.z - z);
    out.push({ x, z });
  }
  return out;
}

// ===== الهدم والنقل / Demolition and moving =====

/** جزء من التكلفة بنسبة مئوية (مقرّب للأسفل) / A percentage of a cost (floored) */
export function costShare(cost: Record<string, number>, percent: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(cost)) {
    const share = Math.floor((n * percent) / 100);
    if (share > 0) out[id] = share;
  }
  return out;
}

/** هدم مبنى واسترداد نسبة من تكلفته / Demolish a building and refund part of its cost */
export function demolishBuilding(state: GameState, defs: GameDefinitions, uid: string): GameState {
  const placed = state.buildings.find((b) => b.uid === uid);
  const def = placed && defs.buildings.find((b) => b.id === placed.buildingId);
  if (!placed || !def) return state;
  const resources = { ...state.resources };
  for (const [id, n] of Object.entries(costShare(def.cost, defs.world.demolishRefundPercent))) resources[id] = (resources[id] ?? 0) + n;
  return { ...state, resources, buildings: state.buildings.filter((b) => b.uid !== uid) };
}

/** هل يمكن نقل المبنى إلى هذا المربع؟ / Can the building move to this tile? */
export function checkMove(defs: GameDefinitions, state: GameState, uid: string, tile: Tile, now: number): Check {
  const placed = state.buildings.find((b) => b.uid === uid);
  const def = placed && defs.buildings.find((b) => b.id === placed.buildingId);
  if (!placed || !def) return { ok: false, reason: 'المبنى غير موجود' };
  if (placed.x === tile.x && placed.z === tile.z) return { ok: false, reason: 'اختر مربعًا آخر غير موقع المبنى الحالي' };
  return checkPlacement(defs, state, def, tile, now, { ignoreUid: uid, alreadyBuilt: true, cost: costShare(def.cost, defs.world.moveCostPercent) });
}

/** نقل المبنى ودفع تكلفة النقل؛ يبقى تقدم إنشائه كما هو (بعد نجاح checkMove) / Move and pay; construction progress is kept */
export function moveBuilding(state: GameState, defs: GameDefinitions, uid: string, tile: Tile): GameState {
  const placed = state.buildings.find((b) => b.uid === uid)!;
  const def = defs.buildings.find((b) => b.id === placed.buildingId)!;
  return {
    ...state,
    resources: pay(state.resources, costShare(def.cost, defs.world.moveCostPercent)),
    buildings: state.buildings.map((b) => (b.uid === uid ? { ...b, x: tile.x, z: tile.z } : b)),
  };
}

/**
 * وضع المبنى: خصم التكلفة وبدء الإنشاء (بعد نجاح checkPlacement، وعلى حالة محسوبة حتى now)
 * Place the building: pay and start construction (after checkPlacement, on a state advanced to now)
 */
export function placeBuilding(state: GameState, building: BuildingDef, tile: Tile, now: number, uid: string): GameState {
  return {
    ...state,
    resources: pay(state.resources, building.cost),
    buildings: [...state.buildings, { uid, buildingId: building.id, x: tile.x, z: tile.z, startedAt: now, completesAt: now + building.buildSeconds * 1000 }],
  };
}

// ===== الزمن: الإنتاج والاستهلاك والسكان / Time: production, consumption and population =====

/**
 * تقدّم الزمن حتى now على دفعات لا تتجاوز دقيقة: في كل دفعة يعمل المبنى فقط إن توفرت مدخلاته،
 * ويتجه السكان نحو سعة المساكن العاملة، ثم تُفحص ترقية المرحلة
 * Advance time to now in steps of at most a minute: each step a building runs only if its inputs are in stock,
 * population moves toward the capacity of operating housing, then stage progress is checked
 */
export function advance(state: GameState, defs: GameDefinitions, world: World, now: number): GameState {
  if (now <= state.lastTick) return state;
  const byId = new Map(defs.buildings.map((b) => [b.id, b]));
  const resources = { ...state.resources };
  let population = state.population;

  for (let from = state.lastTick; from < now; from += STEP_MS) {
    const to = Math.min(now, from + STEP_MS);
    const stock = { ...resources };
    const roads = connectedRoads(state, defs, to);
    let capacity = 0;
    for (const placed of state.buildings) {
      const def = byId.get(placed.buildingId);
      const start = Math.max(from, placed.completesAt);
      if (!def || start >= to || missingInputs(def, stock).length) continue;
      if (def.requiresRoad && !hasRoadAccess(state, placed.x, placed.z, roads)) continue;
      const minutes = (to - start) / MINUTE_MS;
      for (const [id, n] of Object.entries(def.production)) resources[id] = (resources[id] ?? 0) + n * minutes;
      for (const [id, n] of Object.entries(def.consumption)) resources[id] = Math.max(0, (resources[id] ?? 0) - n * minutes);
      capacity += def.housing;
    }
    const change = defs.world.populationGrowthPerMinute * ((to - from) / MINUTE_MS);
    population = population < capacity ? Math.min(capacity, population + change) : Math.max(capacity, population - change);
  }
  return applyStageProgress({ ...state, resources, population, lastTick: now }, defs, world);
}

/**
 * صافي الإنتاج في الدقيقة الآن (الإنتاج ناقص الاستهلاك) للمباني العاملة
 * Net output per minute now (production minus consumption) of operating buildings
 */
export function netRates(state: GameState, defs: GameDefinitions, now: number): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const placed of state.buildings) {
    if (buildingStatus(placed, state, defs, now).kind !== 'operating') continue;
    const def = defs.buildings.find((b) => b.id === placed.buildingId)!;
    for (const [id, n] of Object.entries(def.production)) rates[id] = (rates[id] ?? 0) + n;
    for (const [id, n] of Object.entries(def.consumption)) rates[id] = (rates[id] ?? 0) - n;
  }
  return rates;
}

/** سعة المساكن العاملة الآن / Capacity of operating housing now */
export function housingCapacity(state: GameState, defs: GameDefinitions, now: number): number {
  return state.buildings.reduce((sum, placed) => {
    if (buildingStatus(placed, state, defs, now).kind !== 'operating') return sum;
    return sum + (defs.buildings.find((b) => b.id === placed.buildingId)?.housing ?? 0);
  }, 0);
}

/** ملخص العودة بعد الغياب / Summary of returning after an absence */
export interface Resume {
  state: GameState;
  awayMs: number;
  creditedMs: number;
  gained: Record<string, number>;
}

/**
 * العودة بعد الغياب: يُحسب الزمن حتى الحد الأقصى من الساعات فقط، ثم يبدأ العدّ من الآن
 * Returning after absence: time is credited only up to the cap, then counting resumes from now
 */
export function resumeAfterAbsence(state: GameState, defs: GameDefinitions, world: World, now: number): Resume {
  const awayMs = Math.max(0, now - state.lastTick);
  const creditedMs = Math.min(awayMs, defs.world.offlineCapHours * 3_600_000);
  const credited = advance(state, defs, world, state.lastTick + creditedMs);
  const gained: Record<string, number> = {};
  for (const [id, amount] of Object.entries(credited.resources)) {
    const diff = amount - (state.resources[id] ?? 0);
    if (diff >= 1) gained[id] = diff;
  }
  // المباني التي اكتملت بعد نهاية الوقت المحسوب تكتمل الآن / Buildings due after the credited window complete now
  return { state: { ...credited, lastTick: now }, awayMs, creditedMs, gained };
}

// ===== الضم / Annexation =====

/** مربعات القطعة التي لم تُضم بعد / Parcel tiles not yet in the nation */
function newBlockTiles(defs: GameDefinitions, world: World, state: GameState, tile: Tile): Tile[] {
  const owned = new Set(state.territory);
  return annexBlock(defs, world, tile).filter((t) => !owned.has(tileKey(t.x, t.z)));
}

/**
 * هل يمكن ضم قطعة الأرض التي فيها المربع؟ يجب أن تكون فيها يابسة جديدة تجاور الحدود، مع توفر التكلفة
 * Can the tile's parcel be annexed? It needs new land touching the borders, and must be affordable
 */
export function checkAnnex(defs: GameDefinitions, world: World, state: GameState, tile: Tile): Check {
  if (waterIds(defs).has(tile.terrainId)) return { ok: false, reason: 'لا يمكن ضم مربع مائي' };
  const fresh = newBlockTiles(defs, world, state, tile);
  if (!fresh.length) return { ok: false, reason: 'هذه القطعة داخل حدود الدولة بالفعل' };
  const owned = new Set(state.territory);
  const touches = fresh.some((t) => NEIGHBOURS.some(([dx, dz]) => owned.has(tileKey(t.x + dx, t.z + dz))));
  if (!touches) return { ok: false, reason: 'يمكن ضم القطع المجاورة لحدود الدولة فقط' };
  const shortage = missingResources(defs, state, annexCost(defs));
  if (shortage) return { ok: false, reason: `الموارد غير كافية؛ ينقص ${shortage}` };
  return { ok: true };
}

/** ضم القطعة كاملة ودفع تكلفتها (بعد نجاح checkAnnex) / Annex the whole parcel and pay (after checkAnnex succeeds) */
export function annexTile(state: GameState, defs: GameDefinitions, world: World, tile: Tile): GameState {
  const added = newBlockTiles(defs, world, state, tile).map((t) => tileKey(t.x, t.z));
  return { ...state, resources: pay(state.resources, annexCost(defs)), territory: [...state.territory, ...added] };
}

export function annexCost(defs: GameDefinitions): Record<string, number> {
  return { [defs.world.annexResource]: defs.world.annexCost };
}

/** وصف النقص بالموارد، أو null إن كانت كافية / Describes the shortfall, or null if affordable */
export function missingResources(defs: GameDefinitions, state: GameState, cost: Record<string, number>): string | null {
  const missing = Object.entries(cost)
    .filter(([id, n]) => Math.floor(state.resources[id] ?? 0) < n)
    .map(([id, n]) => `${Math.ceil(n - (state.resources[id] ?? 0))} ${defs.resources.find((r) => r.id === id)?.name ?? id}`);
  return missing.length ? missing.join('، ') : null;
}

function pay(resources: Record<string, number>, cost: Record<string, number>): Record<string, number> {
  const next = { ...resources };
  for (const [id, n] of Object.entries(cost)) next[id] = (next[id] ?? 0) - n;
  return next;
}

function waterIds(defs: GameDefinitions): Set<string> {
  return new Set(defs.terrain.filter((t) => t.isWater).map((t) => t.id));
}
