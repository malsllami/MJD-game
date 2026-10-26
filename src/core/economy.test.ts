// اختبارات منطق الاقتصاد: الوضع، الإنتاج والاستهلاك، السكان، المراحل، الغياب، الطرق على الحواف، المكامن والضم
// Economy tests: placement, production and consumption, population, stages, absence, edge roads, deposits and annexation
import { describe, expect, it } from 'vitest';
import { seedDefinitions } from '../test/gas-harness';
import {
  advance, annexTile, autoRoadPath, buildingStatus, capacityAt, checkAnnex, checkMove, checkPlacement, checkRoadEdge, connectedRoads, cornerPath,
  createInitialState, demolishBuilding, demolishRoads, depositAt, hasRoadAccess, housingCapacity, moveBuilding, netRates, pathEdges,
  placeBuilding, placeRoadPath, placeWallPath, rateBreakdown, resumeAfterAbsence, staffingAt, surveyCost, surveyTile, tileKey, unlockGaps,
} from './economy';
import { suggestStartSites } from './start-sites';
import type { BuildingDef, GameState, Tile } from './types';
import { generateWorld } from './world-gen';

const defs = seedDefinitions();
const world = generateWorld(defs.world, defs.terrain, defs.deposits);
const site = suggestStartSites(world, defs)[0];
const T0 = 1_000_000;
const MIN = 60_000;
const building = (id: string) => defs.buildings.find((b) => b.id === id)!;
const tileOf = (key: string): Tile => {
  const [x, z] = key.split(',').map(Number);
  return world.tiles[z * defs.world.tilesX + x];
};
const rich = (s: GameState): GameState => ({ ...s, resources: Object.fromEntries(defs.resources.map((r) => [r.id, 100_000])) });

/**
 * أول مربع فارغ في الدولة يصلح للمبنى؛ ما يتطلب طريقًا يوضع بجوار مبنى الحكم
 * First free nation tile that fits the building; road-dependent ones go next to the government building
 */
function spotFor(state: GameState, b: BuildingDef): Tile {
  const key = state.territory.find((k) => {
    const t = tileOf(k);
    const free = b.allowedTerrain.includes(t.terrainId) && !state.buildings.some((p) => p.x === t.x && p.z === t.z) && !(t.x === site.x && t.z === site.z);
    return free && (!b.requiresRoad || Math.abs(t.x - site.x) + Math.abs(t.z - site.z) === 1);
  });
  if (!key) throw new Error(`no spot for ${b.id}`);
  return tileOf(key);
}

/** وضع مبنى مع موارد كافية، وإنهاء إنشائه فورًا، ومسكن بعدد سكان إن طُلب / Place a building with ample resources, finish it at once, optionally housed */
function built(state: GameState, id: string, at = T0, residents?: number): GameState {
  const b = building(id);
  const placed = placeBuilding(rich(state), b, spotFor(state, b), at, `${id}-${state.buildings.length}`);
  const last = placed.buildings[placed.buildings.length - 1];
  last.completesAt = at;
  if (residents !== undefined) last.residents = residents;
  const population = placed.buildings.reduce((n, p) => n + (p.residents ?? 0), 0);
  return { ...placed, resources: state.resources, population };
}

/** مزرعة مع سكن مزارعين ممتلئ حتى تعمل بكامل طاقتها / A farm with a full farmers' house so it runs at full output */
const staffedFarm = (s: GameState) => built(built(s, 'farmers_house', T0, building('farmers_house').housing), 'farm');

describe('البداية / start', () => {
  const s = createInitialState(defs, world, site, T0);
  it('تبدأ قرية بلا سكان ولا طرق وبحدود المرحلة الأولى / starts as a village with no people, no roads and first-stage borders', () => {
    expect(s.stage).toBe(defs.stages[0].id);
    expect(s.population).toBe(0);
    expect(s.roads).toEqual([]);
    expect(s.territory).toContain(tileKey(site.x, site.z));
    expect(s.territory.length).toBeGreaterThan((defs.stages[0].territoryRadius * 2 + 1) ** 2 / 2);
    expect(s.resources.gold).toBe(defs.resources.find((r) => r.id === 'gold')!.startAmount);
  });

  it('أرض البداية سهل وساحل صالحان للبناء / the start land is buildable plain and coast', () => {
    expect(s.territory.map(tileOf).every((t) => defs.world.capitalTerrain.includes(t.terrainId))).toBe(true);
  });
});

describe('وضع المباني / placement', () => {
  const s = createInitialState(defs, world, site, T0);

  it('المبنى المفتوح بأرض مناسبة وموارد كافية يُقبل ويخصم التكلفة / an open, affordable building on fitting land is accepted and paid', () => {
    const farm = building('farm');
    const tile = spotFor(s, farm);
    expect(checkPlacement(defs, world, s, farm, tile, T0)).toEqual({ ok: true });
    const next = placeBuilding(s, farm, tile, T0, 'u1');
    expect(next.resources.wood).toBe(s.resources.wood - farm.cost.wood);
    expect(next.buildings[0].completesAt).toBe(T0 + farm.buildSeconds * 1000);
  });

  it('مبنى مرحلة لاحقة مقفل حتى بلوغها / a later-stage building is locked until that stage', () => {
    const hospital = building('hospital');
    const result = checkPlacement(defs, world, s, hospital, spotFor(s, hospital), T0);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('بلدة');
  });

  it('يرفض مربع مبنى الحكم وخارج الحدود ووضع الطريق كمبنى / refuses the government tile, outside borders and a road as a building', () => {
    const farm = building('farm');
    expect(checkPlacement(defs, world, s, farm, tileOf(tileKey(site.x, site.z)), T0).ok).toBe(false);
    const outside = world.tiles.find((t) => !s.territory.includes(tileKey(t.x, t.z)) && farm.allowedTerrain.includes(t.terrainId))!;
    expect(checkPlacement(defs, world, s, farm, outside, T0).ok).toBe(false);
    expect(checkPlacement(defs, world, s, building('road'), spotFor(s, farm), T0).ok).toBe(false);
  });

  it('يحترم حد البناء المتزامن / respects the concurrent-build limit', () => {
    let state = rich(s);
    const farm = building('farm');
    for (let i = 0; i < defs.world.maxConcurrentBuilds; i++) state = placeBuilding(state, farm, spotFor(state, farm), T0, `f${i}`);
    expect(checkPlacement(defs, world, state, farm, spotFor(state, farm), T0).ok).toBe(false);
  });
});

describe('الزمن / time', () => {
  const s = createInitialState(defs, world, site, T0);

  it('لا إنتاج قبل اكتمال الإنشاء، ثم إنتاج بالدقيقة بعده / no output while constructing, per-minute output after', () => {
    const farm = building('farm');
    const housed = built(s, 'farmers_house', T0, building('farmers_house').housing);
    const placed = placeBuilding(housed, farm, spotFor(housed, farm), T0, 'f');
    const food = placed.resources.food;
    // سكن المزارعين يأكل قليلًا أثناء الإنشاء / The farmers' house eats a little during construction
    expect(advance(placed, defs, world, T0 + farm.buildSeconds * 1000).resources.food).toBeCloseTo(food, 0);
    const later = advance(placed, defs, world, T0 + farm.buildSeconds * 1000 + 2 * MIN);
    const eaten = 2 * (building('farmers_house').consumption.food ?? 0);
    expect(later.resources.food).toBeCloseTo(food + 2 * farm.production.food - eaten, 0);
  });

  it('المنازل تستهلك وتجذب السكان حتى سعتها / houses consume and fill up to capacity', () => {
    const state = built(s, 'houses');
    const later = advance(state, defs, world, T0 + 10 * MIN);
    expect(later.population).toBe(building('houses').housing);
    expect(later.resources.water).toBeLessThan(state.resources.water);
    expect(housingCapacity(later, defs, T0 + 10 * MIN)).toBe(building('houses').housing);
  });

  it('نفاد الماء يوقف المنازل فيغادر السكان / running out of water stops houses and people leave', () => {
    const state = { ...built(s, 'houses'), population: 12, resources: { ...s.resources, water: 0 } };
    expect(buildingStatus(state.buildings[0], state, defs, T0).kind).toBe('stopped');
    expect(advance(state, defs, world, T0 + 10 * MIN).population).toBe(0);
  });

  it('صافي الإنتاج = الإنتاج ناقص الاستهلاك / net rate is production minus consumption', () => {
    const state = built(built(s, 'houses', T0, building('houses').housing), 'well');
    expect(netRates(state, defs, T0).water).toBe(building('well').production.water - building('houses').consumption.water);
    const { production, consumption } = rateBreakdown(state, defs, T0);
    expect(production.water).toBe(building('well').production.water);
    expect(consumption.water).toBe(building('houses').consumption.water);
  });

  it('بلوغ السكان وحده لا يرقّي المرحلة / reaching the population alone does not upgrade the stage', () => {
    const state = { ...built(s, 'houses', T0, 12), population: defs.stages[1].population };
    expect(advance(state, defs, world, T0 + MIN).stage).toBe(s.stage);
  });

  it('الغياب يُحسب حتى الحد الأقصى فقط، والإنتاج لا يتجاوز السعة / absence is capped, and output never exceeds capacity', () => {
    const state = staffedFarm({ ...s, resources: { ...s.resources, food: 0 } });
    const cap = defs.world.offlineCapHours * 60 * MIN;
    const resume = resumeAfterAbsence(state, defs, world, T0 + cap * 3);
    expect(resume.creditedMs).toBe(cap);
    expect(resume.state.lastTick).toBe(T0 + cap * 3);
    expect(resume.state.resources.food).toBeCloseTo(capacityAt(state, defs, T0).food, 0);
  });
});

describe('المهن والعمال / trades and workers', () => {
  const s = createInitialState(defs, world, site, T0);
  const farm = building('farm');

  it('المزرعة بلا مزارعين لا تنتج / a farm without farmers produces nothing', () => {
    const state = built(s, 'farm');
    expect(buildingStatus(state.buildings[0], state, defs, T0).kind).toBe('understaffed');
    expect(advance(state, defs, world, T0 + 5 * MIN).resources.food).toBeCloseTo(state.resources.food);
  });

  it('الإنتاج بقدر العمال المتوفرين / output follows the available workers', () => {
    const half = built(built(s, 'farmers_house', T0, farm.workers / 2), 'farm');
    expect(staffingAt(half, defs, T0).get(half.buildings[1].uid)?.efficiency).toBe(0.5);
    expect(rateBreakdown(half, defs, T0).production.food).toBe(farm.production.food / 2);
    const full = staffedFarm(s);
    expect(rateBreakdown(full, defs, T0).production.food).toBe(farm.production.food);
  });

  it('سكان سكن المهنة لا يعملون في مهنة أخرى / residents of one trade do not work another', () => {
    const state = built(built(s, 'carpenters_house', T0, 6), 'farm');
    expect(buildingStatus(state.buildings[1], state, defs, T0).kind).toBe('understaffed');
  });

  it('المساكن تمتلئ حتى سعتها، والمجموع هو عدد السكان / homes fill to capacity and their sum is the population', () => {
    const state = built(built(s, 'houses'), 'farmers_house');
    const later = advance(state, defs, world, T0 + 30 * MIN);
    expect(later.buildings.map((b) => b.residents)).toEqual([building('houses').housing, building('farmers_house').housing]);
    expect(later.population).toBe(building('houses').housing + building('farmers_house').housing);
  });

  it('حفظ أقدم بلا سكان لكل مسكن يوزّع سكانه / an older save without per-home residents spreads its population', () => {
    const state = { ...built(s, 'houses'), population: 7 };
    expect(advance(state, defs, world, T0 + 1000).buildings[0].residents).toBeGreaterThanOrEqual(7);
  });
});

describe('المخازن والسعة / storage and capacity', () => {
  const s = createInitialState(defs, world, site, T0);

  it('السعة الأساسية ثم يزيدها المخزن / base capacity, raised by a store', () => {
    const base = capacityAt(s, defs, T0).food;
    expect(base).toBe(defs.resources.find((r) => r.id === 'food')!.baseCapacity);
    const stored = built(s, 'farm_storage');
    expect(capacityAt(stored, defs, T0).food).toBe(base + building('farm_storage').storage.food);
  });

  it('الإنتاج يتوقف عند امتلاء المخزن، والمخزون القديم فوق السعة يبقى / output stops when full; old stock above capacity stays', () => {
    const full = staffedFarm({ ...s, resources: { ...s.resources, food: 50_000 } });
    expect(advance(full, defs, world, T0 + 5 * MIN).resources.food).toBeLessThanOrEqual(50_000);
    expect(advance(full, defs, world, T0 + 5 * MIN).resources.food).toBeGreaterThan(capacityAt(full, defs, T0).food);
  });
});

describe('فتح المباني / unlocking buildings', () => {
  const s = createInitialState(defs, world, site, T0);

  it('السوق يحتاج سكانًا، ومركز التطوير يحتاج سوقًا / the market needs residents; the development centre needs a market', () => {
    const market = building('market');
    expect(unlockGaps(market, s, defs, T0).length).toBeGreaterThan(0);
    expect(unlockGaps(market, { ...s, population: market.requiredPopulation }, defs, T0)).toEqual([]);
    const dev = building('development_center');
    const gaps = unlockGaps(dev, { ...s, population: dev.requiredPopulation }, defs, T0);
    expect(gaps).toContain(market.name);
  });

  it('المقفل يُرفض عند الوضع / a locked building is refused on placement', () => {
    const market = building('market');
    const result = checkPlacement(defs, world, rich(s), market, spotFor(s, market), T0);
    expect(!result.ok && result.reason).toContain('مقفل');
  });
});

describe('الطرق على حدود المربعات / roads on tile edges', () => {
  const s = rich(createInitialState(defs, world, site, T0));
  const houses = building('houses');
  const road = building('road');
  /** طريق من زاوية مبنى الحكم إلى الزاوية العليا لمربع / A road from the government corner to a tile's top corner */
  const edgesTo = (t: Tile) => pathEdges(cornerPath(site, t));
  const far = s.territory.map(tileOf).find((t) =>
    houses.allowedTerrain.includes(t.terrainId) && Math.abs(t.x - site.x) + Math.abs(t.z - site.z) >= 4 &&
    edgesTo(t).every((e) => checkRoadEdge(defs, world, s, road, e).ok))!;
  let n = 0;
  const uid = () => `r${n++}`;

  it('يوجد موقع اختبار مناسب / a suitable test spot exists', () => {
    expect(far).toBeDefined();
  });

  it('المنازل بعيدًا عن الطرق مرفوضة / houses away from any road are refused', () => {
    const result = checkPlacement(defs, world, s, houses, far, T0);
    expect(!result.ok && result.reason).toContain('طريق');
  });

  it('الطريق يُرسم على الحواف ولا يشغل المربع / the road runs on edges and leaves the tile free', () => {
    const edges = edgesTo(far);
    const drawn = placeRoadPath(s, defs, world, road, edges, T0, uid);
    expect(drawn.stoppedBy).toBeNull();
    expect(drawn.placed).toBe(edges.length);
    expect(drawn.state.buildings).toHaveLength(0);
    expect(drawn.state.resources.stone).toBe(s.resources.stone - (road.cost.stone ?? 0) * edges.length);
    // إعادة رسم نفس الحواف لا تكرر الطريق / Redrawing the same edges does not duplicate the road
    expect(placeRoadPath(drawn.state, defs, world, road, edges, T0, uid).placed).toBe(0);
  });

  it('الطريق المتصل بمبنى الحكم يسمح بالبناء بجواره ويعمل بعد اكتماله / a connected road allows building beside it, operating once finished', () => {
    const drawn = placeRoadPath(s, defs, world, road, edgesTo(far), T0, uid).state;
    expect(connectedRoads(drawn, T0, true).size).toBe(edgesTo(far).length);
    expect(checkPlacement(defs, world, drawn, houses, far, T0)).toEqual({ ok: true });
    const withHouse = placeBuilding(drawn, houses, far, T0, 'h');
    withHouse.buildings[0].completesAt = T0;
    expect(buildingStatus(withHouse.buildings[0], withHouse, defs, T0).kind).toBe('disconnected');
    expect(buildingStatus(withHouse.buildings[0], withHouse, defs, T0 + road.buildSeconds * 1000).kind).toBe('operating');
  });

  it('الطريق المنفصل عن مبنى الحكم لا يكفي / a road cut off from the government building is not enough', () => {
    const tail = edgesTo(far).slice(-2);
    const drawn = placeRoadPath(s, defs, world, road, tail, T0, uid).state;
    expect(connectedRoads(drawn, T0 + MIN * 60, true).size).toBe(0);
    expect(hasRoadAccess(drawn, far.x, far.z, connectedRoads(drawn, T0, true))).toBe(false);
  });

  it('الطريق خارج الحدود مرفوض / a road outside the borders is refused', () => {
    const outside = world.tiles.find((t) => !s.territory.includes(tileKey(t.x, t.z)) && Math.abs(t.x - site.x) > 30)!;
    expect(checkRoadEdge(defs, world, s, road, `h:${outside.x},${outside.z + 1}`).ok).toBe(false);
  });

  it('الطريق التلقائي يصل المبنى البعيد بالشبكة بأقصر مسار / the automatic road links a far building to the network by the shortest path', () => {
    const path = autoRoadPath(defs, world, s, road, far, T0)!;
    expect(path.length).toBeGreaterThan(0);
    const laid = placeRoadPath(s, defs, world, road, path, T0, uid).state;
    expect(hasRoadAccess(laid, far.x, far.z, connectedRoads(laid, T0, true))).toBe(true);
    expect(checkPlacement(defs, world, laid, houses, far, T0)).toEqual({ ok: true });
    // المسار لا يطول عن المسافة على الشبكة / The path is no longer than the grid distance
    expect(path.length).toBeLessThanOrEqual(Math.abs(far.x - site.x) + Math.abs(far.z - site.z));
    expect(autoRoadPath(defs, world, laid, road, far, T0)).toEqual([]);
  });

  it('الطرق لا تُحسب من حد البناء المتزامن / roads do not count toward the concurrent limit', () => {
    let state = s;
    for (let i = 0; i < defs.world.maxConcurrentBuilds; i++) state = placeBuilding(state, building('farm'), spotFor(state, building('farm')), T0, `f${i}`);
    expect(placeRoadPath(state, defs, world, road, edgesTo(far), T0, uid).stoppedBy).toBeNull();
  });

  it('السور لا يفتح إلا بشروطه، ولا يُرسم فوق طريق، ولا يدخل في اتصال الطرق / walls need their conditions, avoid roads and never connect', () => {
    const wall = building('wooden_wall');
    const edges = edgesTo(far);
    expect(placeWallPath(s, defs, world, wall, edges, T0, uid).placed).toBe(0);
    // نفتح السور بشروطه: السكان ومركز التطوير / Unlock it: population and the development centre
    const open = { ...built(s, 'development_center'), population: wall.requiredPopulation, resources: s.resources };
    const walled = placeWallPath(open, defs, world, wall, edges.slice(0, 2), T0, uid);
    expect(walled.placed).toBe(2);
    expect(connectedRoads(walled.state, T0, true).size).toBe(0);
    expect(placeRoadPath(walled.state, defs, world, road, edges.slice(0, 1), T0, uid).stoppedBy).toContain('سور');
    const withRoad = placeRoadPath(open, defs, world, road, edges.slice(0, 1), T0, uid).state;
    expect(placeWallPath(withRoad, defs, world, wall, edges.slice(0, 1), T0, uid).stoppedBy).toContain('طريق');
    expect(demolishRoads(walled.state, defs, edges.slice(0, 2)).state.walls).toHaveLength(0);
  });

  it('الجرّافة تزيل الطرق وتسترد النسبة المحددة / the bulldozer removes roads and refunds the set share', () => {
    const edges = edgesTo(far);
    const drawn = placeRoadPath(s, defs, world, road, edges, T0, uid).state;
    const { state, removed } = demolishRoads(drawn, defs, edges.slice(0, 2));
    expect(removed).toBe(2);
    expect(state.roads).toHaveLength(edges.length - 2);
    const refund = Math.floor(((road.cost.stone ?? 0) * defs.world.demolishRefundPercent) / 100);
    expect(state.resources.stone).toBe(drawn.resources.stone + refund * 2);
  });
});

describe('الهدم والنقل / demolition and moving', () => {
  const s = rich(createInitialState(defs, world, site, T0));

  it('الهدم يسترد النسبة المحددة / demolition refunds the set share', () => {
    const houses = building('houses');
    const placed = placeBuilding(s, houses, spotFor(s, houses), T0, 'h1');
    const after = demolishBuilding(placed, defs, 'h1');
    expect(after.buildings).toHaveLength(0);
    expect(after.resources.stone).toBe(placed.resources.stone + Math.floor((houses.cost.stone * defs.world.demolishRefundPercent) / 100));
  });

  it('النقل يدفع النسبة المحددة ويحتفظ بالتقدم / moving pays the set share and keeps progress', () => {
    const farm = building('farm');
    const placed = placeBuilding(s, farm, spotFor(s, farm), T0, 'f1');
    const target = spotFor(placed, farm);
    expect(checkMove(defs, world, placed, 'f1', target, T0)).toEqual({ ok: true });
    const moved = moveBuilding(placed, defs, 'f1', target);
    expect(moved.buildings[0]).toMatchObject({ x: target.x, z: target.z, completesAt: placed.buildings[0].completesAt });
    expect(moved.resources.wood).toBe(placed.resources.wood - Math.floor((farm.cost.wood * defs.world.moveCostPercent) / 100));
  });
});

describe('المكامن / deposits', () => {
  const s = createInitialState(defs, world, site, T0);
  const r = defs.world.discoveryRadius;
  const distance = (k: string, territory: Set<string>) => {
    const [x, z] = k.split(',').map(Number);
    for (let d = 0; d <= r; d++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) if (territory.has(tileKey(x + dx, z + dz))) return d;
    return Infinity;
  };

  it('العالم يوزع كل أنواع المكامن على اليابسة / the world spreads every deposit type on land', () => {
    const types = new Set(world.deposits.map((d) => d.typeId));
    for (const t of defs.deposits) expect(types.has(t.id)).toBe(true);
    const water = new Set(defs.terrain.filter((t) => t.isWater).map((t) => t.id));
    for (const d of world.deposits) expect(d.tiles.every((k) => !water.has(tileOf(k).terrainId))).toBe(true);
  });

  it('منشأة المكمن تُبنى على مكمنها أيًّا كانت أرضه / a deposit facility is built on its deposit whatever the land', () => {
    const ore = world.deposits.find((d) => d.resourceId === 'gold')!;
    const prospector = defs.buildings.find((b) => b.requiresDeposit === 'gold')!;
    const t = tileOf(ore.tiles[0]);
    expect(prospector.allowedTerrain).not.toContain(t.terrainId);
    const state = rich({ ...s, settlement: { x: t.x + 1, z: t.z }, territory: [tileKey(t.x, t.z), tileKey(t.x + 1, t.z)], discovered: [ore.id] });
    expect(checkPlacement(defs, world, state, prospector, t, T0)).toEqual({ ok: true });
  });

  it('البداية فيها حجر وحديد وغابة قريبة ومكتشفة / the start has nearby, discovered stone, iron and forest', () => {
    const found = new Set(world.deposits.filter((d) => s.discovered.includes(d.id)).map((d) => d.resourceId));
    for (const r of ['stone', 'iron', 'wood']) expect(found.has(r), r).toBe(true);
    // وخارج حدود القرية، فتحتاج توسعًا قريبًا / And outside the village borders, so they need a nearby expansion
    const territory = new Set(s.territory);
    for (const d of world.deposits.filter((x) => s.discovered.includes(x.id))) expect(d.tiles.every((k) => territory.has(k))).toBe(false);
  });

  it('تُكتشف المكامن القريبة من الحدود فقط / only deposits near the borders are discovered', () => {
    const territory = new Set(s.territory);
    for (const d of world.deposits) {
      const near = d.tiles.some((k) => distance(k, territory) <= r);
      expect(s.discovered.includes(d.id)).toBe(near);
    }
    expect(s.discovered.length).toBeLessThan(world.deposits.length);
  });

  it('المبنى الذي يتطلب مكمنًا مرفوض بلا مكمن / a deposit building is refused away from a deposit', () => {
    const sawmill = defs.buildings.find((b) => b.requiresDeposit && b.stage === defs.stages[0].id)!;
    const plain = s.territory.map(tileOf).find((t) => sawmill.allowedTerrain.includes(t.terrainId) && !depositAt(world, s, t.x, t.z, sawmill.requiresDeposit!))!;
    const result = checkPlacement(defs, world, rich(s), sawmill, plain, T0);
    expect(!result.ok && result.reason).toContain('مكتشف');
  });

  it('المبنى يُقبل على مكمن مكتشف داخل الدولة / the building is accepted on a discovered deposit inside the nation', () => {
    const combo = world.deposits.flatMap((d) => d.tiles.map((k) => ({ d, t: tileOf(k) }))).flatMap(({ d, t }) => {
      const b = defs.buildings.find((x) => x.requiresDeposit === d.resourceId && x.allowedTerrain.includes(t.terrainId) && !x.requiresTech && x.stage === defs.stages[0].id && !x.requiredPopulation && !x.requiredBuildings.length);
      return b ? [{ d, t, b }] : [];
    })[0];
    expect(combo).toBeDefined();
    const { d, t, b } = combo;
    // نضع مبنى الحكم بجوار المكمن لتوفير الطريق / The government sits beside the deposit to provide road access
    const state = rich({ ...s, settlement: { x: t.x + 1, z: t.z }, territory: [tileKey(t.x, t.z), tileKey(t.x + 1, t.z)], discovered: [d.id] });
    expect(checkPlacement(defs, world, state, b, t, T0)).toEqual({ ok: true });
    expect(checkPlacement(defs, world, { ...state, discovered: [] }, b, t, T0).ok).toBe(false);
  });

  it('المسح يكشف المكامن حول المربع ويدفع التكلفة / a survey reveals deposits around the tile and pays', () => {
    const hidden = world.deposits.find((d) => !s.discovered.includes(d.id))!;
    const target = tileOf(hidden.tiles[0]);
    const result = surveyTile(rich(s), defs, world, target);
    expect('found' in result).toBe(true);
    if (!('found' in result)) return;
    expect(result.found.map((d) => d.id)).toContain(hidden.id);
    const [id, cost] = Object.entries(surveyCost(defs))[0];
    expect(result.state.resources[id]).toBe(100_000 - cost);
  });

  it('المسح يُرفض عند نقص الموارد / a survey is refused without resources', () => {
    const poor = { ...s, resources: Object.fromEntries(Object.keys(s.resources).map((k) => [k, 0])) };
    expect('reason' in surveyTile(poor, defs, world, tileOf(tileKey(site.x, site.z)))).toBe(true);
  });
});

describe('الضم / annexation', () => {
  const s = rich(createInitialState(defs, world, site, T0));
  const border = world.tiles.find((t) => {
    const land = !defs.terrain.find((x) => x.id === t.terrainId)!.isWater;
    const outside = !s.territory.includes(tileKey(t.x, t.z));
    return land && outside && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => s.territory.includes(tileKey(t.x + dx, t.z + dz)));
  })!;

  it('يضم كتلة مجاورة ويدفع التكلفة / annexes a neighbouring block and pays', () => {
    expect(checkAnnex(defs, world, s, border)).toEqual({ ok: true });
    const next = annexTile(s, defs, world, border);
    expect(next.territory).toContain(tileKey(border.x, border.z));
    expect(next.resources[defs.world.annexResource]).toBe(s.resources[defs.world.annexResource] - defs.world.annexCost);
  });

  it('يرفض مربعًا بعيدًا عن الحدود / refuses a tile away from the borders', () => {
    const far = world.tiles.find((t) => Math.hypot(t.x - site.x, t.z - site.z) > 40 && !defs.terrain.find((x) => x.id === t.terrainId)!.isWater)!;
    expect(checkAnnex(defs, world, s, far).ok).toBe(false);
  });
});
