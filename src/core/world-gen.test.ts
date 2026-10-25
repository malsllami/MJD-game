// اختبارات توليد العالم واقتراح مواقع الانطلاق / World generation and start-site tests
import { describe, expect, it } from 'vitest';
import { seedDefinitions } from '../test/gas-harness';
import { suggestStartSites } from './start-sites';
import { classifyTile, generateWorld, sampleHeight, tileAtPoint, tileCenter } from './world-gen';

const defs = seedDefinitions();
const { world: settings, terrain } = defs;

describe('generateWorld', () => {
  const world = generateWorld(settings, terrain);
  const isWater = (id: string) => terrain.find((t) => t.id === id)!.isWater;

  it('ينتج شبكة بالحجم المطلوب / produces the requested grid size', () => {
    expect(world.tiles).toHaveLength(settings.tilesX * settings.tilesZ);
    expect(world.heights).toHaveLength(world.vertsX * world.vertsZ);
  });

  it('نفس البذرة تعطي نفس العالم / same seed gives the same world', () => {
    const again = generateWorld(settings, terrain);
    expect(again.tiles.map((t) => t.terrainId)).toEqual(world.tiles.map((t) => t.terrainId));
  });

  it('كل مربع مصنّف بنوع معرّف، ويوجد ماء ويابسة، والأطراف بحر / known types, water and land exist, edges are sea', () => {
    const ids = new Set(terrain.map((t) => t.id));
    expect(world.tiles.every((t) => ids.has(t.terrainId))).toBe(true);
    expect(world.tiles.some((t) => isWater(t.terrainId))).toBe(true);
    expect(world.tiles.some((t) => !isWater(t.terrainId))).toBe(true);
    expect(isWater(world.tiles[0].terrainId)).toBe(true);
  });

  it('تحويل النقطة إلى مربع يطابق مركز المربع / point→tile round-trips with tile centre', () => {
    const c = tileCenter(world, 10, 20);
    expect(tileAtPoint(world, c.x, c.z)).toMatchObject({ x: 10, z: 20 });
    expect(Number.isFinite(sampleHeight(world, c.x, c.z))).toBe(true);
  });
});

describe('classifyTile', () => {
  const sorted = [...terrain].sort((a, b) => a.priority - b.priority);
  it('الساحل يتطلب ماءً مجاورًا / coast requires a water neighbour', () => {
    expect(classifyTile(0.45, 0.8, true, sorted)).toBe('coast');
    expect(classifyTile(0.45, 0.8, false, sorted)).toBe('plain');
    expect(classifyTile(0.45, 0.1, false, sorted)).toBe('desert');
  });
});

describe('suggestStartSites', () => {
  const world = generateWorld(settings, terrain);
  const sites = suggestStartSites(world, defs);
  const radius = defs.stages[0].territoryRadius;

  it('يقترح العدد المطلوب على أرض مسموحة / suggests the requested count on allowed land', () => {
    expect(sites).toHaveLength(settings.startSiteCount);
    for (const s of sites) expect(settings.capitalTerrain).toContain(world.tiles[s.z * settings.tilesX + s.x].terrainId);
  });

  it('المواقع متباعدة / sites are spread apart', () => {
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        expect(Math.hypot(sites[i].x - sites[j].x, sites[i].z - sites[j].z)).toBeGreaterThanOrEqual(radius * 2 + 2);
      }
    }
  });

  it('أفضل موقع يتسع لكل مباني المرحلة الأولى / the best site fits every first-stage building', () => {
    expect(sites[0].unbuildable).toEqual([]);
  });
});
