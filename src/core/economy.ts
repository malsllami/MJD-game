// مسؤولية الملف: منطق الاقتصاد النقي — الحدود، المراحل، السكان، الطرق على حدود المربعات، وضع المباني، المكامن والاكتشاف،
// الإنتاج والاستهلاك عبر الزمن، الغياب، والضم
// File responsibility: pure economy logic — territory, stages, population, roads on tile edges, placement, deposits and discovery,
// production and consumption over time, absence, and annexation
//
// كل دالة تعيد حالة جديدة دون تعديل القديمة، والوقت يُمرَّر صراحة، فتبقى قابلة للاختبار.
// Every function returns a new state without mutating the old one, and time is passed explicitly.

import type { BuildingDef, Deposit, GameDefinitions, GameState, PlacedBuilding, Stage, Tile, World } from './types';
import { addCapped, capacities, seedResidents, settle, staffing } from './workforce';

/** مفتاح مربع أو زاوية / Tile or corner key */
export const tileKey = (x: number, z: number): string => `${x},${z}`;

/** نتيجة التحقق: مسموح، أو ممنوع مع السبب / Check result: allowed, or refused with the reason */
export type Check = { ok: true } | { ok: false; reason: string };

/** حالة مبنى موضوع / Placed building status */
export type BuildingStatus =
  | { kind: 'constructing' }
  | { kind: 'operating' }
  | { kind: 'stopped'; missing: string[] }
  | { kind: 'disconnected' }
  /** يعمل لكن بلا أي عامل من مهنته / Running but with no worker of its trade */
  | { kind: 'understaffed'; profession: string };

/** أنماط المجسم التي تُعامل كطرق / Model styles treated as roads */
export const ROAD_MODELS = new Set(['road', 'paved-road']);

export const isRoad = (def: BuildingDef | undefined): boolean => !!def && ROAD_MODELS.has(def.model);

/**
 * حواجز الحواف: أسوار وبوابات وجداول ماء؛ تشغل الحافة فلا يُرسم عليها طريق، ولا تدخل في اتصال الطرق
 * Edge barriers: walls, gates and water streams; they occupy the edge so no road goes there, and never join road connectivity
 */
export const WALL_MODELS = new Set(['wall', 'gate', 'stream']);

export const isWall = (def: BuildingDef | undefined): boolean => !!def && WALL_MODELS.has(def.model);

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
      const t = x < world.settings.tilesX ? world.tiles[z * world.settings.tilesX + x] : undefined;
      if (t && !water.has(t.terrainId)) out.push(t);
    }
  }
  return out;
}

/**
 * حالة البداية في الموقع الذي اختاره اللاعب: الموارد الابتدائية، المرحلة الأولى، حدودها، والمكامن الظاهرة منها
 * Start state at the chosen site: starting resources, the first stage, its territory and the deposits visible from it
 */
export function createInitialState(defs: GameDefinitions, world: World, site: { x: number; z: number }, now: number): GameState {
  const resources: Record<string, number> = {};
  for (const r of defs.resources) resources[r.id] = r.startAmount;
  const first = defs.stages[0];
  const state: GameState = {
    settlement: { x: site.x, z: site.z },
    resources,
    population: 0,
    stage: first.id,
    buildings: [],
    roads: [],
    walls: [],
    territory: landAround(defs, world, site.x, site.z, first.territoryRadius),
    discovered: [],
    lastTick: now,
  };
  return discoverNearTerritory(state, defs, world);
}

/**
 * الانتقال إلى مرحلة مع توسيع الحدود واكتشاف ما قربها (يُستدعى بعد نجاح ترقية مبنى الحكم)
 * Move into a stage, widening territory and discovering near it (called after a successful government upgrade)
 */
export function enterStage(state: GameState, defs: GameDefinitions, world: World, stageId: string): GameState {
  const reached = stageById(defs, stageId);
  const territory = new Set(state.territory);
  for (const k of landAround(defs, world, state.settlement.x, state.settlement.z, reached.territoryRadius)) territory.add(k);
  return discoverNearTerritory({ ...state, stage: stageId, territory: [...territory] }, defs, world);
}

// ===== فتح المباني / Unlocking buildings =====

/** مبانٍ مكتملة بمعرفها / Completed buildings by id */
export function builtIds(state: GameState, now: number): Set<string> {
  return new Set(state.buildings.filter((b) => !isUnderConstruction(b, now)).map((b) => b.buildingId));
}

/**
 * ما ينقص المبنى ليُفتح: المرحلة، والتقنية، والسكان، والمباني المكتملة المطلوبة؛ قائمة فارغة تعني أنه مفتوح
 * What a building lacks to unlock: stage, research, population and required completed buildings; an empty list means unlocked
 */
export function unlockGaps(def: BuildingDef, state: GameState, defs: GameDefinitions, now: number): string[] {
  const gaps: string[] = [];
  const required = stageById(defs, def.stage);
  if (required.order > stageById(defs, state.stage).order) gaps.push(`ترقية الدولة إلى ${required.name}`);
  if (def.requiresTech) gaps.push('بحث لم يُنجز بعد');
  if (Math.floor(state.population) < def.requiredPopulation) gaps.push(`${def.requiredPopulation} نسمة`);
  const built = builtIds(state, now);
  for (const id of def.requiredBuildings) if (!built.has(id)) gaps.push(defs.buildings.find((b) => b.id === id)?.name ?? id);
  return gaps;
}

export function isUnlocked(def: BuildingDef, state: GameState, defs: GameDefinitions, now: number): boolean {
  return unlockGaps(def, state, defs, now).length === 0;
}

// ===== المكامن والاكتشاف / Deposits and discovery =====

/** المكامن التي تقع على بعد discoveryRadius من الحدود تصبح مكتشفة / Deposits within discoveryRadius of the borders become discovered */
export function discoverNearTerritory(state: GameState, defs: GameDefinitions, world: World): GameState {
  return discoverWhere(state, world, (x, z) => nearTerritory(state, x, z, defs.world.discoveryRadius));
}

function nearTerritory(state: GameState, x: number, z: number, radius: number): boolean {
  const owned = new Set(state.territory);
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) if (owned.has(tileKey(x + dx, z + dz))) return true;
  return false;
}

function discoverWhere(state: GameState, world: World, near: (x: number, z: number) => boolean): GameState {
  const known = new Set(state.discovered);
  const found = world.deposits.filter((d) => !known.has(d.id) && d.tiles.some((k) => {
    const [x, z] = k.split(',').map(Number);
    return near(x, z);
  }));
  return found.length ? { ...state, discovered: [...state.discovered, ...found.map((d) => d.id)] } : state;
}

/** المكمن المكتشف في المربع لمورد معيّن / The discovered deposit on a tile for a resource */
export function depositAt(world: World, state: GameState, x: number, z: number, resourceId?: string): Deposit | undefined {
  const key = tileKey(x, z);
  return world.deposits.find((d) => state.discovered.includes(d.id) && (!resourceId || d.resourceId === resourceId) && d.tiles.includes(key));
}

/** تكلفة مسح الموارد / Survey cost */
export function surveyCost(defs: GameDefinitions): Record<string, number> {
  return defs.world.surveyResource && defs.world.surveyCost ? { [defs.world.surveyResource]: defs.world.surveyCost } : {};
}

/**
 * مسح الموارد حول مربع: يكشف المكامن ضمن surveyRadius ويدفع التكلفة؛ يعيد المكامن الجديدة
 * Survey around a tile: reveals deposits within surveyRadius and pays; returns the newly found deposits
 */
export function surveyTile(state: GameState, defs: GameDefinitions, world: World, tile: Tile): { state: GameState; found: Deposit[] } | { reason: string } {
  const shortage = missingResources(defs, state, surveyCost(defs));
  if (shortage) return { reason: `الموارد غير كافية للمسح؛ ينقص ${shortage}` };
  const r = defs.world.surveyRadius;
  const before = new Set(state.discovered);
  const next = discoverWhere({ ...state, resources: pay(state.resources, surveyCost(defs)) }, world, (x, z) => Math.hypot(x - tile.x, z - tile.z) <= r);
  return { state: next, found: world.deposits.filter((d) => next.discovered.includes(d.id) && !before.has(d.id)) };
}

// ===== الطرق على حدود المربعات / Roads on tile edges =====

/** أضلاع المربع الأربعة / The four edges of a tile */
export function tileEdges(x: number, z: number): string[] {
  return [`h:${x},${z}`, `h:${x},${z + 1}`, `v:${x},${z}`, `v:${x + 1},${z}`];
}

/** زاويتا الحافة / The two corners of an edge */
export function edgeCorners(edge: string): [[number, number], [number, number]] {
  const [kind, rest] = edge.split(':');
  const [x, z] = rest.split(',').map(Number);
  return kind === 'h' ? [[x, z], [x + 1, z]] : [[x, z], [x, z + 1]];
}

/** المربعان على جانبي الحافة / The two tiles on either side of an edge */
export function edgeTiles(edge: string): [[number, number], [number, number]] {
  const [kind, rest] = edge.split(':');
  const [x, z] = rest.split(',').map(Number);
  return kind === 'h' ? [[x, z - 1], [x, z]] : [[x - 1, z], [x, z]];
}

/** الحافة بين زاويتين متجاورتين / The edge between two adjacent corners */
export function edgeBetween(a: { x: number; z: number }, b: { x: number; z: number }): string {
  if (a.z === b.z) return `h:${Math.min(a.x, b.x)},${a.z}`;
  return `v:${a.x},${Math.min(a.z, b.z)}`;
}

/** مسار زوايا متصل بين نقطتين (أفقي ثم عمودي) / Connected corner path between two points (horizontal then vertical) */
export function cornerPath(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] {
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

/** حواف مسار زوايا / Edges of a corner path */
export function pathEdges(corners: { x: number; z: number }[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < corners.length; i++) out.push(edgeBetween(corners[i - 1], corners[i]));
  return out;
}

/** زوايا مربع مبنى الحكم: منها تبدأ شبكة الطرق / Corners of the government tile: the road network starts here */
function hubCorners(state: GameState): string[] {
  const { x, z } = state.settlement;
  return [tileKey(x, z), tileKey(x + 1, z), tileKey(x, z + 1), tileKey(x + 1, z + 1)];
}

/**
 * حواف الطرق المتصلة بمبنى الحكم (بحث عبر الزوايا)؛ includePlanned تشمل الطرق تحت الإنشاء
 * Road edges connected to the government building (a search across corners); includePlanned counts roads under construction
 */
export function connectedRoads(state: GameState, at: number, includePlanned = false): Set<string> {
  const byCorner = new Map<string, string[]>();
  for (const r of state.roads) {
    if (!includePlanned && r.completesAt > at) continue;
    for (const [x, z] of edgeCorners(r.edge)) {
      const k = tileKey(x, z);
      byCorner.set(k, [...(byCorner.get(k) ?? []), r.edge]);
    }
  }
  const connected = new Set<string>();
  const seen = new Set<string>(hubCorners(state));
  const queue = [...seen];
  while (queue.length) {
    const corner = queue.pop()!;
    for (const edge of byCorner.get(corner) ?? []) {
      if (connected.has(edge)) continue;
      connected.add(edge);
      for (const [x, z] of edgeCorners(edge)) {
        const k = tileKey(x, z);
        if (!seen.has(k)) {
          seen.add(k);
          queue.push(k);
        }
      }
    }
  }
  return connected;
}

/**
 * هل يطل المربع على طريق متصل، أو يجاور مبنى الحكم مباشرة؟
 * Does the tile face a connected road, or sit right beside the government building?
 */
export function hasRoadAccess(state: GameState, x: number, z: number, connected: Set<string>): boolean {
  if (tileEdges(x, z).some((e) => connected.has(e))) return true;
  return NEIGHBOURS.some(([dx, dz]) => isSettlementTile(state, x + dx, z + dz));
}

/** الطريق على حافة / The road on an edge */
export function roadAt(state: GameState, edge: string) {
  return state.roads.find((r) => r.edge === edge);
}

/**
 * أقصر طريق تلقائي على حواف الشبكة من شبكة الطرق (أو زوايا مبنى الحكم) ينتهي على أحد أضلاع المربع؛
 * يمر بحواف يُسمح فيها بالطريق فقط، ويعيد الحواف الجديدة، أو [] إن كان المربع يطل على طريق، أو null إن تعذر الوصول
 * The shortest automatic road on grid edges from the road network (or the government corners) ending on one of the tile's sides;
 * it uses only edges where the road is allowed, returning the new edges, [] when the tile already faces a road, or null if unreachable
 */
export function autoRoadPath(defs: GameDefinitions, world: World, state: GameState, road: BuildingDef, tile: { x: number; z: number }, now: number): string[] | null {
  const network = connectedRoads(state, now, true);
  if (hasRoadAccess(state, tile.x, tile.z, network)) return [];
  const sides = new Set(tileEdges(tile.x, tile.z));
  const starts = new Set(hubCorners(state));
  for (const edge of network) for (const [x, z] of edgeCorners(edge)) starts.add(tileKey(x, z));
  // البحث بلا تكلفة: التكلفة تُفحص عند الرسم / Search ignores cost: it is checked when laying
  const free = { ...state, resources: Object.fromEntries(Object.keys(road.cost).map((id) => [id, Infinity])) };
  const from = new Map<string, string | null>([...starts].map((k) => [k, null]));
  const queue = [...starts];
  const allowed = (edge: string) => !!roadAt(state, edge) || checkRoadEdge(defs, world, free, road, edge).ok;
  const trail = (corner: string): string[] => {
    const edges: string[] = [];
    for (let at: string | null = corner; at && from.get(at); at = from.get(at)!) {
      const [ax, az] = at.split(',').map(Number);
      const [bx, bz] = from.get(at)!.split(',').map(Number);
      edges.unshift(edgeBetween({ x: ax, z: az }, { x: bx, z: bz }));
    }
    return edges;
  };
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i];
    const [x, z] = key.split(',').map(Number);
    for (const [dx, dz] of NEIGHBOURS) {
      const edge = edgeBetween({ x, z }, { x: x + dx, z: z + dz });
      if (!allowed(edge)) continue;
      // الوصول إلى ضلع من أضلاع المربع ينهي البحث / Reaching one of the tile's sides ends the search
      if (sides.has(edge)) return [...trail(key), edge].filter((e) => !roadAt(state, e));
      const next = tileKey(x + dx, z + dz);
      if (from.has(next)) continue;
      from.set(next, key);
      queue.push(next);
    }
  }
  return null;
}

/** السور على حافة / The wall on an edge */
export function wallAt(state: GameState, edge: string) {
  return state.walls.find((w) => w.edge === edge);
}

/** حافة في الدولة على أحد جانبيها، بأرض تسمح بالمبنى / An edge with nation land on one side that allows the building */
function edgeLandCheck(world: World, state: GameState, def: BuildingDef, edge: string): Check {
  const owned = new Set(state.territory);
  const sides = edgeTiles(edge)
    .map(([x, z]) => (x >= 0 && z >= 0 && x < world.settings.tilesX && z < world.settings.tilesZ ? world.tiles[z * world.settings.tilesX + x] : null))
    .filter((t): t is Tile => !!t);
  if (!sides.some((t) => owned.has(tileKey(t.x, t.z)))) return { ok: false, reason: `${def.name} خارج حدود الدولة` };
  if (!sides.some((t) => owned.has(tileKey(t.x, t.z)) && def.allowedTerrain.includes(t.terrainId))) return { ok: false, reason: `لا يُرسم ${def.name} هنا؛ الأرض لا تسمح بذلك` };
  return { ok: true };
}

/**
 * هل يمكن رسم السور أو البوابة على هذه الحافة؟ مفتوح، وفي الدولة، وليس فوق طريق، والموارد كافية
 * Can the wall or gate go on this edge? Unlocked, in the nation, not over a road, and affordable
 */
export function checkWallEdge(defs: GameDefinitions, world: World, state: GameState, wall: BuildingDef, edge: string, now: number): Check {
  const gaps = unlockGaps(wall, state, defs, now);
  if (gaps.length) return { ok: false, reason: `${wall.name} مقفل؛ يحتاج: ${gaps.join('، ')}` };
  if (roadAt(state, edge)) return { ok: false, reason: `لا يُبنى ${wall.name} فوق طريق` };
  const land = edgeLandCheck(world, state, wall, edge);
  if (!land.ok) return land;
  const shortage = missingResources(defs, state, wall.cost);
  if (shortage) return { ok: false, reason: `الموارد غير كافية؛ ينقص ${shortage}` };
  return { ok: true };
}

/** رسم سور على حواف: يتخطى ما فيه سور، ويتوقف عند أول حافة ممنوعة / Lay a wall along edges: skips walled edges, stops at the first refused one */
export function placeWallPath(state: GameState, defs: GameDefinitions, world: World, wall: BuildingDef, edges: string[], now: number, uid: () => string): RoadPathResult {
  let current = state;
  let placed = 0;
  for (const edge of edges) {
    if (wallAt(current, edge)) continue;
    const check = checkWallEdge(defs, world, current, wall, edge, now);
    if (!check.ok) return { state: current, placed, stoppedBy: check.reason };
    current = {
      ...current,
      resources: pay(current.resources, wall.cost),
      walls: [...current.walls, { uid: uid(), buildingId: wall.id, edge, startedAt: now, completesAt: now + wall.buildSeconds * 1000 }],
    };
    placed++;
  }
  return { state: current, placed, stoppedBy: null };
}

/**
 * هل يمكن رسم الطريق على هذه الحافة؟ تحتاج يابسة في الدولة على أحد جانبيها تسمح بالطريق
 * Can the road go on this edge? It needs nation land on one side that allows the road
 */
export function checkRoadEdge(defs: GameDefinitions, world: World, state: GameState, road: BuildingDef, edge: string): Check {
  const required = stageById(defs, road.stage);
  if (required.order > stageById(defs, state.stage).order) return { ok: false, reason: `${road.name} يُفتح في مرحلة ${required.name}` };
  if (wallAt(state, edge)) return { ok: false, reason: 'هذه الحافة يشغلها سور أو جدول؛ أزله أولًا' };
  const land = edgeLandCheck(world, state, road, edge);
  if (!land.ok) return land;
  const shortage = missingResources(defs, state, road.cost);
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
 * رسم طريق على حواف: يتخطى الحواف التي فيها طريق، ويتوقف عند أول حافة لا يُسمح فيها
 * Lay a road along edges: skips edges that already hold a road, stops at the first refused edge
 */
export function placeRoadPath(state: GameState, defs: GameDefinitions, world: World, road: BuildingDef, edges: string[], now: number, uid: () => string): RoadPathResult {
  let current = state;
  let placed = 0;
  for (const edge of edges) {
    if (roadAt(current, edge)) continue;
    const check = checkRoadEdge(defs, world, current, road, edge);
    if (!check.ok) return { state: current, placed, stoppedBy: check.reason };
    current = {
      ...current,
      resources: pay(current.resources, road.cost),
      roads: [...current.roads, { uid: uid(), buildingId: road.id, edge, startedAt: now, completesAt: now + road.buildSeconds * 1000 }],
    };
    placed++;
  }
  return { state: current, placed, stoppedBy: null };
}

/** إزالة طرق وأسوار الحواف واسترداد نسبة من تكلفتها / Remove edge roads and walls, refunding part of their cost */
export function demolishRoads(state: GameState, defs: GameDefinitions, edges: string[]): { state: GameState; removed: number } {
  const drop = new Set(edges);
  const resources = { ...state.resources };
  let removed = 0;
  for (const r of [...state.roads, ...state.walls]) {
    if (!drop.has(r.edge)) continue;
    const def = defs.buildings.find((b) => b.id === r.buildingId);
    for (const [id, n] of Object.entries(costShare(def?.cost ?? {}, defs.world.demolishRefundPercent))) resources[id] = (resources[id] ?? 0) + n;
    removed++;
  }
  return { state: { ...state, resources, roads: state.roads.filter((r) => !drop.has(r.edge)), walls: state.walls.filter((w) => !drop.has(w.edge)) }, removed };
}

// ===== المباني / Buildings =====

export function isUnderConstruction(b: { completesAt: number }, now: number): boolean {
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

/** حالة المبنى الآن / Building status now */
export function buildingStatus(placed: PlacedBuilding, state: GameState, defs: GameDefinitions, now: number): BuildingStatus {
  if (isUnderConstruction(placed, now)) return { kind: 'constructing' };
  const def = defs.buildings.find((b) => b.id === placed.buildingId);
  if (def?.requiresRoad && !hasRoadAccess(state, placed.x, placed.z, connectedRoads(state, now))) return { kind: 'disconnected' };
  const missing = def ? missingInputs(def, state.resources) : [];
  if (missing.length) return { kind: 'stopped', missing };
  if (def?.profession && def.workers > 0 && (staffingAt(state, defs, now).get(placed.uid)?.assigned ?? 0) === 0) return { kind: 'understaffed', profession: def.profession };
  return { kind: 'operating' };
}

/**
 * هل يعمل المبنى قبل حساب العمال: مكتمل، ويصله طريق إن احتاجه، ومدخلاته متوفرة
 * Is the building running before staffing: completed, road-connected if needed, inputs in stock
 */
function runner(state: GameState, defs: GameDefinitions, now: number, stock: Record<string, number> = state.resources) {
  const byId = new Map(defs.buildings.map((b) => [b.id, b]));
  const roads = connectedRoads(state, now);
  return (b: PlacedBuilding): boolean => {
    const def = byId.get(b.buildingId);
    if (!def || now < b.completesAt || missingInputs(def, stock).length) return false;
    return !def.requiresRoad || hasRoadAccess(state, b.x, b.z, roads);
  };
}

/** توزيع العمال الآن / Worker assignment now */
export function staffingAt(state: GameState, defs: GameDefinitions, now: number) {
  return staffing(state.buildings, new Map(defs.buildings.map((b) => [b.id, b])), runner(state, defs, now));
}

/** سعة كل مورد الآن / Each resource's capacity now */
export function capacityAt(state: GameState, defs: GameDefinitions, now: number): Record<string, number> {
  return capacities(defs, state.buildings, new Map(defs.buildings.map((b) => [b.id, b])), runner(state, defs, now));
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
export function checkPlacement(defs: GameDefinitions, world: World, state: GameState, building: BuildingDef, tile: Tile, now: number, opts: PlacementOptions = {}): Check {
  if (isRoad(building) || isWall(building)) return { ok: false, reason: `${building.name} يُرسم على حدود المربعات بالسحب` };
  if (!opts.alreadyBuilt) {
    const gaps = unlockGaps(building, state, defs, now);
    if (gaps.length) return { ok: false, reason: `${building.name} مقفل؛ يحتاج: ${gaps.join('، ')}` };
  }
  if (isSettlementTile(state, tile.x, tile.z)) return { ok: false, reason: 'هذا المربع يشغله مبنى الحكم' };
  if (!state.territory.includes(tileKey(tile.x, tile.z))) return { ok: false, reason: 'المربع خارج حدود الدولة؛ ضمّه للدولة أولًا' };
  const occupant = buildingAt(state, tile.x, tile.z);
  if (occupant && occupant.uid !== opts.ignoreUid) return { ok: false, reason: 'يوجد مبنى في هذا المربع' };
  // منشأة المكمن تُبنى على مكمنها أيًّا كانت أرضه (في العالم المستوي تقع المعادن على السهل)
  // A deposit facility is built on its deposit whatever the land (ores lie on the plain in a flat world)
  if (!building.requiresDeposit && !building.allowedTerrain.includes(tile.terrainId)) {
    const names = building.allowedTerrain.map((id) => defs.terrain.find((t) => t.id === id)?.name ?? id).join('، ');
    return { ok: false, reason: `${building.name} يُبنى على: ${names}` };
  }
  if (building.requiresDeposit && !depositAt(world, state, tile.x, tile.z, building.requiresDeposit)) {
    const type = defs.deposits.find((d) => d.resourceId === building.requiresDeposit);
    return { ok: false, reason: `${building.name} يُبنى على ${type?.name ?? 'مكمن'} مكتشف داخل الدولة` };
  }
  if (building.requiresRoad && !hasRoadAccess(state, tile.x, tile.z, connectedRoads(state, now, true))) {
    // الطرق المخططة تكفي للبناء، والتشغيل يحتاج اكتمالها / Planned roads allow building; operating needs them finished
    return { ok: false, reason: `${building.name} يحتاج طريقًا متصلًا بمبنى الحكم على أحد جوانبه` };
  }
  if (!opts.alreadyBuilt) {
    const active = state.buildings.filter((b) => isUnderConstruction(b, now)).length;
    if (active >= defs.world.maxConcurrentBuilds) {
      return { ok: false, reason: `وصلت للحد الأقصى من البناء المتزامن (${defs.world.maxConcurrentBuilds})؛ انتظر اكتمال مبنى` };
    }
  }
  const shortage = missingResources(defs, state, opts.cost ?? building.cost);
  if (shortage) return { ok: false, reason: `الموارد غير كافية؛ ينقص ${shortage}` };
  return { ok: true };
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
export function checkMove(defs: GameDefinitions, world: World, state: GameState, uid: string, tile: Tile, now: number): Check {
  const placed = state.buildings.find((b) => b.uid === uid);
  const def = placed && defs.buildings.find((b) => b.id === placed.buildingId);
  if (!placed || !def) return { ok: false, reason: 'المبنى غير موجود' };
  if (placed.x === tile.x && placed.z === tile.z) return { ok: false, reason: 'اختر مربعًا آخر غير موقع المبنى الحالي' };
  return checkPlacement(defs, world, state, def, tile, now, { ignoreUid: uid, alreadyBuilt: true, cost: costShare(def.cost, defs.world.moveCostPercent) });
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

// ===== الزمن: الإنتاج والاستهلاك والسكان / Time: production, consumption and population =====

/**
 * تقدّم الزمن حتى now على دفعات لا تتجاوز دقيقة: في كل دفعة يعمل المبنى فقط إن توفرت مدخلاته ووصله طريق،
 * ويتجه السكان نحو سعة المساكن العاملة، ثم تُفحص ترقية المرحلة
 * Advance time to now in steps of at most a minute: a building runs only with its inputs in stock and a road when needed;
 * population moves toward the capacity of operating housing, then stage progress is checked
 */
export function advance(state: GameState, defs: GameDefinitions, _world: World, now: number): GameState {
  if (now <= state.lastTick) return state;
  const byId = new Map(defs.buildings.map((b) => [b.id, b]));
  const resources = { ...state.resources };
  // حفظ أقدم بلا سكان لكل مسكن يُوزَّع سكانه أولًا / An older save without per-home residents is spread first
  let buildings = seedResidents(state.buildings, byId, state.population);

  for (let from = state.lastTick; from < now; from += STEP_MS) {
    const to = Math.min(now, from + STEP_MS);
    const stock = { ...resources };
    const current = { ...state, buildings };
    const running = runner(current, defs, to, stock);
    // يعمل في هذه الدفعة ما بدأ قبل نهايتها / What started before this step's end runs in it
    const active = (b: PlacedBuilding) => b.completesAt < to && running({ ...b, completesAt: Math.min(b.completesAt, to) });
    const crew = staffing(buildings, byId, active);
    const caps = capacities(defs, buildings, byId, active);
    for (const placed of buildings) {
      const def = byId.get(placed.buildingId);
      const start = Math.max(from, placed.completesAt);
      if (!def || start >= to || !active(placed)) continue;
      // الإنتاج والاستهلاك بقدر العمال المتوفرين / Output and input scale with the available workers
      const minutes = ((to - start) / MINUTE_MS) * (crew.get(placed.uid)?.efficiency ?? 1);
      for (const [id, n] of Object.entries(def.production)) resources[id] = addCapped(resources[id] ?? 0, n * minutes, caps[id] ?? Infinity);
      for (const [id, n] of Object.entries(def.consumption)) resources[id] = Math.max(0, (resources[id] ?? 0) - n * minutes);
    }
    // السكان يتجهون نحو سعة المساكن العاملة / Residents move toward the capacity of operating homes
    const change = defs.world.populationGrowthPerMinute * ((to - from) / MINUTE_MS);
    buildings = settle(buildings, byId, (b) => (active(b) ? byId.get(b.buildingId)?.housing ?? 0 : 0), change);
  }
  const population = buildings.reduce((sum, b) => sum + (b.residents ?? 0), 0);
  return { ...state, buildings, resources, population, lastTick: now };
}

/**
 * صافي الإنتاج في الدقيقة الآن (الإنتاج ناقص الاستهلاك) للمباني العاملة
 * Net output per minute now (production minus consumption) of operating buildings
 */
export function netRates(state: GameState, defs: GameDefinitions, now: number): Record<string, number> {
  const { production, consumption } = rateBreakdown(state, defs, now);
  const rates: Record<string, number> = { ...production };
  for (const [id, n] of Object.entries(consumption)) rates[id] = (rates[id] ?? 0) - n;
  return rates;
}

/** الإنتاج والاستهلاك في الدقيقة الآن، كلٌّ على حدة، للمباني العاملة / Per-minute production and consumption now, separately, of operating buildings */
export function rateBreakdown(state: GameState, defs: GameDefinitions, now: number): { production: Record<string, number>; consumption: Record<string, number> } {
  const production: Record<string, number> = {};
  const consumption: Record<string, number> = {};
  const crew = staffingAt(state, defs, now);
  for (const placed of state.buildings) {
    if (buildingStatus(placed, state, defs, now).kind !== 'operating') continue;
    const def = defs.buildings.find((b) => b.id === placed.buildingId)!;
    const efficiency = crew.get(placed.uid)?.efficiency ?? 1;
    for (const [id, n] of Object.entries(def.production)) production[id] = (production[id] ?? 0) + n * efficiency;
    for (const [id, n] of Object.entries(def.consumption)) consumption[id] = (consumption[id] ?? 0) + n * efficiency;
  }
  return { production, consumption };
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

/** ضم القطعة كاملة ودفع تكلفتها، ثم اكتشاف ما قرب الحدود الجديدة (بعد نجاح checkAnnex) / Annex the parcel, pay, then discover near the new borders */
export function annexTile(state: GameState, defs: GameDefinitions, world: World, tile: Tile): GameState {
  const added = newBlockTiles(defs, world, state, tile).map((t) => tileKey(t.x, t.z));
  const next = { ...state, resources: pay(state.resources, annexCost(defs)), territory: [...state.territory, ...added] };
  return discoverNearTerritory(next, defs, world);
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

export function pay(resources: Record<string, number>, cost: Record<string, number>): Record<string, number> {
  const next = { ...resources };
  for (const [id, n] of Object.entries(cost)) next[id] = (next[id] ?? 0) - n;
  return next;
}

function waterIds(defs: GameDefinitions): Set<string> {
  return new Set(defs.terrain.filter((t) => t.isWater).map((t) => t.id));
}
