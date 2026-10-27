// اختبارات الري: قنوات من البئر، والمزرعة المروية أسرع إنتاجًا دون مضاعفة الخصوبة، وما ينقطع عن المصدر يجف
// Irrigation tests: canals from the well, an irrigated farm producing faster without doubling fertility, and what is cut off the source dries up
import { describe, expect, it } from 'vitest';
import { seedDefinitions } from '../test/gas-harness';
import { createInitialState, demolishRoads, edgeBetween, edgeTiles, isSettlementTile, isWaterTile, placeWallPath, rateBreakdown, tileEdges, tileKey } from './economy';
import { canalNetwork, irrigationFactor, isIrrigated } from './irrigation';
import { suggestStartSites } from './start-sites';
import type { GameState } from './types';
import { generateWorld } from './world-gen';

const defs = seedDefinitions();
const world = generateWorld(defs.world, defs.terrain, defs.deposits);
const site = suggestStartSites(world, defs)[0];
const T0 = 1_000_000;
const start: GameState = { ...createInitialState(defs, world, site, T0), resources: Object.fromEntries(defs.resources.map((r) => [r.id, 1e5])) };
const canal = defs.buildings.find((b) => b.model === 'canal')!;
const farm = start.buildings.find((b) => b.buildingId === 'farm')!;
const farmDef = defs.buildings.find((b) => b.id === 'farm')!;
const [wx, wz] = start.springs![0].split(',').map(Number);
const uid = (() => {
  let n = 0;
  return () => `c${n++}`;
})();

/** مسار حواف على خطوط الشبكة من زاوية إلى زاوية (أفقي ثم رأسي) / An edge path on grid lines corner to corner (horizontal, then vertical) */
function path(from: { x: number; z: number }, to: { x: number; z: number }): string[] {
  const out: string[] = [];
  let { x, z } = from;
  while (x !== to.x) {
    const nx = x + Math.sign(to.x - x);
    out.push(edgeBetween({ x, z }, { x: nx, z }));
    x = nx;
  }
  while (z !== to.z) {
    const nz = z + Math.sign(to.z - z);
    out.push(edgeBetween({ x, z }, { x, z: nz }));
    z = nz;
  }
  return out;
}

/**
 * قناة من زاوية البئر حتى ضلع من أضلاع المزرعة بلا طريق، بأقصر مسار يتجنب الطرق والماء والمجمع، مكتملة
 * A canal from the well's corner to a road-free side of the farm, by the shortest path avoiding roads, water and the compound, finished
 */
function canalEdges(): string[] {
  const roads = new Set(start.roads.map((r) => r.edge));
  const goals = new Set(tileEdges(farm.x, farm.z).filter((e) => !roads.has(e)));
  const owned = new Set(start.territory);
  const ok = (e: string) => !roads.has(e) && edgeTiles(e).some(([x, z]) => owned.has(tileKey(x, z)) && !isWaterTile(world, x, z) && !isSettlementTile(start, x, z));
  const from = new Map<string, string | null>([[tileKey(wx, wz), null]]);
  const queue = [tileKey(wx, wz)];
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i].split(',').map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const e = edgeBetween({ x, z }, { x: x + dx, z: z + dz });
      if (!ok(e)) continue;
      const next = tileKey(x + dx, z + dz);
      if (goals.has(e)) {
        const out = [e];
        for (let at: string | null = queue[i]; at && from.get(at); at = from.get(at)!) {
          const [ax, az] = at.split(',').map(Number);
          const [bx, bz] = from.get(at)!.split(',').map(Number);
          out.unshift(edgeBetween({ x: bx, z: bz }, { x: ax, z: az }));
        }
        return out;
      }
      if (from.has(next)) continue;
      from.set(next, queue[i]);
      queue.push(next);
    }
  }
  throw new Error('no canal path');
}

function irrigate(s: GameState, reverse = false): ReturnType<typeof placeWallPath> {
  const edges = canalEdges();
  const result = placeWallPath(s, defs, world, canal, reverse ? [...edges].reverse() : edges, T0, uid);
  return { ...result, state: { ...result.state, walls: result.state.walls.map((w) => ({ ...w, completesAt: T0 })) } };
}

describe('الري / irrigation', () => {
  it('القناة تبدأ من البئر وتصل المزرعة فتصير مروية / the canal starts at the well and reaches the farm, irrigating it', () => {
    const result = irrigate(start);
    expect(result.stoppedBy).toBeNull();
    expect(isIrrigated(farm, canalNetwork(result.state, defs, T0).edges)).toBe(true);
    expect(isIrrigated(farm, canalNetwork(start, defs, T0).edges)).toBe(false);
  });

  it('المسار المرسوم من طرفه البعيد يُعكس، وغير المتصل يُرفض بسببه / a path drawn from its far end is reversed, and an unjoined one is refused with why', () => {
    expect(irrigate(start, true).stoppedBy).toBeNull();
    const lone = placeWallPath(start, defs, world, canal, path({ x: site.x + 3, z: site.z + 3 }, { x: site.x + 3, z: site.z + 4 }), T0, uid);
    expect(lone.placed).toBe(0);
    expect(lone.stoppedBy).toContain('البئر');
  });

  it('الري يرفع سرعة المزرعة فقط، والخصوبة لا تُحسب مرتين / irrigation speeds up the farm only, and fertility is never counted twice', () => {
    const wet = irrigate(start).state;
    const before = rateBreakdown(start, defs, T0).production.food;
    const after = rateBreakdown(wet, defs, T0).production.food;
    const farmShare = farmDef.production.food * (start.foundDeposits?.find((d) => d.tiles.includes(tileKey(farm.x, farm.z)))?.richness ?? 1);
    expect(after - before).toBeCloseTo(farmShare * (defs.world.irrigationSpeedPercent / 100 - 1), 5);
    const barn = defs.buildings.find((b) => b.id === 'livestock')!;
    expect(irrigationFactor(defs, { ...farm, buildingId: 'livestock' }, barn, canalNetwork(wet, defs, T0).edges)).toBe(1);
  });

  it('قطع القناة عن البئر يوقف الري، وتُحفظ القنوات في حالة اللعبة / cutting the canal off the well stops irrigation, and canals live in the game state', () => {
    const wet = irrigate(start).state;
    // القطعة الأخيرة على ضلع المزرعة / The last piece, on the farm's side
    const last = canalEdges().at(-1)!;
    const cut = demolishRoads(wet, defs, [last]).state;
    expect(isIrrigated(farm, canalNetwork(cut, defs, T0).edges)).toBe(false);
    const saved = JSON.parse(JSON.stringify(wet)) as GameState;
    expect(isIrrigated(farm, canalNetwork(saved, defs, T0).edges)).toBe(true);
  });
});
