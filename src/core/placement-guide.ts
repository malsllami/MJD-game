// مسؤولية الملف: توجيه البناء — المواقع المقترحة لكل مبنى حسب منطقته، وتنبيه يشرح السبب دون أن يمنع البناء
// File responsibility: placement guidance — suggested spots per building by its zone, and a note explaining why, without blocking the build

import { connectedRoads, hasRoadAccess, isFertile } from './economy';
import type { BuildingDef, GameDefinitions, GameState } from './types';

/** بعد المربع عن مبنى الحكم بعدد المربعات (الأقطار تُحسب خطوة) / Tile distance from the government building (diagonals count as one) */
function distanceToGovernment(state: GameState, x: number, z: number): number {
  return Math.max(Math.abs(x - state.settlement.x), Math.abs(z - state.settlement.z));
}

/** عدد المربعات بصيغته العربية / A tile count in its Arabic form */
function tiles(n: number, format: (n: number) => string): string {
  if (n === 1) return 'مربع واحد';
  if (n === 2) return 'مربعين';
  return n <= 10 ? `${format(n)} مربعات` : `${format(n)} مربعًا`;
}

/**
 * يبني دالة تحكم على مربع: هل هو ضمن المنطقة المقترحة للمبنى؟ وnull إن كان المبنى بلا اقتراح.
 * تُبنى مرة لكل وضع بناء حتى لا تُحسب شبكة الطرق لكل مربع
 * Builds a per-tile test: is the tile inside the building's suggested zone? null when the building has no suggestion.
 * Built once per placement so the road network is not recomputed for every tile
 */
export function zoneTest(defs: GameDefinitions, state: GameState, building: BuildingDef, now: number): ((x: number, z: number) => boolean) | null {
  const { adminZoneRadius, residentialZoneRadius, industrialRoadDistance } = defs.world;
  switch (building.zone) {
    case 'residential':
      return residentialZoneRadius > 0 ? (x, z) => distanceToGovernment(state, x, z) <= residentialZoneRadius : null;
    case 'administrative':
      return adminZoneRadius > 0 ? (x, z) => distanceToGovernment(state, x, z) <= adminZoneRadius : null;
    case 'agricultural':
      // مع الأرض الخصبة يُقترح الخصب، وإلا الأطراف خارج السكن / With fertile land the fertile tiles are suggested, else the outskirts past the homes
      if (defs.world.plainFarmPercent < 100) return (x, z) => isFertile(state, x, z);
      return residentialZoneRadius > 0 ? (x, z) => distanceToGovernment(state, x, z) > residentialZoneRadius : null;
    case 'industrial': {
      if (industrialRoadDistance <= 0) return null;
      const roads = connectedRoads(state, now, true);
      const d = industrialRoadDistance;
      return (x, z) => {
        for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) if (hasRoadAccess(state, x + dx, z + dz, roads)) return true;
        return false;
      };
    }
    default:
      return null;
  }
}

/**
 * تنبيه يشرح لماذا لا يُنصح بهذا الموقع، أو null إن كان مناسبًا أو المبنى بلا اقتراح؛ البناء يبقى مسموحًا
 * A note explaining why this spot is not advised, or null when it fits or the building has no suggestion; building stays allowed.
 * format يعرض الأرقام بنظام الواجهة / format shows numbers in the UI numbering system
 */
export function placementAdvice(
  defs: GameDefinitions, state: GameState, building: BuildingDef, tile: { x: number; z: number }, now: number, format: (n: number) => string = String,
): string | null {
  const test = zoneTest(defs, state, building, now);
  if (!test || test(tile.x, tile.z)) return null;
  const { adminZoneRadius, residentialZoneRadius, industrialRoadDistance, governmentName } = defs.world;
  const government = governmentName || 'مبنى الحكم';
  switch (building.zone) {
    case 'residential':
      return `يُنصح ببناء المساكن قرب ${government} (على بعد ${tiles(residentialZoneRadius, format)} أو أقل) لتبقى القرية متماسكة`;
    case 'administrative':
      return `يُنصح ببناء المباني الإدارية حول ${government} (على بعد ${tiles(adminZoneRadius, format)} أو أقل)`;
    case 'agricultural':
      if (defs.world.plainFarmPercent < 100) return `الأرض هنا غير خصبة فالإنتاج ${format(defs.world.plainFarmPercent)}٪ فقط؛ ابنِ على أرض خصبة قرب الماء`;
      return `يُنصح ببناء المزارع والحظائر على أطراف القرية بعد ${tiles(residentialZoneRadius, format)} من ${government} لتبقى قربه للمساكن`;
    case 'industrial':
      return `يُنصح ببناء ${building.name} على طريق أو على بعد ${tiles(industrialRoadDistance, format)} منه لتصل إليه البضائع`;
    default:
      return null;
  }
}
