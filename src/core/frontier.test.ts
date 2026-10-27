// اختبارات الغابة المحيطة: القرية الأولى بقدر منشآتها، وقطع الغابة بمدة وتكلفة وخشب، وما يكشفه من موارد عشوائية حسب المستوى
// Surrounding forest tests: a first village fitting its facilities, clearing for a time, a cost and wood, and the random resources it reveals by level
import { describe, expect, it } from 'vitest';
import { seedDefinitions } from '../test/gas-harness';
import { advance, annexCost, createInitialState, depositAt, tileKey } from './economy';
import { checkClearing, clearingParcel, drawDeposit, isForestMode, startClearing } from './frontier';
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
