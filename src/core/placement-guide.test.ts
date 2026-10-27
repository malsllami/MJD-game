// اختبارات توجيه البناء: المناطق المقترحة والتنبيه الذي لا يمنع البناء / Placement guidance tests: suggested zones and the non-blocking note
import { describe, expect, it } from 'vitest';
import { classicDefinitions } from '../test/gas-harness';
import { checkPlacement, createInitialState, tileKey } from './economy';
import { placementAdvice, zoneTest } from './placement-guide';
import { suggestStartSites } from './start-sites';
import type { GameState } from './types';
import { generateWorld } from './world-gen';

const defs = classicDefinitions();
const world = generateWorld(defs.world, defs.terrain, defs.deposits);
const site = suggestStartSites(world, defs)[0];
const T0 = 1_000_000;
const start = createInitialState(defs, world, site, T0);
const rich: GameState = { ...start, resources: Object.fromEntries(defs.resources.map((r) => [r.id, 5000])) };
const def = (id: string) => defs.buildings.find((b) => b.id === id)!;
const tileAt = (x: number, z: number) => world.tiles[z * defs.world.tilesX + x];
const { adminZoneRadius, residentialZoneRadius } = defs.world;

describe('توجيه البناء / placement guidance', () => {
  it('المساكن مقترحة قرب مبنى الحكم فقط / housing is suggested near the government building only', () => {
    const near = zoneTest(defs, rich, def('houses'), T0)!;
    expect(near(site.x + residentialZoneRadius, site.z)).toBe(true);
    expect(near(site.x + residentialZoneRadius + 1, site.z)).toBe(false);
  });

  it('المباني الإدارية حول مبنى الحكم، والمزارع خارج منطقة السكن / administration around the government, farms outside housing', () => {
    expect(zoneTest(defs, rich, def('development_center'), T0)!(site.x, site.z + adminZoneRadius)).toBe(true);
    expect(zoneTest(defs, rich, def('development_center'), T0)!(site.x, site.z + adminZoneRadius + 1)).toBe(false);
    const farm = zoneTest(defs, rich, def('farm'), T0)!;
    expect(farm(site.x + 1, site.z)).toBe(false);
    expect(farm(site.x + residentialZoneRadius + 1, site.z)).toBe(true);
  });

  it('الورش والمخازن قرب طريق أو مبنى الحكم / workshops and stores near a road or the government building', () => {
    const store = zoneTest(defs, rich, def('materials_storage'), T0)!;
    // مجاورة مبنى الحكم تُحسب وصولًا للطريق / Bordering the government counts as road access
    expect(store(site.x + 2, site.z)).toBe(true);
    expect(store(site.x + 5, site.z + 5)).toBe(false);
  });

  it('الطريق والمباني بلا منطقة بلا اقتراح / roads and zone-less buildings get no suggestion', () => {
    expect(zoneTest(defs, rich, def('road'), T0)).toBeNull();
    expect(placementAdvice(defs, rich, def('road'), { x: site.x + 5, z: site.z }, T0)).toBeNull();
  });

  it('الموقع غير المقترح يعطي سببًا ولا يمنع البناء / an off-zone spot gives a reason without blocking the build', () => {
    const far = rich.territory.map((k) => k.split(',').map(Number)).find(([x, z]) => Math.max(Math.abs(x - site.x), Math.abs(z - site.z)) > residentialZoneRadius && tileAt(x, z).terrainId === 'plain')!;
    const tent = def('tent');
    const tile = tileAt(far[0], far[1]);
    expect(rich.territory).toContain(tileKey(tile.x, tile.z));
    expect(placementAdvice(defs, rich, tent, tile, T0)).toContain('قرب');
    expect(checkPlacement(defs, world, rich, tent, tile, T0).ok).toBe(true);
  });

  it('صفر في الإعداد يلغي اقتراح تلك المنطقة / a zero setting turns that zone off', () => {
    const off = { ...defs, world: { ...defs.world, residentialZoneRadius: 0 } };
    expect(zoneTest(off, rich, def('houses'), T0)).toBeNull();
    expect(zoneTest(off, rich, def('farm'), T0)).toBeNull();
  });
});
