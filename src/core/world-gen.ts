// مسؤولية الملف: توليد العالم (ارتفاعات التضاريس + شبكة المربعات) كمنطق نقي قابل للاختبار
// File responsibility: pure, testable world generation (terrain heights and tile grid)

import { createNoise } from './noise';
import type { TerrainType, Tile, World, WorldSettings } from './types';

/**
 * يولّد العالم كاملًا من الإعدادات وتعريفات التضاريس
 * Generates the full world from settings and terrain definitions
 */
export function generateWorld(settings: WorldSettings, terrain: TerrainType[]): World {
  const { tilesX, tilesZ, vertsPerTile } = settings;
  const elevationNoise = createNoise(settings.seed);
  const moistureNoise = createNoise(settings.seed + 7919, 4);

  // الارتفاع الخام عند أي نقطة بوحدات المربعات، مع انحدار نحو الأطراف ليحيط البحر باليابسة
  // Raw elevation at a point in tile units, falling off toward the edges so sea surrounds land
  const rawElevation = (tx: number, tz: number): number => {
    const nx = tx / tilesX - 0.5;
    const nz = tz / tilesZ - 0.5;
    const d2 = (nx * nx + nz * nz) * 4;
    return elevationNoise(tx * settings.noiseScale, tz * settings.noiseScale) - d2 * settings.islandFalloff;
  };

  const vertsX = tilesX * vertsPerTile + 1;
  const vertsZ = tilesZ * vertsPerTile + 1;
  const vertexElevation = new Float32Array(vertsX * vertsZ);
  let min = Infinity;
  let max = -Infinity;
  for (let iz = 0; iz < vertsZ; iz++) {
    for (let ix = 0; ix < vertsX; ix++) {
      const e = rawElevation(ix / vertsPerTile, iz / vertsPerTile);
      vertexElevation[iz * vertsX + ix] = e;
      if (e < min) min = e;
      if (e > max) max = e;
    }
  }
  // تطبيع الارتفاع إلى 0..1 حتى تبقى حدود التضاريس في التعريفات ثابتة المعنى
  // Normalise elevation to 0..1 so terrain thresholds in the definitions keep a stable meaning
  const range = max - min || 1;
  const normalise = (e: number): number => Math.min(1, Math.max(0, (e - min) / range));

  const heights = new Float32Array(vertsX * vertsZ);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = elevationToHeight(normalise(vertexElevation[i]), settings);
  }

  const elevations = new Float32Array(tilesX * tilesZ);
  const moistures = new Float32Array(tilesX * tilesZ);
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      elevations[z * tilesX + x] = normalise(rawElevation(x + 0.5, z + 0.5));
      moistures[z * tilesX + x] = moistureNoise((x + 0.5) * settings.moistureScale, (z + 0.5) * settings.moistureScale);
    }
  }
  normaliseInPlace(moistures);

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

  return { settings, vertsX, vertsZ, heights, tiles };
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
