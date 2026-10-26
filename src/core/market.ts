// مسؤولية الملف: السوق كمنطق نقي — بيع الموارد وشراؤها بالذهب من تجار يديرهم الحاسب بأسعار الشيت
// File responsibility: the market as pure logic — buying and selling resources for gold with computer traders at sheet prices

import { buildingStatus, capacityAt, type Check } from './economy';
import type { GameDefinitions, GameState } from './types';

/** عملة السوق / The market currency */
export const CURRENCY = 'gold';

/** صفقة: شراء أو بيع / A trade: buy or sell */
export type Side = 'buy' | 'sell';

/** هل في الدولة سوق عامل؟ / Does the nation have an operating market? */
export function hasMarket(state: GameState, defs: GameDefinitions, now: number): boolean {
  const market = defs.world.marketBuilding;
  return !!market && state.buildings.some((b) => b.buildingId === market && buildingStatus(b, state, defs, now).kind === 'operating');
}

/**
 * هل تصح الصفقة؟ تحتاج سوقًا عاملًا وسعرًا للمورد، ورصيدًا كافيًا، ومكانًا في المخزن
 * Is the trade valid? It needs an operating market, a price, enough balance and storage room
 */
export function checkTrade(state: GameState, defs: GameDefinitions, resourceId: string, amount: number, side: Side, now: number): Check {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'أدخل كمية صحيحة أكبر من صفر' };
  if (!hasMarket(state, defs, now)) return { ok: false, reason: 'تحتاج سوقًا عاملًا للتجارة' };
  const price = defs.marketPrices.find((p) => p.resourceId === resourceId);
  if (!price) return { ok: false, reason: 'هذا المورد لا يُتداول في السوق' };
  const caps = capacityAt(state, defs, now);
  const stock = (id: string) => Math.floor(state.resources[id] ?? 0);
  if (side === 'buy') {
    if (stock(CURRENCY) < price.buyPrice * amount) return { ok: false, reason: `الذهب غير كافٍ؛ تحتاج ${price.buyPrice * amount}` };
    if (stock(resourceId) + amount > (caps[resourceId] ?? Infinity)) return { ok: false, reason: 'لا يتسع المخزن لهذه الكمية؛ ابنِ مخزنًا' };
  } else {
    if (stock(resourceId) < amount) return { ok: false, reason: 'المخزون غير كافٍ للبيع' };
    if (stock(CURRENCY) + price.sellPrice * amount > (caps[CURRENCY] ?? Infinity)) return { ok: false, reason: 'لا تتسع الخزينة للذهب؛ ابنِ بنكًا' };
  }
  return { ok: true };
}

/** تنفيذ الصفقة (بعد نجاح checkTrade) / Execute the trade (after checkTrade succeeds) */
export function trade(state: GameState, defs: GameDefinitions, resourceId: string, amount: number, side: Side): GameState {
  const price = defs.marketPrices.find((p) => p.resourceId === resourceId)!;
  const r = { ...state.resources };
  if (side === 'buy') {
    r[CURRENCY] = (r[CURRENCY] ?? 0) - price.buyPrice * amount;
    r[resourceId] = (r[resourceId] ?? 0) + amount;
  } else {
    r[CURRENCY] = (r[CURRENCY] ?? 0) + price.sellPrice * amount;
    r[resourceId] = (r[resourceId] ?? 0) - amount;
  }
  return { ...state, resources: r };
}
