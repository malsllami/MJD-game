// اختبارات الغابة المحيطة: القرية الأولى بقدر منشآتها، وقطع الغابة بمدة وتكلفة وخشب، وما يكشفه من موارد عشوائية حسب المستوى
// Surrounding forest tests: a first village fitting its facilities, clearing for a time, a cost and wood, and the random resources it reveals by level
import { describe, expect, it } from 'vitest';
import { seedDefinitions } from '../test/gas-harness';
import { advance, annexCost, richnessOf, checkTorch, createInitialState, demolishRoads, depositAt, innerWalls, moveTorch, placeTorch, removeTorch, swapWall, tileKey, torchNear, wallLine, wallNear } from './economy';
import { checkClearing, clearingParcel, drawDeposit, expansionQuota, isForestMode, startClearing } from './frontier';
import { suggestStartSites } from './start-sites';
import type { GameState, Tile } from './types';
import { generateWorld } from './world-gen';

const defs = seedDefinitions();
const world = generateWorld(defs.world, defs.terrain, defs.deposits);
const site = suggestStartSites(world, defs)[0];
const T0 = 1_000_000;
const start = createInitialState(defs, world, site, T0);
const tileAt = (x: number, z: number): Tile => world.tiles[z * defs.world.tilesX + x];
const R = defs.stages[0].territoryRadius;
/** أول مربع خارج الحدود جنوب مبنى الحكم / The first tile past the border south of the government */
const outside = tileAt(site.x, site.z + R + 1);

describe('الغابة المحيطة / the surrounding forest', () => {
  it('القرية الأولى 9 × 9 وكل منشآتها داخلها / the first village is 9 × 9 with all its facilities inside', () => {
    expect(isForestMode(defs)).toBe(true);
    expect(start.territory).toHaveLength((2 * R + 1) ** 2);
    const owned = new Set(start.territory);
    for (const b of start.buildings) expect(owned.has(tileKey(b.x, b.z)), b.buildingId).toBe(true);
  });

  it('سور القرية الأولى على حدودها كلها وبوابة واحدة عند الطريق الرئيسي / the first wall runs the whole border with one gate at the main road', () => {
    const model = (id: string) => defs.buildings.find((b) => b.id === id)!.model;
    const gates = start.walls.filter((w) => model(w.buildingId) === 'gate');
    expect(gates).toHaveLength(2);
    expect(start.walls).toHaveLength(4 * (2 * R + 1));
    expect(start.walls.every((w) => w.completesAt === T0)).toBe(true);
    // ضلعا البوابة متجاوران على خط الحدود الجنوبي / The two gate edges sit side by side on the southern border line
    expect(new Set(gates.map((g) => g.edge.split(',')[1])).size).toBe(1);
  });

  it('السور يُختار بالضغط عليه، ويُزال خطه كاملًا، ويتحول إلى بوابة / the wall is picked by tapping, its whole line removed, and turned into a gate', () => {
    const north = site.z + R + 1;
    const piece = wallNear(start, defs, { x: site.x + 2.5, z: north + 0.05 }, 0.14)!;
    expect(piece.edge).toBe(`h:${site.x + 2},${north}`);
    expect(wallNear(start, defs, { x: site.x + 2.5, z: north - 0.5 }, 0.14)).toBeUndefined();
    const line = wallLine(start, piece.edge);
    expect(line).toHaveLength(2 * R + 1);
    expect(demolishRoads(start, defs, line).state.walls).toHaveLength(start.walls.length - line.length);
    const gate = defs.buildings.find((b) => b.model === 'gate')!;
    expect(swapWall(start, defs, piece.edge, gate).walls.find((w) => w.edge === piece.edge)!.buildingId).toBe(gate.id);
  });

  it('بعد القطع يُعرف السور القديم الذي صار داخل القرية / after clearing, the old wall now inside the village is known', () => {
    expect(innerWalls(start, defs)).toEqual([]);
    const done = advance(startClearing(start, defs, world, outside, T0, 'c2'), defs, world, T0 + defs.world.clearingSeconds * 1000);
    expect(innerWalls(done, defs).length).toBeGreaterThan(0);
  });

  it('قطع الغابة 3 × 3 تنتظم مع مجمع الحكم / forest parcels are 3 × 3 aligned with the compound', () => {
    const parcel = clearingParcel(defs, world, start, outside).map((t) => tileKey(t.x, t.z));
    expect(parcel).toHaveLength(9);
    expect(parcel.some((k) => start.territory.includes(k))).toBe(false);
    const inner = clearingParcel(defs, world, start, tileAt(site.x, site.z)).map((t) => tileKey(t.x, t.z));
    expect(inner.every((k) => start.territory.includes(k))).toBe(true);
  });

  it('لا يُقطع إلا ما يجاور الحدود وبتكلفته / only parcels beside the border, and only when affordable', () => {
    expect(checkClearing(defs, world, start, outside, T0)).toEqual({ ok: true });
    expect(checkClearing(defs, world, start, tileAt(site.x, site.z + R + 5), T0).ok).toBe(false);
    const poor = { ...start, resources: { ...start.resources, [defs.world.annexResource]: 0 } };
    expect(checkClearing(defs, world, poor, outside, T0).ok).toBe(false);
  });

  it('القطع يأخذ مدته ثم تنضم القطعة مع خشبها / clearing takes its time, then the parcel joins with its wood', () => {
    const cut = startClearing(start, defs, world, outside, T0, 'c1');
    for (const [id, n] of Object.entries(annexCost(defs))) expect(cut.resources[id]).toBe(start.resources[id] - n);
    expect(checkClearing(defs, world, cut, outside, T0).ok).toBe(false);
    const half = advance(cut, defs, world, T0 + (defs.world.clearingSeconds * 1000) / 2);
    expect(half.territory).toHaveLength(start.territory.length);
    const done = advance(cut, defs, world, T0 + defs.world.clearingSeconds * 1000);
    expect(done.territory).toHaveLength(start.territory.length + 9);
    expect(done.clearings).toEqual([]);
    expect(done.territory).toContain(tileKey(outside.x, outside.z));
  });

  it('حصة التوسع: 16 قطعة في المستويات 1–3 ثم 4 لكل مستوى / the quota: 16 parcels in levels 1–3, then 4 per level', () => {
    expect(defs.governmentLevels.map((l) => l.expansionParcels)).toEqual([16, 16, 16, 20, 24, 28, 32]);
    const full = { ...start, clearedParcels: 16 };
    expect(expansionQuota(defs, full, T0)).toEqual({ used: 16, allowed: 16 });
    const refused = checkClearing(defs, world, full, outside, T0);
    expect(!refused.ok && refused.reason).toContain('حد التوسع');
    expect(checkClearing(defs, world, { ...full, governmentLevel: 4 }, outside, T0)).toEqual({ ok: true });
  });

  it('نتيجة البقعة تُسحب عند بدء القطع وتُحفظ / the spot result is drawn when clearing starts and kept', () => {
    const cut = startClearing(start, defs, world, outside, T0, 'c3');
    const kept = cut.clearings![0].result;
    expect(kept).toBeDefined();
    // ترقية الحكم أثناء القطع لا تغير ما سيُكشف / Upgrading the government meanwhile changes nothing
    const done = advance({ ...cut, governmentLevel: 7 }, defs, world, T0 + defs.world.clearingSeconds * 1000);
    expect(done.foundDeposits ?? []).toEqual(kept ? [kept] : []);
    expect(done.clearedParcels).toBe(1);
  });

  it('المزرعة على أرض خصبة تنتج بقدر غناها / a farm on fertile land produces by its richness', () => {
    const farm = defs.buildings.find((b) => b.id === 'farm')!;
    const fertile = { id: 'found-f', typeId: 'fertile_land', resourceId: 'food', x: 3, z: 3, tiles: ['3,3'], richness: 1.5 };
    const placed = { uid: 'f', buildingId: 'farm', x: 3, z: 3, startedAt: 0, completesAt: 0 };
    expect(richnessOf({ ...start, foundDeposits: [fertile] }, placed, farm)).toBe(1.5);
    expect(richnessOf(start, placed, farm)).toBe(1);
  });

  it('الموارد تتفاوت بين القطع، وقد تكون القطعة فارغة / resources differ between parcels, and a parcel may be empty', () => {
    const results = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const tiles = [tileKey(10 + i * 3, 10), tileKey(11 + i * 3, 10)];
      results.add(drawDeposit(defs, world, tiles, 1)?.typeId ?? 'empty');
    }
    expect(results.has('empty')).toBe(true);
    expect(results.size).toBeGreaterThan(3);
  });

  it('النحاس والنفط لا يظهران قبل مستواهما / copper and oil never appear before their level', () => {
    const late = new Set(defs.frontierResources.filter((r) => r.minLevel > 1).map((r) => r.depositTypeId));
    for (let i = 0; i < 200; i++) {
      const d = drawDeposit(defs, world, [tileKey(5 + (i % 40) * 3, 5 + Math.floor(i / 40) * 3)], 1);
      if (d) expect(late.has(d.typeId)).toBe(false);
    }
  });

  it('المكمن المكشوف يُبنى عليه وغناه ضمن حدوده / a revealed deposit can be built on, with richness in range', () => {
    let s: GameState | null = null;
    let found = null;
    for (let i = 0; i < 40 && !found; i++) {
      const tiles = [tileKey(20 + i * 3, 30), tileKey(21 + i * 3, 30)];
      found = drawDeposit(defs, world, tiles, 1);
    }
    expect(found).toBeTruthy();
    const rule = defs.frontierResources.find((r) => r.depositTypeId === found!.typeId)!;
    expect(found!.richness).toBeGreaterThanOrEqual(rule.minRichness);
    expect(found!.richness).toBeLessThanOrEqual(rule.maxRichness);
    s = { ...start, foundDeposits: [found!] };
    expect(depositAt(world, s, found!.x, found!.z, found!.resourceId)).toEqual(found);
  });
});

describe('الشعلات والقوائم / torches and menus', () => {
  const torch = defs.buildings.find((b) => b.model === 'torch')!;

  it('الشعلة في أي موضع داخل الدولة، لا تلاصق أخرى، وتُنقل وتُزال / a torch anywhere inside the nation, never touching another, movable and removable', () => {
    const spot = { x: site.x + 1.83, z: site.z - 1.47 };
    expect(checkTorch(defs, start, torch, spot, T0)).toEqual({ ok: true });
    expect(checkTorch(defs, start, torch, { x: site.x + R + 3.5, z: site.z }, T0).ok).toBe(false);
    const lit = placeTorch(start, torch, spot, T0, 't1');
    for (const [id, n] of Object.entries(torch.cost)) expect(lit.resources[id]).toBe(start.resources[id] - n);
    expect(checkTorch(defs, lit, torch, { x: spot.x + 0.05, z: spot.z }, T0).ok).toBe(false);
    expect(torchNear(lit, { x: spot.x + 0.1, z: spot.z + 0.1 }, 0.22)?.uid).toBe('t1');
    const moved = moveTorch(lit, 't1', { x: spot.x + 1, z: spot.z });
    expect(torchNear(moved, spot, 0.22)).toBeUndefined();
    expect(checkTorch(defs, moved, torch, { x: spot.x + 1.02, z: spot.z }, T0, 't1')).toEqual({ ok: true });
    expect(removeTorch(moved, defs, 't1').torches).toEqual([]);
  });

  it('القوائم الست بالترتيب، وكل مبنى في فئته / the six menus in order, each building in its own', () => {
    expect(defs.buildingCategories.slice(0, 6).map((c) => c.name)).toEqual(['الصناعة', 'المرافق', 'النقل', 'السكن', 'الاقتصاد', 'الحكم']);
    const cat = (id: string) => defs.buildings.find((b) => b.id === id)!.category;
    expect(['farm', 'well', 'blacksmith'].map(cat)).toEqual(['industry', 'industry', 'industry']);
    expect(['torch', 'wooden_wall', 'paving_stone', 'pond'].map(cat)).toEqual(['utilities', 'utilities', 'utilities', 'utilities']);
    expect(['market', 'bank'].map(cat)).toEqual(['economy', 'economy']);
    expect(['hospital', 'engineering_office', 'barracks'].map(cat)).toEqual(['government', 'government', 'government']);
  });
});
