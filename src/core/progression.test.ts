// اختبارات ترقية الدولة والسوق / Nation upgrade and market tests
import { describe, expect, it } from 'vitest';
import { classicDefinitions } from '../test/gas-harness';
import { createInitialState, placeBuilding, tileKey } from './economy';
import { checkTrade, trade } from './market';
import { checkUpgrade, upgradeGovernment, upgradeRequirements } from './progression';
import { suggestStartSites } from './start-sites';
import type { GameState } from './types';
import { generateWorld } from './world-gen';

const defs = classicDefinitions();
const world = generateWorld(defs.world, defs.terrain, defs.deposits);
const site = suggestStartSites(world, defs)[0];
const T0 = 1_000_000;
const start = createInitialState(defs, world, site, T0);
const rich = (s: GameState, amount = 5000): GameState => ({ ...s, resources: Object.fromEntries(defs.resources.map((r) => [r.id, amount])) });

/** مبانٍ مكتملة على مربعات الدولة، الأقرب لمبنى الحكم أولًا (فتصلها الطريق) / Completed buildings, nearest the government first (so they reach the road) */
function withBuildings(s: GameState, ids: string[], residents?: number): GameState {
  let state = s;
  const distance = (k: string) => {
    const [x, z] = k.split(',').map(Number);
    return Math.abs(x - site.x) + Math.abs(z - site.z);
  };
  const free = state.territory.filter((k) => k !== tileKey(site.x, site.z)).sort((a, b) => distance(a) - distance(b));
  ids.forEach((id, i) => {
    const [x, z] = free[i].split(',').map(Number);
    const def = defs.buildings.find((b) => b.id === id)!;
    state = placeBuilding(state, def, world.tiles[z * defs.world.tilesX + x], T0, `${id}-${i}`);
    const last = state.buildings[state.buildings.length - 1];
    last.completesAt = T0;
    if (residents !== undefined && def.housing) last.residents = residents;
  });
  return state;
}

describe('ترقية مبنى الحكم / government upgrade', () => {
  const town = defs.stages[1];

  it('تُعرض شروط البلدة كلها وتُرفض الترقية عند النقص / every town condition is listed, and the upgrade is refused while missing', () => {
    const req = upgradeRequirements(defs, start, T0)!;
    expect(req.stage).toBe(town.name);
    expect(req.items.length).toBe(1 + town.requiredBuildings.length + Object.keys(town.upgradeCost).length);
    expect(checkUpgrade(defs, start, T0).ok).toBe(false);
  });

  it('عند اكتمال الشروط تُرقّى الدولة وتُدفع التكلفة وتتسع الحدود / with every condition met the nation upgrades, pays and widens', () => {
    const ready = { ...withBuildings(rich(start), town.requiredBuildings, 30), population: town.population };
    expect(checkUpgrade(defs, ready, T0)).toEqual({ ok: true });
    const next = upgradeGovernment(ready, defs, world);
    expect(next.stage).toBe(town.id);
    expect(next.territory.length).toBeGreaterThan(ready.territory.length);
    for (const [id, n] of Object.entries(town.upgradeCost)) expect(next.resources[id]).toBe(ready.resources[id] - n);
  });

  it('ينقص مبنى واحد فتُرفض الترقية / one missing building refuses the upgrade', () => {
    const almost = { ...withBuildings(rich(start), town.requiredBuildings.slice(1), 30), population: town.population };
    expect(checkUpgrade(defs, almost, T0).ok).toBe(false);
  });
});

describe('السوق / market', () => {
  const market = defs.world.marketBuilding;
  const price = defs.marketPrices.find((p) => p.resourceId === 'wood')!;
  // سوق عامل يحتاج تجارًا من سكنهم / An operating market needs traders from their house
  const withMarket = withBuildings(rich(start, 400), ['traders_house', market], 4);

  it('لا تجارة بلا سوق عامل / no trading without an operating market', () => {
    expect(checkTrade(rich(start), defs, 'wood', 10, 'buy', T0).ok).toBe(false);
  });

  it('الشراء والبيع بأسعار الشيت / buying and selling at sheet prices', () => {
    expect(checkTrade(withMarket, defs, 'wood', 10, 'buy', T0)).toEqual({ ok: true });
    const bought = trade(withMarket, defs, 'wood', 10, 'buy');
    expect(bought.resources.wood).toBe(withMarket.resources.wood + 10);
    expect(bought.resources.gold).toBe(withMarket.resources.gold - 10 * price.buyPrice);
    const sold = trade(withMarket, defs, 'wood', 10, 'sell');
    expect(sold.resources.gold).toBe(withMarket.resources.gold + 10 * price.sellPrice);
  });

  it('يُرفض البيع فوق المخزون والشراء فوق السعة أو الرصيد / selling beyond stock, buying beyond capacity or balance is refused', () => {
    expect(checkTrade(withMarket, defs, 'wood', 100_000, 'sell', T0).ok).toBe(false);
    expect(checkTrade(withMarket, defs, 'wood', 5000, 'buy', T0).ok).toBe(false);
    expect(checkTrade(withMarket, defs, 'wood', 0, 'buy', T0).ok).toBe(false);
    expect(checkTrade(withMarket, defs, 'water', 5, 'buy', T0).ok).toBe(false);
  });
});
