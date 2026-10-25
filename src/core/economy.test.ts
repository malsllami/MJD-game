// اختبارات منطق الاقتصاد: الوضع، الإنتاج والاستهلاك، السكان، المراحل، الغياب، والضم
// Economy tests: placement, production and consumption, population, stages, absence and annexation
import { describe, expect, it } from 'vitest';
import { seedDefinitions } from '../test/gas-harness';
import {
  advance, annexTile, applyStageProgress, buildingStatus, checkAnnex, checkMove, checkPlacement, createInitialState, demolishBuilding,
  housingCapacity, moveBuilding, netRates, placeBuilding, placeRoadPath, resumeAfterAbsence, tileKey, tilePath,
} from './economy';
import { suggestStartSites } from './start-sites';
import type { BuildingDef, GameState, Tile } from './types';
import { generateWorld } from './world-gen';

const defs = seedDefinitions();
const world = generateWorld(defs.world, defs.terrain);
const site = suggestStartSites(world, defs)[0];
const T0 = 1_000_000;
const MIN = 60_000;
const building = (id: string) => defs.buildings.find((b) => b.id === id)!;
const tileOf = (key: string): Tile => {
  const [x, z] = key.split(',').map(Number);
  return world.tiles[z * defs.world.tilesX + x];
};

/**
 * أول مربع فارغ في الدولة يصلح للمبنى؛ ما يتطلب طريقًا يوضع بجوار مركز القرية
 * First free nation tile that fits the building; road-dependent ones go next to the village centre
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

/** وضع مبنى مع موارد كافية، وإنهاء إنشائه فورًا / Place a building with ample resources and finish it at once */
function built(state: GameState, id: string, at = T0): GameState {
  const b = building(id);
  const rich = { ...state, resources: Object.fromEntries(Object.keys(state.resources).map((k) => [k, Math.max(state.resources[k], 100_000)])) };
  const placed = placeBuilding(rich, b, spotFor(rich, b), at, `${id}-${state.buildings.length}`);
  placed.buildings[placed.buildings.length - 1].completesAt = at;
  return { ...placed, resources: state.resources };
}

describe('البداية / start', () => {
  const s = createInitialState(defs, world, site, T0);
  it('تبدأ قرية بلا سكان وبحدود المرحلة الأولى / starts as a village with no people and first-stage borders', () => {
    expect(s.stage).toBe(defs.stages[0].id);
    expect(s.population).toBe(0);
    expect(s.territory).toContain(tileKey(site.x, site.z));
    expect(s.resources.gold).toBe(defs.resources.find((r) => r.id === 'gold')!.startAmount);
  });
});

describe('وضع المباني / placement', () => {
  const s = createInitialState(defs, world, site, T0);

  it('المبنى المفتوح بأرض مناسبة وموارد كافية يُقبل ويخصم التكلفة / an open, affordable building on fitting land is accepted and paid', () => {
    const farm = building('farm');
    const tile = spotFor(s, farm);
    expect(checkPlacement(defs, s, farm, tile, T0)).toEqual({ ok: true });
    const next = placeBuilding(s, farm, tile, T0, 'u1');
    expect(next.resources.wood).toBe(s.resources.wood - farm.cost.wood);
    expect(next.buildings[0].completesAt).toBe(T0 + farm.buildSeconds * 1000);
  });

  it('مبنى مرحلة لاحقة مقفل حتى بلوغها / a later-stage building is locked until that stage', () => {
    const hospital = building('hospital');
    const result = checkPlacement(defs, s, hospital, spotFor(s, hospital), T0);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('بلدة');
  });

  it('يرفض مربع القرية والأرض غير المناسبة وخارج الحدود / refuses the village tile, unfit land and outside borders', () => {
    const farm = building('farm');
    expect(checkPlacement(defs, s, farm, world.tiles[site.z * defs.world.tilesX + site.x], T0).ok).toBe(false);
    const unfit = s.territory.map(tileOf).find((t) => !farm.allowedTerrain.includes(t.terrainId) && !(t.x === site.x && t.z === site.z));
    if (unfit) expect(checkPlacement(defs, s, farm, unfit, T0).ok).toBe(false);
    const outside = world.tiles.find((t) => !s.territory.includes(tileKey(t.x, t.z)) && farm.allowedTerrain.includes(t.terrainId))!;
    expect(checkPlacement(defs, s, farm, outside, T0).ok).toBe(false);
  });

  it('يحترم حد البناء المتزامن / respects the concurrent-build limit', () => {
    let state: GameState = { ...s, resources: { ...s.resources, wood: 100_000 } };
    const farm = building('farm');
    for (let i = 0; i < defs.world.maxConcurrentBuilds; i++) state = placeBuilding(state, farm, spotFor(state, farm), T0, `f${i}`);
    expect(checkPlacement(defs, state, farm, spotFor(state, farm), T0).ok).toBe(false);
  });
});

describe('الزمن / time', () => {
  const s = createInitialState(defs, world, site, T0);

  it('لا إنتاج قبل اكتمال الإنشاء، ثم إنتاج بالدقيقة بعده / no output while constructing, per-minute output after', () => {
    const farm = building('farm');
    const placed = placeBuilding({ ...s, resources: { ...s.resources } }, farm, spotFor(s, farm), T0, 'f');
    const food = placed.resources.food;
    expect(advance(placed, defs, world, T0 + farm.buildSeconds * 1000).resources.food).toBeCloseTo(food);
    const later = advance(placed, defs, world, T0 + farm.buildSeconds * 1000 + 2 * MIN);
    expect(later.resources.food).toBeCloseTo(food + 2 * farm.production.food);
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
    const placed = state.buildings[0];
    expect(buildingStatus(placed, state, defs, T0).kind).toBe('stopped');
    expect(advance(state, defs, world, T0 + 10 * MIN).population).toBe(0);
  });

  it('صافي الإنتاج = الإنتاج ناقص الاستهلاك / net rate is production minus consumption', () => {
    const state = built(built(s, 'water_desal'), 'houses');
    const rates = netRates(state, defs, T0);
    expect(rates.water).toBe(building('water_desal').production.water - building('houses').consumption.water);
  });

  it('بلوغ سكان البلدة يرقّي المرحلة ويوسع الحدود / reaching town population upgrades the stage and widens borders', () => {
    const town = defs.stages[1];
    const next = applyStageProgress({ ...s, population: town.population }, defs, world);
    expect(next.stage).toBe(town.id);
    expect(applyStageProgress({ ...s, population: town.population - 1 }, defs, world).stage).toBe(s.stage);
    expect(next.territory.length).toBeGreaterThan(s.territory.length);
  });

  it('الغياب يُحسب حتى الحد الأقصى فقط / absence is credited only up to the cap', () => {
    const state = built(s, 'farm');
    const cap = defs.world.offlineCapHours * 60 * MIN;
    const resume = resumeAfterAbsence(state, defs, world, T0 + cap * 3);
    expect(resume.creditedMs).toBe(cap);
    expect(resume.state.lastTick).toBe(T0 + cap * 3);
    expect(resume.gained.food).toBeCloseTo(building('farm').production.food * defs.world.offlineCapHours * 60);
  });
});

describe('الطرق والهدم والنقل / roads, demolition and moving', () => {
  const s = { ...createInitialState(defs, world, site, T0), resources: Object.fromEntries(defs.resources.map((r) => [r.id, 100_000])) };
  const houses = building('houses');
  const road = building('road');
  const pathTo = (t: Tile) => tilePath(site, t).slice(1, -1).map((p) => world.tiles[p.z * defs.world.tilesX + p.x]);
  /** مربع للمنازل بعيد عن المركز، وكل مسار الطريق إليه داخل الدولة ويقبل الطريق / A far houses tile whose whole road path is allowed */
  const far = s.territory.map(tileOf).find((t) =>
    houses.allowedTerrain.includes(t.terrainId) && Math.abs(t.x - site.x) + Math.abs(t.z - site.z) >= 3 &&
    pathTo(t).every((p) => road.allowedTerrain.includes(p.terrainId) && s.territory.includes(tileKey(p.x, p.z))))!;

  it('يوجد موقع اختبار مناسب / a suitable test spot exists', () => {
    expect(far).toBeDefined();
  });

  it('المنازل بعيدًا عن الطرق مرفوضة / houses away from any road are refused', () => {
    const result = checkPlacement(defs, s, houses, far, T0);
    expect(!result.ok && result.reason).toContain('طريق');
  });

  it('رسم طريق من القرية يسمح بالبناء بجواره / a road drawn from the village allows building beside it', () => {
    // المسار يبدأ من مركز القرية كما يفعل اللاعب / The path starts on the village centre, as players do
    const path = [world.tiles[site.z * defs.world.tilesX + site.x], ...pathTo(far)];
    let n = 0;
    const drawn = placeRoadPath(s, defs, road, path, T0, () => `r${n++}`);
    expect(drawn.stoppedBy).toBeNull();
    expect(drawn.placed).toBe(path.length - 1);
    expect(checkPlacement(defs, drawn.state, houses, far, T0)).toEqual({ ok: true });
    // المبنى لا يعمل حتى يكتمل الطريق / The building only runs once the road is finished
    const withHouse = placeBuilding(drawn.state, houses, far, T0, 'h');
    withHouse.buildings[withHouse.buildings.length - 1].completesAt = T0;
    expect(buildingStatus(withHouse.buildings.at(-1)!, withHouse, defs, T0).kind).toBe('disconnected');
    expect(buildingStatus(withHouse.buildings.at(-1)!, withHouse, defs, T0 + road.buildSeconds * 1000).kind).toBe('operating');
  });

  it('الطرق لا تُحسب من حد البناء المتزامن / roads do not count toward the concurrent limit', () => {
    let state = s;
    for (let i = 0; i < defs.world.maxConcurrentBuilds; i++) state = placeBuilding(state, building('farm'), spotFor(state, building('farm')), T0, `f${i}`);
    expect(checkPlacement(defs, state, road, spotFor(state, road), T0)).toEqual({ ok: true });
  });

  it('الهدم يسترد النسبة المحددة / demolition refunds the set share', () => {
    const placed = placeBuilding(s, houses, spotFor(s, houses), T0, 'h1');
    const after = demolishBuilding(placed, defs, 'h1');
    expect(after.buildings).toHaveLength(0);
    expect(after.resources.stone).toBe(placed.resources.stone + Math.floor((houses.cost.stone * defs.world.demolishRefundPercent) / 100));
  });

  it('النقل يدفع النسبة المحددة ويحتفظ بالتقدم / moving pays the set share and keeps progress', () => {
    const farm = building('farm');
    const placed = placeBuilding(s, farm, spotFor(s, farm), T0, 'f1');
    const target = spotFor(placed, farm);
    expect(checkMove(defs, placed, 'f1', target, T0)).toEqual({ ok: true });
    const moved = moveBuilding(placed, defs, 'f1', target);
    expect(moved.buildings[0]).toMatchObject({ x: target.x, z: target.z, completesAt: placed.buildings[0].completesAt });
    expect(moved.resources.wood).toBe(placed.resources.wood - Math.floor((farm.cost.wood * defs.world.moveCostPercent) / 100));
  });
});

describe('الضم / annexation', () => {
  const s = createInitialState(defs, world, site, T0);
  const border = world.tiles.find((t) => {
    const land = !defs.terrain.find((x) => x.id === t.terrainId)!.isWater;
    const outside = !s.territory.includes(tileKey(t.x, t.z));
    return land && outside && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => s.territory.includes(tileKey(t.x + dx, t.z + dz)));
  })!;

  it('يضم مربعًا مجاورًا ويدفع التكلفة / annexes a neighbouring tile and pays', () => {
    expect(checkAnnex(defs, s, border)).toEqual({ ok: true });
    const next = annexTile(s, defs, border);
    expect(next.territory).toContain(tileKey(border.x, border.z));
    expect(next.resources[defs.world.annexResource]).toBe(s.resources[defs.world.annexResource] - defs.world.annexCost);
  });

  it('يرفض مربعًا بعيدًا عن الحدود / refuses a tile away from the borders', () => {
    const far = world.tiles.find((t) => Math.hypot(t.x - site.x, t.z - site.z) > 20 && !defs.terrain.find((x) => x.id === t.terrainId)!.isWater)!;
    expect(checkAnnex(defs, s, far).ok).toBe(false);
  });
});
