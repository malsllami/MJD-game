// مسؤولية الملف: الري كمنطق نقي — شبكة قنوات على حواف المربعات تبدأ من مصدر ماء دائم (بئر القرية أو بئر مبني)، والمزرعة التي
// تمسها قناة متصلة بالمصدر مروية فتزيد سرعة إنتاجها؛ الماء لا ينفد ولا مخزون له
// File responsibility: irrigation as pure logic — a canal network on tile edges starting at a lasting water source (the village well or a
// built well), and a farm touched by a canal joined to the source is irrigated, producing faster; the water never runs out and has no stock

import { edgeCorners, isUnderConstruction, tileEdges, tileKey } from './economy';
import type { BuildingDef, GameDefinitions, GameState, PlacedBuilding } from './types';

/** القناة تُرسم على الحواف مثل الطريق / A canal is drawn on edges like a road */
export const isCanal = (def: BuildingDef | undefined): boolean => !!def && def.model === 'canal';

/** زوايا مصادر الماء: أركان مربعات بئر القرية والآبار المبنية المكتملة / Source corners: the corners of the village well's tiles and finished built wells */
export function sourceCorners(state: GameState, defs: GameDefinitions, now: number): Set<string> {
  const tiles = [...(state.springs ?? [])];
  for (const b of state.buildings) {
    if (defs.buildings.find((d) => d.id === b.buildingId)?.model === 'well' && !isUnderConstruction(b, now)) tiles.push(tileKey(b.x, b.z));
  }
  const out = new Set<string>();
  for (const k of tiles) {
    const [x, z] = k.split(',').map(Number);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) out.add(tileKey(x + dx, z + dz));
  }
  return out;
}

/**
 * حواف القنوات المتصلة بمصدر ماء (بحث عبر الزوايا)، وزوايا الشبكة التي يصلها الماء؛ includePlanned تشمل القنوات تحت الإنشاء
 * Canal edges joined to a water source (a search across corners), and the corners the water reaches; includePlanned counts canals under construction
 */
export function canalNetwork(state: GameState, defs: GameDefinitions, now: number, includePlanned = false): { edges: Set<string>; corners: Set<string> } {
  const byCorner = new Map<string, string[]>();
  for (const w of state.walls) {
    if (!isCanal(defs.buildings.find((d) => d.id === w.buildingId)) || (!includePlanned && isUnderConstruction(w, now))) continue;
    for (const [x, z] of edgeCorners(w.edge)) byCorner.set(tileKey(x, z), [...(byCorner.get(tileKey(x, z)) ?? []), w.edge]);
  }
  const corners = sourceCorners(state, defs, now);
  const edges = new Set<string>();
  const queue = [...corners];
  while (queue.length) {
    for (const edge of byCorner.get(queue.pop()!) ?? []) {
      if (edges.has(edge)) continue;
      edges.add(edge);
      for (const [x, z] of edgeCorners(edge)) {
        const k = tileKey(x, z);
        if (!corners.has(k)) {
          corners.add(k);
          queue.push(k);
        }
      }
    }
  }
  return { edges, corners };
}

/** هل المبنى مروي؟ قناة متصلة على أحد أضلاع مربعه / Is the building irrigated? A joined canal on one of its tile's sides */
export function isIrrigated(placed: { x: number; z: number }, wet: Set<string>): boolean {
  return tileEdges(placed.x, placed.z).some((e) => wet.has(e));
}

/**
 * مضاعف سرعة الري: للمزرعة المروية فقط (لا الحظيرة)، وهو مستقل عن الخصوبة التي تحدد الكمية
 * The irrigation speed factor: for an irrigated farm only (not a barn), independent of the fertility that sets the amount
 */
export function irrigationFactor(defs: GameDefinitions, placed: PlacedBuilding, def: BuildingDef | undefined, wet: Set<string>): number {
  return def?.model === 'field' && isIrrigated(placed, wet) ? defs.world.irrigationSpeedPercent / 100 : 1;
}
