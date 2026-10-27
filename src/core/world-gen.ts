// مسؤولية الملف: توليد العالم كمنطق نقي قابل للاختبار — إما أرض مستوية متصلة تحيط بها الغابات، أو قارة بأحواض مسطحة
// للعاصمة وسلاسل جبلية وبحيرات؛ مع مكامن موارد موزعة في الحالتين
// File responsibility: pure, testable world generation — either connected flat land ringed by forest, or a continent with
// flat capital basins, mountain ranges and lakes; with scattered resource deposits in both

import { createNoise } from './noise';
import type { Deposit, DepositType, TerrainType, Tile, World, WorldSettings } from './types';

/** ارتفاع السهول المنبسطة على مقياس 0..1 / Flat plain elevation on the 0..1 scale */
const PLAIN_LEVEL = 0.48;
/** رطوبة العالم المستوي: سهل أخضر / Flat-world moisture: a green plain */
const FLAT_MOISTURE = 0.75;
/** عرض حزام الغابة على أطراف العالم المستوي بعدد المربعات / Width of the forest belt on the flat world's edges, in tiles */
export const FLAT_EDGE_FOREST = 6;

/** بعد المربع عن أقرب طرف للعالم / A tile's distance to the nearest world edge */
export function edgeDistance(settings: WorldSettings, x: number, z: number): number {
  return Math.min(x, z, settings.tilesX - 1 - x, settings.tilesZ - 1 - z);
}

interface Feature {
  x: number;
  z: number;
  radius: number;
  angle: number;
}

/** أرقام عشوائية ثابتة من بذرة / Deterministic random numbers from a seed */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * يولّد العالم كاملًا من الإعدادات وتعريفات التضاريس وأنواع المكامن
 * Generates the full world from settings, terrain definitions and deposit types
 */
export function generateWorld(settings: WorldSettings, terrain: TerrainType[], depositTypes: DepositType[] = []): World {
  const { tilesX, tilesZ, vertsPerTile } = settings;
  const rng = seededRandom(settings.seed);
  const base = createNoise(settings.seed);
  const coastNoise = createNoise(settings.seed + 3, 3);
  const ridge = createNoise(settings.seed + 13, 4);
  const moistureNoise = createNoise(settings.seed + 7919, 4);
  const ns = settings.noiseScale;

  /** بعد النقطة عن مركز الخريطة مع تعرج الساحل (0 المركز، 1 منتصف الحافة) / Distance from the map centre with a ragged coast */
  const coastDistance = (tx: number, tz: number): number => {
    const nx = tx / tilesX - 0.5;
    const nz = tz / tilesZ - 0.5;
    return Math.sqrt(nx * nx + nz * nz) * 2 + (coastNoise(tx * 0.03, tz * 0.03) - 0.5) * 0.3;
  };
  const onContinent = (x: number, z: number, limit: number): boolean => coastDistance(x, z) < limit;
  const flatWorld = settings.worldMode === 'flat';
  const inside = (margin: number) => (x: number, z: number): boolean => edgeDistance(settings, x, z) >= margin;

  // 1) مواقع العاصمة المسطحة (قرب الساحل في القارة)، ثم السلاسل والبحيرات بعيدًا عنها
  // 1) Flat capital sites (near the coast on a continent), then ranges and lakes kept away from them
  const flat = settings.flatZoneRadius;
  const nearCoast = (x: number, z: number): boolean => coastDistance(x, z) > 0.5 && coastDistance(x, z) < 0.6;
  const basins = place(rng, settings.startSiteCount, flat > 0 ? flat : 0, [], tilesX, tilesZ, flatWorld ? inside(flat + FLAT_EDGE_FOREST + 2) : nearCoast, flat * 2 + 4);
  const keepOut = basins.map((b) => ({ ...b, radius: flat + 6 }));
  // العالم المستوي بلا جبال: مواقع المعادن نتوءات صخرية صغيرة على السهل / A flat world has no ranges: ore sites are small rock outcrops on the plain
  const oreCount = depositTypes.filter((t) => t.place === 'mountain').reduce((n, t) => n + t.count, 0);
  const massifs = flatWorld
    ? place(rng, oreCount, 3, keepOut, tilesX, tilesZ, inside(FLAT_EDGE_FOREST + 3), 14)
    : place(rng, settings.massifCount, settings.massifRadius, keepOut, tilesX, tilesZ, (x, z) => onContinent(x, z, 0.72), settings.massifRadius * 1.4);
  const lakes = flatWorld ? [] : place(rng, settings.lakeCount, settings.lakeRadius, [...keepOut, ...massifs], tilesX, tilesZ, (x, z) => onContinent(x, z, 0.62), settings.lakeRadius * 2);

  /**
   * الارتفاع على مقياس 0..1 (حدود التضاريس في الشيت على نفس المقياس)
   * Elevation on the 0..1 scale (terrain thresholds in the sheet use the same scale)
   */
  const elevationAt = (tx: number, tz: number): number => {
    if (flatWorld) return PLAIN_LEVEL + 0.02;
    let e = PLAIN_LEVEL + (base(tx * ns, tz * ns) - 0.5) * 0.24;
    e -= smoothstep(1 - settings.islandFalloff * 1.7, 1, coastDistance(tx, tz)) * 0.42;
    for (const m of massifs) {
      // سلسلة ممتدة: بعد بيضاوي مائل، وقمم متعرجة من ضوضاء حادة / An elongated range: tilted ellipse, ragged ridged peaks
      const dx = tx - m.x;
      const dz = tz - m.z;
      const u = dx * Math.cos(m.angle) + dz * Math.sin(m.angle);
      const v = -dx * Math.sin(m.angle) + dz * Math.cos(m.angle);
      const q = Math.sqrt((u / 1.8) ** 2 + v * v) / m.radius;
      if (q >= 1) continue;
      const ridged = 1 - Math.abs(2 * ridge(tx * 0.09, tz * 0.09) - 1);
      e += Math.pow(1 - q, 1.4) * (0.3 + 0.26 * ridged);
    }
    for (const l of lakes) {
      const q = Math.hypot(tx - l.x, tz - l.z) / (l.radius * (0.85 + coastNoise(tx * 0.1, tz * 0.1) * 0.3));
      if (q < 1) e -= (1 - q * q) * 0.16;
    }
    for (const b of basins) {
      // المنطقة المسطحة: سهل مستوٍ تمامًا يتدرج إلى ما حوله / The flat zone: a level plain blending into its surroundings
      const box = Math.max(Math.abs(tx - b.x), Math.abs(tz - b.z));
      // يبقى البحر على الجانب الخارجي من الحوض / The sea stays on the basin's outer side
      const mask = (1 - smoothstep(flat, flat + 4, box)) * (1 - smoothstep(0.66, 0.78, coastDistance(tx, tz)));
      if (mask > 0) e = e * (1 - mask) + (PLAIN_LEVEL + 0.02) * mask;
    }
    return Math.min(1, Math.max(0, e));
  };

  const vertsX = tilesX * vertsPerTile + 1;
  const vertsZ = tilesZ * vertsPerTile + 1;
  const heights = new Float32Array(vertsX * vertsZ);
  for (let iz = 0; iz < vertsZ; iz++) {
    for (let ix = 0; ix < vertsX; ix++) heights[iz * vertsX + ix] = elevationToHeight(elevationAt(ix / vertsPerTile, iz / vertsPerTile), settings);
  }

  const elevations = new Float32Array(tilesX * tilesZ);
  const moistures = new Float32Array(tilesX * tilesZ);
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      elevations[z * tilesX + x] = elevationAt(x + 0.5, z + 0.5);
      moistures[z * tilesX + x] = flatWorld ? FLAT_MOISTURE : moistureNoise((x + 0.5) * settings.moistureScale, (z + 0.5) * settings.moistureScale);
    }
  }
  if (!flatWorld) normaliseInPlace(moistures);
  // الأحواض سهول خضراء لا صحراء / Basins are green plains, not desert
  for (const b of basins) {
    for (let z = Math.max(0, b.z - flat); z <= Math.min(tilesZ - 1, b.z + flat); z++) {
      for (let x = Math.max(0, b.x - flat); x <= Math.min(tilesX - 1, b.x + flat); x++) moistures[z * tilesX + x] = Math.max(moistures[z * tilesX + x], 0.7);
    }
  }

  const sorted = [...terrain].sort((a, b) => a.priority - b.priority);
  const isWaterAt = (x: number, z: number): boolean =>
    x >= 0 && z >= 0 && x < tilesX && z < tilesZ && elevations[z * tilesX + x] < settings.seaLevel;

  const tiles: Tile[] = [];
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      const elevation = elevations[z * tilesX + x];
      const moisture = moistures[z * tilesX + x];
      const hasWaterNeighbor =
        isWaterAt(x + 1, z) || isWaterAt(x - 1, z) || isWaterAt(x, z + 1) || isWaterAt(x, z - 1);
      tiles.push({ x, z, elevation, moisture, terrainId: classifyTile(elevation, moisture, hasWaterNeighbor, sorted) });
    }
  }

  const deposits = placeDeposits(rng, depositTypes, terrain, tiles, settings, basins, massifs, flatWorld);
  return { settings, vertsX, vertsZ, heights, tiles, basins: basins.map(({ x, z }) => ({ x, z })), deposits };
}

/**
 * وضع عدد من المعالم متباعدة، بعيدًا عن المناطق المحجوزة وداخل اليابسة
 * Places features spaced apart, away from reserved areas and on land
 */
function place(
  rng: () => number, count: number, radius: number, avoid: Feature[] | { x: number; z: number; radius: number }[],
  tilesX: number, tilesZ: number, allowed: (x: number, z: number) => boolean, spacing: number,
): Feature[] {
  const out: Feature[] = [];
  for (let tries = 0; out.length < count && tries < count * 600; tries++) {
    const x = Math.round(radius + 2 + rng() * (tilesX - 2 * radius - 4));
    const z = Math.round(radius + 2 + rng() * (tilesZ - 2 * radius - 4));
    if (!allowed(x, z)) continue;
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.radius + radius)) continue;
    if (out.some((f) => Math.hypot(f.x - x, f.z - z) < spacing)) continue;
    out.push({ x, z, radius, angle: rng() * Math.PI });
  }
  return out;
}

/**
 * توزيع المكامن: معدن لكل سلسلة جبلية (والسلسلة الأقرب لكل حوض محجر إن وُجد)، غابة قرب كل حوض ثم في أماكن متفرقة، ونفط في الصحاري
 * Deposits: one ore per range (the range nearest each basin is a quarry when available), a forest beside each basin then scattered, oil in deserts
 */
function placeDeposits(
  rng: () => number, types: DepositType[], terrain: TerrainType[], tiles: Tile[], s: WorldSettings,
  basins: Feature[], massifs: Feature[], flatWorld: boolean,
): Deposit[] {
  const water = new Set(terrain.filter((t) => t.isWater).map((t) => t.id));
  const tileAt = (x: number, z: number) => (x >= 0 && z >= 0 && x < s.tilesX && z < s.tilesZ ? tiles[z * s.tilesX + x] : undefined);
  const disc = (cx: number, cz: number, r: number, ok: (t: Tile) => boolean): string[] => {
    const out: string[] = [];
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const t = tileAt(x, z);
        if (t && Math.hypot(x - cx, z - cz) <= r && ok(t)) out.push(`${x},${z}`);
      }
    }
    return out;
  };
  const inBasin = (x: number, z: number) => basins.some((b) => Math.max(Math.abs(x - b.x), Math.abs(z - b.z)) <= s.flatZoneRadius + 1);
  const deposits: Deposit[] = [];
  const add = (type: DepositType, x: number, z: number, keys: string[]) => {
    if (keys.length) deposits.push({ id: `${type.id}-${deposits.filter((d) => d.typeId === type.id).length + 1}`, typeId: type.id, resourceId: type.resourceId, x, z, tiles: keys });
  };

  // حزمة البداية في العالم المستوي: محجر ومكمن حديد وغابة حول كل موقع عاصمة؛ داخل القرية صغيرة متفرقة إن حُدد بعدها،
  // وإلا خلف حدودها مباشرة (خادم أقدم)
  // The flat world's starter pack: a quarry, an iron deposit and a forest around each capital site; small and spread inside the
  // village when its distance is set, otherwise just past the village edge (older server)
  const starter = (resourceId: string) => types.find((t) => t.resourceId === resourceId);
  if (flatWorld) {
    const inside = s.starterDepositDistance > 0;
    for (const b of basins) {
      // داخل القرية تبتعد عن الطريق الرئيسي الخارج من ساحة مبنى الحكم نحو ‎-z / Inside the village they keep off the main road leaving toward -z
      const a0 = inside ? -Math.PI / 2 + 1.1 + (rng() - 0.5) * 0.3 : rng() * Math.PI * 2;
      const pack: [DepositType | undefined, number, number][] = inside
        ? [[starter('stone'), 0, 1.1], [starter('iron'), 2.05, 1.1], [starter('wood'), 4.1, 1.5]]
        : [[starter('stone'), 0, 1.6], [starter('iron'), 2.1, 1.6], [starter('wood'), 4.2, 3.5]];
      for (const [type, turn, r] of pack) {
        if (!type) continue;
        const dist = inside ? s.starterDepositDistance + 0.4 : s.flatZoneRadius + 2 + r;
        const x = Math.round(b.x + Math.cos(a0 + turn) * dist);
        const z = Math.round(b.z + Math.sin(a0 + turn) * dist);
        add(type, x, z, disc(x, z, r, (t) => !water.has(t.terrainId)));
      }
    }
  }

  // المعادن على السلاسل الجبلية (أو مواقع المعادن في العالم المستوي) / Ores on the mountain ranges (or the flat world's ore sites)
  const ores: DepositType[] = types.filter((t) => t.place === 'mountain').flatMap((t) => Array.from({ length: t.count }, () => t));
  const free = [...massifs];
  const stone = ores.find((t) => t.resourceId === 'stone');
  for (const b of flatWorld ? [] : basins) {
    if (!stone || !free.length || !ores.includes(stone)) break;
    free.sort((m1, m2) => Math.hypot(m1.x - b.x, m1.z - b.z) - Math.hypot(m2.x - b.x, m2.z - b.z));
    const m = free.shift()!;
    ores.splice(ores.indexOf(stone), 1);
    add(stone, m.x, m.z, disc(m.x, m.z, m.radius * 0.7, (t) => !water.has(t.terrainId)));
  }
  for (let i = ores.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ores[i], ores[j]] = [ores[j], ores[i]];
  }
  for (const m of free) {
    const type = ores.shift();
    if (!type) break;
    add(type, m.x, m.z, disc(m.x, m.z, m.radius * 0.7, (t) => !water.has(t.terrainId)));
  }

  // الغابات: واحدة بجوار كل حوض، والبقية متفرقة على السهول / Forests: one beside each basin, the rest scattered on plains
  for (const type of types.filter((t) => t.place === 'forest')) {
    let left = type.count;
    const land = (t: Tile) => !water.has(t.terrainId) && !inBasin(t.x, t.z);
    for (const b of flatWorld ? [] : basins) {
      if (!left) break;
      const a = rng() * Math.PI * 2;
      const fx = Math.round(b.x + Math.cos(a) * (s.flatZoneRadius + 6));
      const fz = Math.round(b.z + Math.sin(a) * (s.flatZoneRadius + 6));
      add(type, fx, fz, disc(fx, fz, 5, land));
      left--;
    }
    const plains = tiles.filter((t) => t.terrainId === 'plain' && land(t) && (!flatWorld || edgeDistance(s, t.x, t.z) >= FLAT_EDGE_FOREST + 3));
    for (let tries = 0; left > 0 && plains.length && tries < 400; tries++) {
      const t = plains[Math.floor(rng() * plains.length)];
      if (deposits.some((d) => Math.hypot(d.x - t.x, d.z - t.z) < 14)) continue;
      add(type, t.x, t.z, disc(t.x, t.z, 5, land));
      left--;
    }
  }

  // النفط في الصحاري بعيدًا عن الأحواض؛ والعالم المستوي بلا صحارى فيكون على السهل / Oil in deserts away from basins; on the plain in a flat world
  const sandy = (t: Tile) => (flatWorld ? !water.has(t.terrainId) && edgeDistance(s, t.x, t.z) >= FLAT_EDGE_FOREST + 3 : t.terrainId === 'desert');
  for (const type of types.filter((t) => t.place === 'desert')) {
    const sands = tiles.filter((t) => sandy(t) && !inBasin(t.x, t.z));
    let left = type.count;
    for (let tries = 0; left > 0 && sands.length && tries < 400; tries++) {
      const t = sands[Math.floor(rng() * sands.length)];
      if (deposits.some((d) => Math.hypot(d.x - t.x, d.z - t.z) < 14)) continue;
      add(type, t.x, t.z, disc(t.x, t.z, flatWorld ? 2 : 3, sandy));
      left--;
    }
  }
  return deposits;
}

/**
 * يحوّل الارتفاع المطبَّع إلى ارتفاع بوحدات العالم (سالب تحت سطح البحر)
 * Converts normalised elevation to world-unit height (negative below sea level)
 */
export function elevationToHeight(e: number, s: WorldSettings): number {
  if (e >= s.seaLevel) return Math.pow((e - s.seaLevel) / (1 - s.seaLevel), 1.6) * s.heightScale;
  return -((s.seaLevel - e) / s.seaLevel) * s.depthScale;
}

/**
 * يختار نوع التضاريس الأول المطابق حسب الأولوية
 * Picks the first matching terrain type by priority
 */
export function classifyTile(e: number, m: number, hasWaterNeighbor: boolean, sorted: TerrainType[]): string {
  for (const t of sorted) {
    if (t.requiresWaterNeighbor && !hasWaterNeighbor) continue;
    if (inRange(e, t.minElevation, t.maxElevation) && inRange(m, t.minMoisture, t.maxMoisture)) return t.id;
  }
  return sorted[sorted.length - 1].id;
}

/** تحقق من وقوع القيمة في المدى، مع شمول الحد الأعلى عند 1 / Range check, inclusive at an upper bound of 1 */
function inRange(v: number, min: number, max: number): boolean {
  return v >= min && (v < max || (max >= 1 && v <= 1));
}

/** تطبيع مصفوفة إلى 0..1 / Normalise an array to 0..1 */
function normaliseInPlace(values: Float32Array): void {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < values.length; i++) values[i] = (values[i] - min) / range;
}

/** نصف عرض وعمق العالم بوحدات العالم / World half extents in world units */
export function worldHalfExtents(world: World): { halfX: number; halfZ: number } {
  const { tilesX, tilesZ, tileSize } = world.settings;
  return { halfX: (tilesX * tileSize) / 2, halfZ: (tilesZ * tileSize) / 2 };
}

/**
 * يقرأ ارتفاع التضاريس عند أي نقطة (استيفاء ثنائي الخطية)
 * Samples terrain height at any world point (bilinear interpolation)
 */
export function sampleHeight(world: World, wx: number, wz: number): number {
  const { tileSize, vertsPerTile } = world.settings;
  const { halfX, halfZ } = worldHalfExtents(world);
  const gx = Math.min(world.vertsX - 1.001, Math.max(0, ((wx + halfX) / tileSize) * vertsPerTile));
  const gz = Math.min(world.vertsZ - 1.001, Math.max(0, ((wz + halfZ) / tileSize) * vertsPerTile));
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const h = (x: number, z: number): number => world.heights[z * world.vertsX + x];
  const top = h(ix, iz) * (1 - fx) + h(ix + 1, iz) * fx;
  const bottom = h(ix, iz + 1) * (1 - fx) + h(ix + 1, iz + 1) * fx;
  return top * (1 - fz) + bottom * fz;
}

/** يعيد المربع الواقع تحت نقطة في العالم / Returns the tile under a world point */
export function tileAtPoint(world: World, wx: number, wz: number): Tile | null {
  const { tilesX, tilesZ, tileSize } = world.settings;
  const { halfX, halfZ } = worldHalfExtents(world);
  const x = Math.floor((wx + halfX) / tileSize);
  const z = Math.floor((wz + halfZ) / tileSize);
  if (x < 0 || z < 0 || x >= tilesX || z >= tilesZ) return null;
  return world.tiles[z * tilesX + x];
}

/** مركز المربع بوحدات العالم / Tile centre in world units */
export function tileCenter(world: World, x: number, z: number): { x: number; z: number } {
  const { tileSize } = world.settings;
  const { halfX, halfZ } = worldHalfExtents(world);
  return { x: (x + 0.5) * tileSize - halfX, z: (z + 0.5) * tileSize - halfZ };
}
