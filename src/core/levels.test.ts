// اختبارات مستويات القرية: التأسيس بالمباني الابتدائية، ومجمع الحكم المحجوز، وترقية الحكم والمباني ومضاعفاتها
// Village levels tests: founding with the starting buildings, the reserved government compound, government and building upgrades and their factors
import { describe, expect, it } from 'vitest';
import { seedDefinitions } from '../test/gas-harness';
import { advance, buildingStatus, checkRoadEdge, connectedRoads, createInitialState, depositAt, edgeBetween, hasRoadAccess, isSettlementTile, rateBreakdown } from './economy';
import { governmentLevelOf, levelOf } from './levels';
import { buildingUpgradeCost, checkBuildingUpgrade, checkUpgrade, upgradeBuilding, upgradeGovernment } from './progression';
import { suggestStartSites } from './start-sites';
import type { GameState } from './types';
import { generateWorld } from './world-gen';

const defs = seedDefinitions();
const world = generateWorld(defs.world, defs.terrain, defs.deposits);
const site = suggestStartSites(world, defs)[0];
const T0 = 1_000_000;
const start = createInitialState(defs, world, site, T0);
const def = (id: string) => defs.buildings.find((b) => b.id === id)!;
const rich = (s: GameState): GameState => ({ ...s, resources: Object.fromEntries(defs.resources.map((r) => [r.id, 100_000])) });
const r = defs.world.governmentRadius;

describe('تأسيس القرية / founding the village', () => {
  it('كل المباني الابتدائية قائمة ومكتملة داخل الحدود / every starting building stands, complete, inside the borders', () => {
    expect(start.buildings.map((b) => b.buildingId).sort()).toEqual([...defs.startBuildings].sort());
    const territory = new Set(start.territory);
    for (const b of start.buildings) {
      expect(territory.has(`${b.x},${b.z}`)).toBe(true);
      expect(b.completesAt).toBe(T0);
      expect(Math.max(Math.abs(b.x - site.x), Math.abs(b.z - site.z)), b.buildingId).toBeGreaterThan(r + 1);
    }
  });

  it('منشآت المكامن على مكامنها والمساكن ممتلئة / deposit facilities sit on their deposits and homes are full', () => {
    for (const b of start.buildings) {
      const d = def(b.buildingId);
      if (d.requiresDeposit) expect(depositAt(world, start, b.x, b.z, d.requiresDeposit), d.id).toBeTruthy();
      if (d.housing) expect(b.residents).toBe(d.housing);
    }
    expect(start.population).toBe(start.buildings.reduce((n, b) => n + (b.residents ?? 0), 0));
  });

  it('كل مبنى يحتاج طريقًا يصله الطريق، والتأسيس مجاني / every road-dependent building is reached, and founding is free', () => {
    const roads = connectedRoads(start, T0);
    for (const b of start.buildings) if (def(b.buildingId).requiresRoad) expect(hasRoadAccess(start, b.x, b.z, roads), b.buildingId).toBe(true);
    for (const res of defs.resources) expect(start.resources[res.id]).toBe(res.startAmount);
  });

  it('الطريق الرئيسي يمتد من ساحة المجمع إلى حدود القرية / the main road runs from the compound forecourt to the village edge', () => {
    const edge = edgeBetween({ x: site.x, z: site.z - r }, { x: site.x, z: site.z - r - 1 });
    expect(start.roads.some((road) => road.edge === edge)).toBe(true);
    const southmost = Math.min(...start.roads.map((road) => Number(road.edge.split(',')[1])));
    expect(southmost).toBe(site.z - defs.stages[0].territoryRadius);
  });

  it('مجمع الحكم 3 × 3 محجوز ولا تُرسم طرق داخله / the 3 × 3 compound is reserved with no roads inside it', () => {
    expect(isSettlementTile(start, site.x + r, site.z - r)).toBe(true);
    expect(isSettlementTile(start, site.x + r + 1, site.z)).toBe(false);
    const inner = edgeBetween({ x: site.x, z: site.z }, { x: site.x + 1, z: site.z });
    expect(checkRoadEdge(defs, world, rich(start), def('road'), inner).ok).toBe(false);
  });

  it('القرية تعمل من البداية / the village works from the start', () => {
    const working = start.buildings.filter((b) => buildingStatus(b, start, defs, T0).kind === 'operating').length;
    expect(working).toBe(start.buildings.length);
    expect(rateBreakdown(start, defs, T0).production.food).toBeGreaterThan(0);
  });
});

describe('ترقية مبنى الحكم بالمستويات / government upgrades by level', () => {
  it('المستويات 1–5 داخل القرية، والسادس ينقل إلى البلدة / levels 1–5 stay in the village, the sixth moves into the town', () => {
    let s: GameState = { ...rich(start), population: 10_000 };
    expect(governmentLevelOf(defs, s)).toBe(1);
    for (let level = 2; level <= 5; level++) {
      const fake = { ...s, buildings: [...s.buildings, ...defs.governmentLevels[level - 1].requiredBuildings.map((id, i) => ({ uid: `r${level}${i}`, buildingId: id, x: -1, z: -1, startedAt: 0, completesAt: 0 }))] };
      expect(checkUpgrade(defs, fake, T0)).toEqual({ ok: true });
      s = upgradeGovernment(fake, defs, world);
      expect(governmentLevelOf(defs, s)).toBe(level);
      expect(s.stage).toBe('village');
    }
    const town = defs.governmentLevels[5];
    const ready = { ...s, buildings: [...s.buildings, ...town.requiredBuildings.map((id, i) => ({ uid: `t${i}`, buildingId: id, x: -1, z: -1, startedAt: 0, completesAt: 0 }))] };
    const upgraded = upgradeGovernment(ready, defs, world);
    expect(upgraded.stage).toBe(town.stage);
    // مع الغابة المحيطة لا تتسع الحدود بالترقية، بل بقطع الغابة / With the surrounding forest borders grow by clearing, not by upgrading
    expect(upgraded.territory.length).toBe(ready.territory.length);
  });

  it('حفظ أقدم بلا مستوى يُستنتج من مرحلته / an older save without a level derives it from its stage', () => {
    expect(governmentLevelOf(defs, { ...start, governmentLevel: undefined, stage: 'town' })).toBe(6);
  });
});

describe('ترقية المباني / building upgrades', () => {
  const farm = start.buildings.find((b) => b.buildingId === 'farm')!;

  it('لا تتجاوز ما يسمح به مبنى الحكم / never beyond what the government allows', () => {
    const check = checkBuildingUpgrade(defs, rich(start), farm.uid, T0);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.reason).toContain('مبنى الحكم');
  });

  it('تدفع التكلفة، ويبقى المبنى بمستواه السابق حتى تكتمل، ثم يزيد إنتاجه / pays, keeps the old level until done, then produces more', () => {
    const s = { ...rich(start), governmentLevel: 2 };
    expect(checkBuildingUpgrade(defs, s, farm.uid, T0)).toEqual({ ok: true });
    const { cost, seconds } = buildingUpgradeCost(defs, 'farm', 2);
    const up = upgradeBuilding(s, defs, farm.uid, T0);
    for (const [id, n] of Object.entries(cost)) expect(up.resources[id]).toBe(s.resources[id] - n);
    const placed = up.buildings.find((b) => b.uid === farm.uid)!;
    expect(levelOf(placed, T0)).toBe(1);
    const done = T0 + seconds * 1000 + 1;
    expect(levelOf(placed, done)).toBe(2);
    // المستوى الثاني يحتاج عمالًا أكثر، فيُعطى السكن مستواه أيضًا حتى تُقارن الطاقة الكاملة / Level 2 needs more workers, so the home is levelled too
    const full = (x: GameState) => ({ ...x, buildings: x.buildings.map((b) => (b.buildingId === 'farmers_house' ? { ...b, level: 2, residents: 20 } : b)) });
    const before = rateBreakdown(full(s), defs, done).production.food;
    const after = rateBreakdown(full(up), defs, done).production.food;
    expect(after / before).toBeCloseTo(defs.buildingLevels[1].productionFactor, 5);
    expect(checkBuildingUpgrade(defs, up, farm.uid, T0 + 1).ok).toBe(false);
  });

  it('السكن الأعلى مستوى يتسع لسكان أكثر / a higher-level home houses more residents', () => {
    const home = start.buildings.find((b) => b.buildingId === 'farmers_house')!;
    const s = { ...start, buildings: start.buildings.map((b) => (b.uid === home.uid ? { ...b, level: 2 } : b)) };
    const later = advance(s, defs, world, T0 + 30 * 60_000);
    expect(later.buildings.find((b) => b.uid === home.uid)!.residents).toBe(Math.floor(def('farmers_house').housing * defs.buildingLevels[1].populationFactor));
  });
});
