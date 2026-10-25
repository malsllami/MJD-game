// مسؤولية الملف: اقتراح مواقع انطلاق الدولة — متباعدة، ولكل موقع وصف لأرضه وما ينقصه لمباني المرحلة الأولى
// File responsibility: suggests nation start sites — spread apart, each describing its land and what first-stage buildings it lacks

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
}

/**
 * يختار أفضل المواقع: يفضّل تنوع الأرض وتوفر أرض كل مباني المرحلة الأولى، مع مسافة دنيا بين المواقع
 * Picks the best sites: favours varied land and land for every first-stage building, with a minimum spacing
 */
export function suggestStartSites(world: World, defs: GameDefinitions): StartSite[] {
  const { tilesX, tilesZ, capitalTerrain, startSiteCount } = defs.world;
  const radius = defs.stages[0].territoryRadius;
  const firstStage = defs.buildings.filter((b) => b.stage === defs.stages[0].id);
  const margin = radius + 1;

  const candidates: (StartSite & { score: number })[] = [];
  for (const t of world.tiles) {
    if (!capitalTerrain.includes(t.terrainId)) continue;
    if (t.x < margin || t.z < margin || t.x >= tilesX - margin || t.z >= tilesZ - margin) continue;
    const terrainCounts: Record<string, number> = {};
    for (const key of landAround(defs, world, t.x, t.z, radius)) {
      const [x, z] = key.split(',').map(Number);
      const id = world.tiles[z * tilesX + x].terrainId;
      terrainCounts[id] = (terrainCounts[id] ?? 0) + 1;
    }
    const unbuildable = firstStage.filter((b) => !b.allowedTerrain.some((id) => terrainCounts[id])).map((b) => b.id);
    const land = Object.values(terrainCounts).reduce((a, b) => a + b, 0);
    const kinds = Object.keys(terrainCounts).length;
    candidates.push({ x: t.x, z: t.z, terrainCounts, unbuildable, score: land + kinds * 6 - unbuildable.length * 25 });
  }

  candidates.sort((a, b) => b.score - a.score);
  const minDistance = Math.max(radius * 2 + 2, Math.min(tilesX, tilesZ) / 4);
  const picked: StartSite[] = [];
  for (const c of candidates) {
    if (picked.length >= startSiteCount) break;
    if (picked.every((p) => (p.x - c.x) ** 2 + (p.z - c.z) ** 2 >= minDistance ** 2)) {
      picked.push({ x: c.x, z: c.z, terrainCounts: c.terrainCounts, unbuildable: c.unbuildable });
    }
  }
  return picked;
}
