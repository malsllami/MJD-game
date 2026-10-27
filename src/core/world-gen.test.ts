// اختبارات توليد العالم (المستوي والقاري) واقتراح مواقع الانطلاق / World generation (flat and continent) and start-site tests
import { describe, expect, it } from 'vitest';
import { seedDefinitions } from '../test/gas-harness';
import { suggestStartSites } from './start-sites';
import { classifyTile, edgeDistance, FLAT_EDGE_FOREST, generateWorld, sampleHeight, tileAtPoint, tileCenter } from './world-gen';

const defs = seedDefinitions();
const { world: settings, terrain } = defs;
// القارة غير مفعّلة الآن، فتُختبر بمقياسها الأصلي (أرض مسطحة بنصف قطر 20 تصل الساحل) / The continent is inactive now, so it is tested at its original scale
const continent = { ...settings, worldMode: 'continent' as const, flatZoneRadius: 20 };
const water = new Set(terrain.filter((t) => t.isWater).map((t) => t.id));

describe('generateWorld', () => {
  const world = generateWorld(settings, terrain, defs.deposits);

  it('البذرة تبدأ بعالم مستوٍ / the seed starts with a flat world', () => {
    expect(settings.worldMode).toBe('flat');
  });

  it('ينتج شبكة بالحجم المطلوب / produces the requested grid size', () => {
    expect(world.tiles).toHaveLength(settings.tilesX * settings.tilesZ);
    expect(world.heights).toHaveLength(world.vertsX * world.vertsZ);
  });

  it('نفس البذرة تعطي نفس العالم / same seed gives the same world', () => {
    const again = generateWorld(settings, terrain, defs.deposits);
    expect(again.tiles.map((t) => t.terrainId)).toEqual(world.tiles.map((t) => t.terrainId));
    expect(again.deposits).toEqual(world.deposits);
  });

  it('تحويل النقطة إلى مربع يطابق مركز المربع / point→tile round-trips with tile centre', () => {
    const c = tileCenter(world, 10, 20);
    expect(tileAtPoint(world, c.x, c.z)).toMatchObject({ x: 10, z: 20 });
    expect(Number.isFinite(sampleHeight(world, c.x, c.z))).toBe(true);
  });
});

describe('العالم المستوي / flat world', () => {
  const world = generateWorld(settings, terrain, defs.deposits);

  it('أرض واحدة مستوية بلا ماء ولا جبال / one level land with no water or mountains', () => {
    expect(new Set(world.tiles.map((t) => t.terrainId))).toEqual(new Set(['plain']));
    expect(new Set(world.heights).size).toBe(1);
  });

  it('مواقع العاصمة داخل الحدود بعيدًا عن حزام الغابة / capital sites sit inside, clear of the forest belt', () => {
    expect(world.basins).toHaveLength(settings.startSiteCount);
    for (const b of world.basins) expect(edgeDistance(settings, b.x, b.z)).toBeGreaterThan(settings.flatZoneRadius + FLAT_EDGE_FOREST);
  });

  // حزمة البداية داخل القرية: حجر وحديد وغابة صغيرة لكل موقع، داخل حدود المرحلة الأولى وخارج مجمع الحكم
  // The starter pack inside the village: stone, iron and a small forest per site, within the first-stage borders and clear of the compound
  const reach = settings.starterDepositDistance + 2;
  const nearest = (d: { x: number; z: number }) => Math.min(...world.basins.map((b) => Math.max(Math.abs(d.x - b.x), Math.abs(d.z - b.z))));

  it('لكل موقع حجر وحديد وغابة داخل القرية / every site has stone, iron and a forest inside the village', () => {
    const village = defs.stages[0].territoryRadius;
    for (const b of world.basins) {
      const pack = world.deposits.filter((d) => Math.max(Math.abs(d.x - b.x), Math.abs(d.z - b.z)) <= reach);
      expect(new Set(pack.map((d) => d.resourceId))).toEqual(new Set(['stone', 'iron', 'wood']));
      for (const d of pack) {
        for (const k of d.tiles) {
          const [x, z] = k.split(',').map(Number);
          const away = Math.max(Math.abs(x - b.x), Math.abs(z - b.z));
          expect(away).toBeLessThanOrEqual(village);
          expect(away).toBeGreaterThan(settings.governmentRadius + 1);
        }
      }
    }
  });

  it('كل أنواع المكامن موزعة خارج مواقع العاصمة / every deposit type is spread outside the capital sites', () => {
    expect(new Set(world.deposits.map((d) => d.typeId))).toEqual(new Set(defs.deposits.map((t) => t.id)));
    for (const d of world.deposits.filter((x) => x.resourceId !== 'wood' && nearest(x) > reach)) {
      for (const b of world.basins) expect(Math.max(Math.abs(d.x - b.x), Math.abs(d.z - b.z))).toBeGreaterThan(settings.flatZoneRadius);
      expect(edgeDistance(settings, d.x, d.z)).toBeGreaterThanOrEqual(FLAT_EDGE_FOREST);
    }
  });
});

describe('القارة / continent', () => {
  const world = generateWorld(continent, terrain, defs.deposits);
  const at = (x: number, z: number) => world.tiles[z * continent.tilesX + x];

  it('يوجد ماء ويابسة، والأطراف بحر / water and land exist, edges are sea', () => {
    const ids = new Set(terrain.map((t) => t.id));
    expect(world.tiles.every((t) => ids.has(t.terrainId))).toBe(true);
    expect(world.tiles.some((t) => water.has(t.terrainId))).toBe(true);
    expect(world.tiles.some((t) => !water.has(t.terrainId))).toBe(true);
    expect(water.has(world.tiles[0].terrainId)).toBe(true);
  });

  it('أحواض العواصم يابسة مسطحة على الساحل / capital basins are flat land on the coast', () => {
    expect(world.basins).toHaveLength(continent.startSiteCount);
    const r = continent.flatZoneRadius;
    for (const b of world.basins) {
      const kinds = new Set<string>();
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) kinds.add(at(b.x + dx, b.z + dz).terrainId);
      expect([...kinds].filter((k) => !water.has(k)).every((k) => continent.capitalTerrain.includes(k))).toBe(true);
      expect(kinds.has('coast')).toBe(true);
    }
  });

  it('توجد جبال وبحيرات داخلية / mountains and inland lakes exist', () => {
    expect(world.tiles.some((t) => t.terrainId === 'mountain' || t.terrainId === 'peak')).toBe(true);
    const cx = continent.tilesX / 2;
    const inland = world.tiles.filter((t) => water.has(t.terrainId) && Math.hypot(t.x - cx, t.z - continent.tilesZ / 2) < cx * 0.5);
    expect(inland.length).toBeGreaterThan(0);
  });

  it('المكامن المعدنية خارج الأحواض / ore deposits stay out of the basins', () => {
    for (const d of world.deposits.filter((x) => x.resourceId !== 'wood')) {
      for (const b of world.basins) expect(Math.max(Math.abs(d.x - b.x), Math.abs(d.z - b.z))).toBeGreaterThan(continent.flatZoneRadius);
    }
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
  const radius = defs.stages[0].territoryRadius;
  for (const [label, s] of [['مستوٍ / flat', settings], ['قاري / continent', continent]] as const) {
    const world = generateWorld(s, terrain, defs.deposits);
    const sites = suggestStartSites(world, { ...defs, world: s });

    it(`${label}: يقترح العدد المطلوب على أرض مسموحة ومتباعدة / the requested count, on allowed land, spread apart`, () => {
      expect(sites).toHaveLength(s.startSiteCount);
      for (const site of sites) expect(s.capitalTerrain).toContain(world.tiles[site.z * s.tilesX + site.x].terrainId);
      for (let i = 0; i < sites.length; i++) {
        for (let j = i + 1; j < sites.length; j++) expect(Math.hypot(sites[i].x - sites[j].x, sites[i].z - sites[j].z)).toBeGreaterThanOrEqual(radius * 2 + 2);
      }
    });

    it(`${label}: أفضل موقع يتسع لكل مباني المرحلة الأولى / the best site fits every first-stage building`, () => {
      expect(sites[0].unbuildable).toEqual([]);
    });
  }
});
