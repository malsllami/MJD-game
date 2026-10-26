// مسؤولية الملف: القوى العاملة والتخزين كمنطق نقي — سكان كل مهنة، وتوزيع العمال على مباني مهنتهم وكفاءتها، وسعة كل مورد
// File responsibility: workforce and storage as pure logic — residents per trade, assigning workers to their trade's buildings and
// the resulting efficiency, and each resource's capacity

import type { BuildingDef, GameDefinitions, PlacedBuilding } from './types';

/** سكان كل مهنة من المساكن (بأعداد صحيحة) / Residents per trade from the housing (whole numbers) */
export function residentsByProfession(buildings: PlacedBuilding[], byId: Map<string, BuildingDef>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of buildings) {
    const def = byId.get(b.buildingId);
    if (!def?.housing || !def.profession) continue;
    out[def.profession] = (out[def.profession] ?? 0) + Math.floor(b.residents ?? 0);
  }
  return out;
}

/**
 * توزيع العمال: كل مبنى عمل يأخذ من سكان مهنته بترتيب بنائه حتى حاجته؛ الكفاءة = المعيّنون ÷ المطلوبون
 * المباني التي لا تحتاج عمالًا كفاءتها 1، وغير العاملة (طريق أو مدخلات أو إنشاء) لا تأخذ عمالًا
 * Staffing: each work building takes from its trade's residents in build order, up to its need; efficiency = assigned ÷ needed.
 * Buildings needing no workers run at 1; inactive ones (road, inputs or construction) take no workers
 */
export function staffing(
  buildings: PlacedBuilding[],
  byId: Map<string, BuildingDef>,
  active: (b: PlacedBuilding) => boolean,
): Map<string, { assigned: number; needed: number; efficiency: number }> {
  const pool = residentsByProfession(buildings, byId);
  const out = new Map<string, { assigned: number; needed: number; efficiency: number }>();
  for (const b of buildings) {
    const def = byId.get(b.buildingId);
    if (!def) continue;
    const needed = def.workers > 0 && def.profession ? def.workers : 0;
    if (!needed) {
      out.set(b.uid, { assigned: 0, needed: 0, efficiency: 1 });
      continue;
    }
    if (!active(b)) {
      out.set(b.uid, { assigned: 0, needed, efficiency: 0 });
      continue;
    }
    const assigned = Math.min(needed, pool[def.profession!] ?? 0);
    pool[def.profession!] = (pool[def.profession!] ?? 0) - assigned;
    out.set(b.uid, { assigned, needed, efficiency: assigned / needed });
  }
  return out;
}

/**
 * سعة كل مورد: السعة الأساسية + سعات المخازن العاملة؛ Infinity حين لا تُحدد سعة أساسية (خادم أقدم)
 * Each resource's capacity: base capacity + operating stores; Infinity when no base capacity is set (older server)
 */
export function capacities(defs: GameDefinitions, buildings: PlacedBuilding[], byId: Map<string, BuildingDef>, active: (b: PlacedBuilding) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of defs.resources) out[r.id] = r.baseCapacity ?? Infinity;
  for (const b of buildings) {
    const def = byId.get(b.buildingId);
    if (!def || !active(b)) continue;
    for (const [id, n] of Object.entries(def.storage)) out[id] = (out[id] ?? 0) + n;
  }
  return out;
}

/**
 * إضافة إنتاج دون تجاوز السعة؛ ما فوق السعة من مخزون قديم يبقى كما هو
 * Add output without exceeding capacity; stock already above capacity is left as is
 */
export function addCapped(current: number, amount: number, capacity: number): number {
  if (current >= capacity) return current;
  return Math.min(capacity, current + amount);
}

/**
 * انتقال سكان المساكن نحو سعتها: الوافدون يملؤون المساكن بالترتيب من رصيد النمو، والمغادرون يتركون كل مسكن فوق سعته
 * Residents move toward each home's capacity: arrivals fill homes in order from the growth budget; departures leave each over-full home
 */
export function settle(buildings: PlacedBuilding[], byId: Map<string, BuildingDef>, capacityOf: (b: PlacedBuilding) => number, change: number): PlacedBuilding[] {
  let budget = change;
  return buildings.map((b) => {
    if (!byId.get(b.buildingId)?.housing) return b;
    const cap = capacityOf(b);
    const now = b.residents ?? 0;
    if (now > cap) return { ...b, residents: Math.max(cap, now - change) };
    if (now < cap && budget > 0) {
      const add = Math.min(cap - now, budget);
      budget -= add;
      return { ...b, residents: now + add };
    }
    return b;
  });
}

/**
 * حفظ أقدم بلا سكان لكل مسكن: يُوزّع عدد السكان المحفوظ على المساكن حتى سعتها
 * An older save without per-home residents: the saved population is spread over the homes up to their capacity
 */
export function seedResidents(buildings: PlacedBuilding[], byId: Map<string, BuildingDef>, population: number): PlacedBuilding[] {
  if (population <= 0 || buildings.some((b) => b.residents !== undefined)) return buildings;
  let left = population;
  return buildings.map((b) => {
    const housing = byId.get(b.buildingId)?.housing ?? 0;
    if (!housing) return b;
    const residents = Math.min(housing, left);
    left -= residents;
    return { ...b, residents };
  });
}
