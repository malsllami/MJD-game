// مسؤولية الملف: اقتراح مواقع انطلاق الدولة — الأحواض المسطحة التي يولّدها العالم، ولكل موقع وصف لأرضه والمكامن القريبة منه
// File responsibility: suggests nation start sites — the flat basins the world generates, each describing its land and nearby deposits

import { landAround } from './economy';
import type { GameDefinitions, World } from './types';

/** موقع مقترح / Suggested site */
export interface StartSite {
  x: number;
  z: number;
  /** عدد مربعات كل نوع أرض داخل حدود المرحلة الأولى / Tiles per terrain inside the first-stage territory */
  terrainCounts: Record<string, number>;
  /** مبانٍ من المرحلة الأولى لا تجد أرضها في هذا الموقع / First-stage buildings with no suitable land here */
  unbuildable: string[];
  /** أنواع المكامن الظاهرة من هذا الموقع منذ البداية / Deposit types visible from this site at the start */
  nearbyDeposits: string[];
}

/**
 * المواقع المقترحة: الأحواض المسطحة إن وُجدت، وإلا أفضل المواقع حسب تنوع الأرض (عوالم أقدم بلا أحواض)
 * Suggested sites: the flat basins when present, otherwise the best-scored sites by land variety (older worlds without basins)
 */
export function suggestStartSites(world: World, defs: GameDefinitions): StartSite[] {
  const centres = world.basins.length ? world.basins : bestByVariety(world, defs);
  return centres.slice(0, defs.world.startSiteCount).map((c) => describeSite(world, defs, c.x, c.z));
}

/** وصف موقع: أرضه، وما لا يجد أرضه من مباني المرحلة الأولى، والمكامن القريبة / Describe a site: land, unbuildable first-stage buildings, nearby deposits */
function describeSite(world: World, defs: GameDefinitions, x: number, z: number): StartSite {
  const radius = defs.stages[0].territoryRadius;
  const terrainCounts: Record<string, number> = {};
  for (const key of landAround(defs, world, x, z, radius)) {
    const [tx, tz] = key.split(',').map(Number);
    const id = world.tiles[tz * defs.world.tilesX + tx].terrainId;
    terrainCounts[id] = (terrainCounts[id] ?? 0) + 1;
  }
  // المباني المرتبطة بمكمن تُقيَّم بالمكامن لا بالأرض / Deposit buildings are judged by deposits, not land
  const firstStage = defs.buildings.filter((b) => b.stage === defs.stages[0].id && !b.requiresDeposit);
  const unbuildable = firstStage.filter((b) => !b.allowedTerrain.some((id) => terrainCounts[id])).map((b) => b.id);
  const reach = radius + defs.world.discoveryRadius;
  const nearbyDeposits = [...new Set(world.deposits
    .filter((d) => Math.max(Math.abs(d.x - x), Math.abs(d.z - z)) <= reach)
    .map((d) => d.typeId))];
  return { x, z, terrainCounts, unbuildable, nearbyDeposits };
}

/** للعوالم بلا أحواض: أفضل المواقع المتباعدة حسب تنوع الأرض / For worlds without basins: best spaced sites by land variety */
function bestByVariety(world: World, defs: GameDefinitions): { x: number; z: number }[] {
  const { tilesX, tilesZ, capitalTerrain, startSiteCount } = defs.world;
  const radius = defs.stages[0].territoryRadius;
  const margin = radius + 1;
  const scored: { x: number; z: number; score: number }[] = [];
  for (const t of world.tiles) {
    if (!capitalTerrain.includes(t.terrainId)) continue;
    if (t.x < margin || t.z < margin || t.x >= tilesX - margin || t.z >= tilesZ - margin) continue;
    const site = describeSite(world, defs, t.x, t.z);
    const land = Object.values(site.terrainCounts).reduce((a, b) => a + b, 0);
    scored.push({ x: t.x, z: t.z, score: land + Object.keys(site.terrainCounts).length * 6 - site.unbuildable.length * 25 });
  }
  scored.sort((a, b) => b.score - a.score);
  const minDistance = Math.max(radius * 2 + 2, Math.min(tilesX, tilesZ) / 4);
  const picked: { x: number; z: number }[] = [];
  for (const c of scored) {
    if (picked.length >= startSiteCount) break;
    if (picked.every((p) => Math.hypot(p.x - c.x, p.z - c.z) >= minDistance)) picked.push(c);
  }
  return picked;
}
