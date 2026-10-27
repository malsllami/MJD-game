// مسؤولية الملف: تأسيس القرية عند بداية اللعبة — طريق رئيسي من ساحة مبنى الحكم إلى حدود القرية، والمباني الابتدائية موزعة
// على أرضها المناسبة (المنشآت على مكامنها، والمساكن قرب مبنى الحكم وقرب عملها)، وطرق تصلها، كلها قائمة ومجانية
// File responsibility: founding the village at the start — a main road from the government forecourt to the village edge, the
// starting buildings spread over suitable land (facilities on their deposits, homes near the government and their work), and roads
// to reach them, all standing and free

import {
  autoRoadPath, buildingAt, depositAt, edgeBetween, edgeCorners, isRoad, isSettlementTile, isWaterTile, placeRoadPath, tileKey,
} from './economy';
import { housingAt, levelRow } from './levels';
import { zoneTest } from './placement-guide';
import type { BuildingDef, GameDefinitions, GameState, PlacedBuilding, World } from './types';

/** بعد المربعين بالخطوات (الأقطار خطوة) / Tile distance in steps (diagonals count as one) */
const steps = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));

/** المسافة التي تُعد بعدها المباني متفرقة / The spacing beyond which buildings count as spread out */
const SPREAD = 3;

/**
 * يؤسس القرية على حالة بداية بلا مبانٍ؛ بلا مبانٍ ابتدائية في البيانات (خادم أقدم) تعود الحالة كما هي
 * Founds the village on an empty start state; with no starting buildings in the data (older server) the state is returned as is
 */
export function foundVillage(state: GameState, defs: GameDefinitions, world: World, now: number): GameState {
  const starters = defs.startBuildings.map((id) => defs.buildings.find((b) => b.id === id)).filter((b): b is BuildingDef => !!b);
  if (!starters.length) return state;
  const road = defs.buildings.find((b) => isRoad(b) && b.stage === defs.stages[0].id);
  // التأسيس مجاني: تُحسب الطرق بموارد بلا حد ثم تُعاد الموارد كما كانت / Founding is free: roads use unlimited stock, then resources are restored
  const resources = state.resources;
  let current: GameState = { ...state, resources: Object.fromEntries(defs.resources.map((r) => [r.id, Infinity])) };
  let n = 0;
  const uid = () => `start-${n++}`;
  if (road) current = layRoad(current, defs, world, road, mainRoad(current), now, uid);

  // المنشآت المرتبطة بمكمن أولًا لأن أماكنها محدودة، ثم المساكن بعد أعمالها / Deposit facilities first since their spots are few, then homes after their work
  // بئر القرية يُنسخ إلى الحالة مصدرًا دائمًا للري / The village well is copied into the state as a lasting irrigation source
  current = { ...current, springs: world.springs.filter((k) => current.territory.includes(k)) };
  current = fertileStart(current, defs, world);
  const ordered = [...starters.filter((b) => b.requiresDeposit), ...starters.filter((b) => !b.requiresDeposit && !b.housing), ...starters.filter((b) => !b.requiresDeposit && b.housing)];
  for (const def of ordered) {
    const tile = bestTile(current, defs, world, def, now);
    if (!tile) continue;
    const placed: PlacedBuilding = { uid: uid(), buildingId: def.id, x: tile.x, z: tile.z, startedAt: now, completesAt: now, level: 1 };
    if (def.housing) placed.residents = housingAt(def, levelRow(defs, 1).populationFactor);
    current = { ...current, buildings: [...current.buildings, placed] };
    // كل مبنى ابتدائي يصله طريق، ولو لم يحتجه للعمل، حتى تصل إليه الحركة والنقل / Every starting building gets a road, even when it runs without one, so movement and hauling reach it
    if (road) current = layRoad(current, defs, world, road, autoRoadPath(defs, world, current, road, tile, now) ?? [], now, uid);
  }
  current = buildWall(current, defs, now, uid);
  const population = current.buildings.reduce((sum, b) => sum + (b.residents ?? 0), 0);
  return { ...current, resources, population };
}

/**
 * سور القرية الأولى على حدودها كقطع سور عادية يهدمها اللاعب أو يعيد رسمها، وبوابتان حيث ينتهي الطريق الرئيسي؛
 * التوسع بعد ذلك لا يبني سورًا تلقائيًا
 * The first village's wall on its border as ordinary wall pieces the player can bulldoze or redraw, and a gate where the main
 * road ends; later growth builds no wall automatically
 */
function buildWall(state: GameState, defs: GameDefinitions, now: number, uid: () => string): GameState {
  const wall = defs.buildings.find((b) => b.model === 'wall');
  const gate = defs.buildings.find((b) => b.model === 'gate');
  if (!wall) return state;
  const owned = new Set(state.territory);
  const roads = new Set(state.roads.map((r) => r.edge));
  const border: string[] = [];
  for (const key of owned) {
    const [x, z] = key.split(',').map(Number);
    if (!owned.has(tileKey(x, z - 1))) border.push(`h:${x},${z}`);
    if (!owned.has(tileKey(x, z + 1))) border.push(`h:${x},${z + 1}`);
    if (!owned.has(tileKey(x - 1, z))) border.push(`v:${x},${z}`);
    if (!owned.has(tileKey(x + 1, z))) border.push(`v:${x + 1},${z}`);
  }
  // البوابة على ضلعي الحدود عند نهاية الطريق الرئيسي (أقصى الجنوب على خطه) / The gate on the two border edges at the main road's end (its southmost corner)
  const south = Math.min(...state.territory.map((k) => Number(k.split(',')[1])));
  const end = tileKey(state.settlement.x, south);
  const atGate = (edge: string) => !!gate && edgeCorners(edge).some(([x, z]) => tileKey(x, z) === end);
  const walls = border.filter((e) => !roads.has(e)).sort().map((edge) => ({
    uid: uid(), buildingId: atGate(edge) ? gate!.id : wall.id, edge, startedAt: now, completesAt: now,
  }));
  return { ...state, walls: [...state.walls, ...walls] };
}

/**
 * أرض خصبة حول بئر القرية الأولى بغنى متوسط من جدول موارد الغابة، فتقوم المزرعة الابتدائية عليها
 * Fertile land around the first village's well at the forest resources table's middle richness, so the starting farm stands on it
 */
function fertileStart(state: GameState, defs: GameDefinitions, world: World): GameState {
  const rule = defs.frontierResources.find((r) => r.nearWater);
  const type = rule && defs.deposits.find((d) => d.id === rule.depositTypeId);
  const owned = new Set(state.territory);
  const pond = world.springs.find((k) => owned.has(k));
  if (!rule || !type || !pond) return state;
  const [px, pz] = pond.split(',').map(Number);
  const taken = new Set(world.deposits.flatMap((d) => d.tiles));
  const tiles: string[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const k = tileKey(px + dx, pz + dz);
      if (owned.has(k) && !isWaterTile(world, px + dx, pz + dz) && !taken.has(k) && !isSettlementTile(state, px + dx, pz + dz)) tiles.push(k);
    }
  }
  if (!tiles.length) return state;
  const richness = Math.round(((rule.minRichness + rule.maxRichness) / 2) * 100) / 100;
  const deposit = { id: `found-${type.id}-start`, typeId: type.id, resourceId: type.resourceId, x: px, z: pz, tiles, richness };
  return { ...state, foundDeposits: [...(state.foundDeposits ?? []), deposit] };
}

/**
 * الطريق الرئيسي: من منتصف واجهة المجمع (نحو ‎-z‎ حيث تتجه ساحته) مستقيمًا إلى حدود القرية، وعنده تقوم البوابة
 * The main road: from the middle of the compound's front (toward -z, where its forecourt faces) straight to the village edge, where the gate stands
 */
function mainRoad(state: GameState): string[] {
  const owned = new Set(state.territory);
  const { x, z } = state.settlement;
  const r = state.settlement.radius ?? 0;
  const edges: string[] = [];
  for (let cz = z - r; owned.has(tileKey(x, cz - 1)) && owned.has(tileKey(x - 1, cz - 1)); cz--) edges.push(edgeBetween({ x, z: cz }, { x, z: cz - 1 }));
  return edges;
}

/** رسم طريق مكتمل فورًا / Lay a road that is complete at once */
function layRoad(state: GameState, defs: GameDefinitions, world: World, road: BuildingDef, edges: string[], now: number, uid: () => string): GameState {
  if (!edges.length) return state;
  const laid = placeRoadPath(state, defs, world, road, edges, now, uid).state;
  return { ...laid, roads: laid.roads.map((r) => (r.completesAt > now && r.startedAt === now && r.uid.startsWith('start-') ? { ...r, completesAt: now } : r)) };
}

/**
 * أفضل مربع للمبنى: أرضه أو مكمنه، خارج حلقة التوسعة حول المجمع، ضمن منطقته المقترحة، متباعدًا عن غيره،
 * والمسكن قرب مبنى عمل مهنته؛ والتعادل لصالح الأقرب إلى مبنى الحكم حتى تبقى القرية متماسكة
 * The best tile: its land or deposit, outside the growth ring around the compound, in its suggested zone, spaced from the others,
 * and a home near its trade's work building; ties go to the nearer to the government so the village stays compact
 */
function bestTile(state: GameState, defs: GameDefinitions, world: World, def: BuildingDef, now: number): { x: number; z: number } | null {
  const inZone = zoneTest(defs, state, def, now);
  const ring = (state.settlement.radius ?? 0) + 1;
  const work = def.housing && def.profession
    ? state.buildings.filter((b) => defs.buildings.find((d) => d.id === b.buildingId && d.profession === def.profession && !d.housing))
    : [];
  let best: { x: number; z: number } | null = null;
  let bestScore = -Infinity;
  for (const key of state.territory) {
    const [x, z] = key.split(',').map(Number);
    const tile = world.tiles[z * world.settings.tilesX + x];
    if (isSettlementTile(state, x, z) || buildingAt(state, x, z) || isWaterTile(world, x, z) || steps({ x, z }, state.settlement) <= ring) continue;
    if (def.requiresDeposit ? !depositAt(world, state, x, z, def.requiresDeposit) : !def.allowedTerrain.includes(tile.terrainId)) continue;
    const nearest = Math.min(SPREAD, ...state.buildings.map((b) => steps(b, { x, z })));
    let score = (inZone && inZone(x, z) ? 100 : 0) + nearest * 10 - steps({ x, z }, state.settlement) * 0.5;
    if (work.length) score -= Math.min(...work.map((b) => steps(b, { x, z }))) * 4;
    if (score > bestScore) {
      bestScore = score;
      best = { x, z };
    }
  }
  return best;
}
