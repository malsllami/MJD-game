// مسؤولية الملف: لوحة "داخل المبنى" الجانبية بتبويبات — يعرض كل مبنى ما يعمله من حالة الدولة الحقيقية:
// مبنى الحكم (الدولة، الترقية، الجيش)، السكن (أفراده ومهنتهم)، مبنى العمل (العمال والإنتاج)، مركز التطوير (المهام)،
// السوق (البيع والشراء)، المخازن (الكميات والسعة)، وتبويب "المبنى" للنقل والهدم
// File responsibility: the tabbed "inside the building" side panel — each building shows what it does from the real nation state:
// government (nation, upgrade, army), housing (residents and trade), work buildings (workers and output), the development centre
// (tasks), the market (buying and selling), stores (amounts and capacity), plus a "building" tab to move and demolish

import { buildingStatus, capacityAt, isRoad, isUnderConstruction, netRates, stageById, staffingAt, unlockGaps, type Check, richnessOf } from '../core/economy';
import { checkTrade, CURRENCY, hasMarket, type Side } from '../core/market';
import { factorsOf, governmentLevel, housingAt, isUpgradable, isUpgrading, levelOf, levelRow } from '../core/levels';
import { buildingUpgradeCost, checkBuildingUpgrade, upgradeRequirements } from '../core/progression';
import type { BuildingDef, PlacedBuilding } from '../core/types';
import { residentsByProfession } from '../core/workforce';
import { formatDuration, formatNumber, parseNumber } from '../utils/format';
import { esc } from '../utils/html';
import { icon } from './icons';
import type { PanelContext } from './ministries-panel';
import { signed, table } from './table';

/** ما تعرضه اللوحة: مبنى الحكم أو مبنى موضوع / What the panel shows: the government building or a placed building */
export type PanelTarget = { kind: 'government' } | { kind: 'building'; uid: string };

/** أوامر اللوحة التي ينفذها المتحكم / Panel commands carried out by the controller */
export interface PanelActions {
  upgrade(): Check;
  upgradeBuilding(uid: string): Check;
  trade(resourceId: string, amount: number, side: Side): Check;
  move(uid: string): void;
  demolish(uid: string): void;
}

type Kind = 'government' | 'housing' | 'work' | 'development' | 'market' | 'storage';
interface Tab {
  id: string;
  name: string;
  body: () => string;
}

export class BuildingPanel {
  private target: PanelTarget | null = null;
  private tab = '';
  private resource = '';
  private pendingDemolish = 0;
  private message = '';

  constructor(
    private readonly el: HTMLElement,
    private readonly context: () => PanelContext,
    private readonly picture: (def: BuildingDef) => Promise<string>,
    private readonly actions: PanelActions,
    private readonly onClose: () => void,
  ) {
    el.addEventListener('click', (e) => this.onClick(e.target as HTMLElement));
  }

  get current(): PanelTarget | null {
    return this.target;
  }

  open(target: PanelTarget): void {
    this.target = target;
    this.tab = '';
    this.message = '';
    this.pendingDemolish = 0;
    this.el.hidden = false;
    this.render(true);
  }

  close(): void {
    this.target = null;
    this.el.hidden = true;
    this.el.innerHTML = '';
  }

  /** تحديث المحتوى دون إزعاج الكتابة في حقل الكمية / Refresh without disturbing typing in the amount field */
  refresh(): void {
    if (!this.target) return;
    if (this.el.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) return;
    this.render(false);
  }

  private placed(): PlacedBuilding | null {
    const t = this.target;
    return t?.kind === 'building' ? this.context().state.buildings.find((b) => b.uid === t.uid) ?? null : null;
  }

  private kindOf(def: BuildingDef): Kind {
    const { world } = this.context().defs;
    if (def.id === world.marketBuilding) return 'market';
    if (def.id === world.developmentBuilding) return 'development';
    if (Object.keys(def.storage).length) return 'storage';
    if (def.housing > 0) return 'housing';
    return 'work';
  }

  private render(fresh: boolean): void {
    const ctx = this.context();
    const placed = this.placed();
    if (this.target?.kind === 'building' && !placed) return this.close();
    const def = placed ? ctx.defs.buildings.find((b) => b.id === placed.buildingId)! : null;
    const kind: Kind = def ? this.kindOf(def) : 'government';
    const tabs = this.tabsFor(kind, def, placed);
    if (!tabs.some((t) => t.id === this.tab)) this.tab = tabs[0].id;
    const active = tabs.find((t) => t.id === this.tab)!;
    const name = def?.name ?? (ctx.defs.world.governmentName || ctx.defs.world.capitalName);
    const status = placed ? this.statusText(placed) : `${ctx.defs.world.capitalName} · ${governmentLevel(ctx.defs, ctx.state).name}`;
    const html = `
      <header class="bp-head">
        <span class="bp-pic" data-pic></span>
        <div class="bp-title"><h2>${esc(name)}</h2><small>${esc(status)}</small></div>
        <button type="button" class="icon-btn" data-close aria-label="إغلاق">✕</button>
      </header>
      <nav class="tabs bp-tabs" role="tablist" style="grid-template-columns: repeat(${tabs.length}, minmax(0, 1fr))">
        ${tabs.map((t) => `<button type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === this.tab}">${esc(t.name)}</button>`).join('')}
      </nav>
      <div class="bp-body">${active.body()}${this.message ? `<p class="panel-note bp-msg">${esc(this.message)}</p>` : ''}</div>`;
    const pic = this.el.querySelector<HTMLElement>('[data-pic]')?.innerHTML ?? '';
    this.el.innerHTML = html;
    const slot = this.el.querySelector<HTMLElement>('[data-pic]')!;
    if (!fresh && pic) slot.innerHTML = pic;
    else if (def && !isRoad(def)) void this.picture(def).then((src) => { slot.innerHTML = `<img src="${src}" alt="">`; }).catch(() => undefined);
    else slot.innerHTML = icon(def ? 'road' : 'shield');
  }

  private statusText(placed: PlacedBuilding): string {
    const ctx = this.context();
    const level = `المستوى ${formatNumber(levelOf(placed, ctx.now))}`;
    if (isUpgrading(placed, ctx.now)) return `${level} · يُرقّى · ${formatDuration(Math.ceil((placed.upgradeCompletesAt! - ctx.now) / 1000))}`;
    return `${level} · ${this.statusOnly(placed)}`;
  }

  private statusOnly(placed: PlacedBuilding): string {
    const ctx = this.context();
    const status = buildingStatus(placed, ctx.state, ctx.defs, ctx.now);
    const profession = (id: string) => ctx.defs.professions.find((p) => p.id === id)?.name ?? id;
    const resource = (id: string) => ctx.defs.resources.find((r) => r.id === id)?.name ?? id;
    switch (status.kind) {
      case 'constructing': return `تحت الإنشاء · ${formatDuration(Math.ceil((placed.completesAt - ctx.now) / 1000))}`;
      case 'disconnected': return 'متوقف · لا يصله طريق متصل بمبنى الحكم';
      case 'stopped': return `متوقف · ينقصه ${status.missing.map(resource).join('، ')}`;
      case 'understaffed': return `متوقف · ينقصه عمال (${profession(status.profession)})`;
      default: return 'يعمل';
    }
  }

  private tabsFor(kind: Kind, def: BuildingDef | null, placed: PlacedBuilding | null): Tab[] {
    const building: Tab = { id: 'building', name: 'المبنى', body: () => this.levelSection(def!, placed!) + this.buildingTab(def!) };
    switch (kind) {
      case 'government':
        return [
          { id: 'nation', name: 'الدولة', body: () => this.nationTab() },
          { id: 'upgrade', name: 'الترقية', body: () => this.upgradeTab() },
          { id: 'army', name: 'الجيش', body: () => `<div class="empty">${icon('army')}<p>لم يُنشأ جيش بعد؛ يُفتح الجيش مع ثكنة المدينة.</p></div>` },
        ];
      case 'housing':
        return [{ id: 'residents', name: 'السكان', body: () => this.residentsTab(def!, placed!) }, building];
      case 'development':
        return [{ id: 'tasks', name: 'المهام', body: () => this.upgradeTab() + this.lockedList() }, building];
      case 'market':
        return [{ id: 'trade', name: 'التجارة', body: () => this.tradeTab() }, { id: 'work', name: 'العمال', body: () => this.workTab(def!, placed!) }, building];
      case 'storage':
        return [{ id: 'stock', name: 'المخزون', body: () => this.storageTab(def!, placed!) }, building];
      default:
        return [{ id: 'work', name: 'العمل', body: () => this.workTab(def!, placed!) }, building];
    }
  }

  /** بيانات الدولة العامة / The nation's general data */
  private nationTab(): string {
    const { defs, state, now } = this.context();
    const byId = new Map(defs.buildings.map((b) => [b.id, b]));
    const done = state.buildings.filter((b) => !isUnderConstruction(b, now));
    const count = (pick: (d: BuildingDef) => boolean) => done.filter((b) => { const d = byId.get(b.buildingId); return !!d && pick(d); }).length;
    const professions = residentsByProfession(state.buildings, byId);
    const rates = netRates(state, defs, now);
    const caps = capacityAt(state, defs, now);
    const stats: [string, string][] = [
      ['المرحلة', stageById(defs, state.stage).name],
      ['مستوى الحكم', governmentLevel(defs, state).name],
      ['أقصى مستوى للمباني', formatNumber(governmentLevel(defs, state).maxBuildingLevel)],
      ['السكان', formatNumber(Math.floor(state.population))],
      ['المباني المكتملة', formatNumber(done.length)],
      ['المزارع والحظائر', formatNumber(count((d) => d.workers > 0 && (d.profession === 'farmer' || d.profession === 'herder')))],
      ['المناجم والمنقبون', formatNumber(count((d) => !!d.requiresDeposit))],
      ['قطع الطرق', formatNumber(state.roads.length)],
      ['مساحة الدولة', `${formatNumber(state.territory.length)} مربعًا`],
      ['الخزينة', `${formatNumber(Math.floor(state.resources[CURRENCY] ?? 0))} ذهب`],
    ];
    const people = defs.professions.map((p) => [esc(p.name), formatNumber(professions[p.id] ?? 0)]).filter((r) => r[1] !== formatNumber(0));
    const economy = defs.resources.map((r) => [
      `${icon(r.icon)} ${esc(r.name)}`,
      `${formatNumber(Math.floor(state.resources[r.id] ?? 0))}${Number.isFinite(caps[r.id]) ? ` / ${formatNumber(caps[r.id])}` : ''}`,
      signed(rates[r.id] ?? 0),
    ]);
    return `<dl class="stats">${stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <h3>السكان حسب المهنة</h3>${people.length ? table(['المهنة', 'العدد'], people) : '<p class="panel-note">لا سكان بعد؛ ابنِ مساكن.</p>'}
      <h3>الاقتصاد</h3>${table(['المورد', 'المخزون / السعة', 'الصافي في الدقيقة'], economy)}`;
  }

  /** شروط الترقية وزرها / Upgrade conditions and its button */
  private upgradeTab(): string {
    const { defs, state, now } = this.context();
    const req = upgradeRequirements(defs, state, now);
    if (!req) return '<p class="panel-note">بلغ مبنى الحكم أعلى مستوى.</p>';
    const ready = req.items.every((r) => r.met);
    const list = req.items.map((r) => `<li class="${r.met ? 'done' : ''}"><i>${r.met ? '✓' : ''}</i>${esc(r.label)}</li>`).join('');
    const button = this.target?.kind === 'government'
      ? `<button type="button" class="text-btn bp-main" data-act="upgrade" ${ready ? '' : 'disabled'}>ترقية مبنى الحكم إلى «${esc(req.stage)}»</button>`
      : '<p class="panel-note">تتم الترقية من مبنى الحكم عند اكتمال الشروط.</p>';
    return `<p class="panel-note">الترقية إلى ${esc(req.stage)}: أُنجز ${formatNumber(req.items.filter((r) => r.met).length)} من ${formatNumber(req.items.length)}</p><ul class="tasks">${list}</ul>${button}`;
  }

  /** المباني التي ستُفتح وما ينقصها / Buildings that will unlock and what they lack */
  private lockedList(): string {
    const { defs, state, now } = this.context();
    const order = stageById(defs, state.stage).order;
    const locked = defs.buildings.filter((b) => !isRoad(b) && stageById(defs, b.stage).order <= order && unlockGaps(b, state, defs, now).length);
    if (!locked.length) return '';
    return `<h3>مبانٍ ستُفتح</h3><ul class="tasks">${locked.map((b) => `<li><i></i>${esc(b.name)}: ${esc(unlockGaps(b, state, defs, now).join('، '))}</li>`).join('')}</ul>`;
  }

  private residentsTab(def: BuildingDef, placed: PlacedBuilding): string {
    const { defs, now } = this.context();
    const profession = defs.professions.find((p) => p.id === def.profession)?.name ?? 'عامة';
    const residents = Math.floor(placed.residents ?? 0);
    const capacity = housingAt(def, factorsOf(defs, placed, now).population);
    const consumption = Object.entries(def.consumption).map(([id, n]) => `${formatNumber(n)} ${defs.resources.find((r) => r.id === id)?.name ?? id}`).join('، ');
    return `<dl class="stats">
        <div><dt>السكان</dt><dd>${formatNumber(residents)} من ${formatNumber(capacity)}</dd></div>
        <div><dt>المهنة</dt><dd>${esc(profession)}</dd></div>
      </dl>
      <i class="meter wide" style="--p:${Math.round((residents / Math.max(1, capacity)) * 100)}%"></i>
      <p class="panel-note">${consumption ? `يستهلك في الدقيقة: ${esc(consumption)}` : 'لا يستهلك موارد'}. سكانه يعملون في مباني مهنتهم.</p>`;
  }

  private workTab(def: BuildingDef, placed: PlacedBuilding): string {
    const { defs, state, now } = this.context();
    const crew = staffingAt(state, defs, now).get(placed.uid);
    const efficiency = buildingStatus(placed, state, defs, now).kind === 'operating' ? crew?.efficiency ?? 1 : 0;
    // كامل الطاقة يشمل مضاعف مستوى المبنى / Full capacity includes the building's level factor
    const factor = factorsOf(defs, placed, now).production * richnessOf(state, placed, def);
    const resource = (id: string) => defs.resources.find((r) => r.id === id);
    const flows = [
      ...Object.entries(def.production).map(([id, n]) => [`${icon(resource(id)?.icon ?? id)} ${esc(resource(id)?.name ?? id)}`, signed(n * factor * efficiency), formatNumber(n * factor)]),
      ...Object.entries(def.consumption).map(([id, n]) => [`${icon(resource(id)?.icon ?? id)} ${esc(resource(id)?.name ?? id)}`, signed(-n * factor * efficiency), formatNumber(-n * factor)]),
    ];
    const profession = defs.professions.find((p) => p.id === def.profession)?.name;
    const workers = crew && crew.needed
      ? `<div><dt>العمال (${esc(profession ?? '')})</dt><dd>${formatNumber(crew.assigned)} من ${formatNumber(crew.needed)}</dd></div>`
      : '<div><dt>العمال</dt><dd>لا يحتاج عمالًا</dd></div>';
    return `<dl class="stats">${workers}<div><dt>الكفاءة</dt><dd>${formatNumber(Math.round(efficiency * 100))}٪</dd></div></dl>
      ${flows.length ? table(['المورد', 'الآن في الدقيقة', 'بكامل الطاقة'], flows) : '<p class="panel-note">لا ينتج ولا يستهلك موارد.</p>'}`;
  }

  /** البيع والشراء بأسعار الشيت / Buying and selling at sheet prices */
  private tradeTab(): string {
    const { defs, state, now } = this.context();
    if (!hasMarket(state, defs, now)) return `<div class="empty">${icon('trade')}<p>السوق لا يعمل الآن؛ تحتاج تجارًا من سكن التجار وطريقًا متصلًا.</p></div>`;
    const caps = capacityAt(state, defs, now);
    const prices = defs.marketPrices;
    if (!prices.some((p) => p.resourceId === this.resource)) this.resource = prices[0]?.resourceId ?? '';
    const name = (id: string) => defs.resources.find((r) => r.id === id)?.name ?? id;
    const rows = prices.map((p) => [
      `<button type="button" class="chip ${p.resourceId === this.resource ? 'on' : ''}" data-res="${esc(p.resourceId)}">${esc(name(p.resourceId))}</button>`,
      `${formatNumber(Math.floor(state.resources[p.resourceId] ?? 0))}${Number.isFinite(caps[p.resourceId]) ? ` / ${formatNumber(caps[p.resourceId])}` : ''}`,
      formatNumber(p.buyPrice),
      formatNumber(p.sellPrice),
    ]);
    return `${table(['المورد', 'المخزون / السعة', 'شراء', 'بيع'], rows)}
      <label class="bp-label" for="bp-qty">الكمية لـ «${esc(name(this.resource))}» (أرقام عربية أو إنجليزية)</label>
      <input id="bp-qty" class="bp-input" inputmode="numeric" autocomplete="off" data-qty>
      <p class="panel-note">رصيدك ${formatNumber(Math.floor(state.resources[CURRENCY] ?? 0))} ذهب</p>
      <div class="bp-pair">
        <button type="button" class="text-btn ok" data-act="buy">شراء</button>
        <button type="button" class="text-btn sell" data-act="sell">بيع</button>
      </div>`;
  }

  /** ما يخزنه المخزن ومخزون الدولة من كل مورد / What the store holds and the nation's stock of each resource */
  private storageTab(def: BuildingDef, placed: PlacedBuilding): string {
    const { defs, state, now } = this.context();
    const caps = capacityAt(state, defs, now);
    const running = buildingStatus(placed, state, defs, now).kind === 'operating';
    const rows = Object.entries(def.storage).map(([id, n]) => {
      const r = defs.resources.find((x) => x.id === id);
      return [`${icon(r?.icon ?? id)} ${esc(r?.name ?? id)}`, formatNumber(Math.floor(state.resources[id] ?? 0)), formatNumber(caps[id]), `+${formatNumber(n * factorsOf(defs, placed, now).production)}`];
    });
    return `${running ? '' : '<p class="panel-note warn">المخزن لا يعمل الآن فلا تُحسب سعته.</p>'}${table(['المورد', 'المخزون', 'سعة الدولة', 'يضيف هذا المخزن'], rows)}`;
  }

  /**
   * مستوى المبنى وترقيته: ما تضيفه، وتكلفتها ومدتها، أو سبب تعذرها (ومنه أن مبنى الحكم لم يبلغ المستوى المطلوب)
   * The building's level and upgrade: what it adds, its cost and time, or why it is not possible (including the government's level)
   */
  private levelSection(def: BuildingDef, placed: PlacedBuilding): string {
    const { defs, state, now } = this.context();
    if (!isUpgradable(def) || defs.buildingLevels.length < 2) return '';
    const level = levelOf(placed, now);
    const top = Math.min(defs.buildingLevels.length, governmentLevel(defs, state).maxBuildingLevel);
    const head = `<dl class="stats"><div><dt>المستوى</dt><dd>${formatNumber(level)} من ${formatNumber(defs.buildingLevels.length)}</dd></div>
      <div><dt>يسمح مبنى الحكم حتى</dt><dd>المستوى ${formatNumber(top)}</dd></div></dl>`;
    if (isUpgrading(placed, now)) return `${head}<p class="panel-note">تجري الترقية إلى المستوى ${formatNumber(placed.level!)}؛ تكتمل بعد ${formatDuration(Math.ceil((placed.upgradeCompletesAt! - now) / 1000))}.</p>`;
    const next = (placed.level ?? 1) + 1;
    if (next > defs.buildingLevels.length) return `${head}<p class="panel-note">المبنى في أعلى مستوى.</p>`;
    const now1 = levelRow(defs, level);
    const then = levelRow(defs, next);
    const { cost, seconds } = buildingUpgradeCost(defs, def.id, next);
    const costText = Object.entries(cost).map(([id, n]) => `${formatNumber(n)} ${defs.resources.find((r) => r.id === id)?.name ?? id}`).join('، ') || 'مجانًا';
    const gains = [
      Object.keys(def.production).length || Object.keys(def.storage).length ? `الإنتاج ×${formatNumber(Math.round((then.productionFactor / now1.productionFactor) * 100) / 100)}` : '',
      def.housing || def.workers ? `السكان والعمال ×${formatNumber(Math.round((then.populationFactor / now1.populationFactor) * 100) / 100)}` : '',
      then.style !== now1.style && then.style === 'stone' ? 'يتحول إلى مبنى حجري' : '',
    ].filter(Boolean).join('، ');
    const check = checkBuildingUpgrade(defs, state, placed.uid, now);
    return `${head}<p class="panel-note">الترقية إلى المستوى ${formatNumber(next)}: ${esc(gains)} · ${esc(costText)} · ${formatDuration(seconds)}</p>
      ${check.ok ? '' : `<p class="panel-note warn">${esc(check.reason)}</p>`}
      <button type="button" class="text-btn bp-main" data-act="level-up" ${check.ok ? '' : 'disabled'}>ترقية إلى المستوى ${formatNumber(next)}</button>`;
  }

  private buildingTab(def: BuildingDef): string {
    const { defs } = this.context();
    const refund = Object.entries(def.cost).map(([id, n]) => `${formatNumber(Math.floor((n * defs.world.demolishRefundPercent) / 100))} ${defs.resources.find((r) => r.id === id)?.name ?? id}`).join('، ');
    const confirming = this.pendingDemolish > Date.now();
    return `<p class="panel-note">النقل يكلّف ${formatNumber(defs.world.moveCostPercent)}٪ من تكلفة البناء، والهدم يسترد ${formatNumber(defs.world.demolishRefundPercent)}٪ (${esc(refund || 'لا شيء')}).</p>
      <div class="bp-pair">
        <button type="button" class="text-btn ok" data-act="move">نقل</button>
        <button type="button" class="text-btn sell" data-act="demolish">${confirming ? 'اضغط مرة أخرى للتأكيد' : 'هدم'}</button>
      </div>`;
  }

  private onClick(t: HTMLElement): void {
    if (t.closest('[data-close]')) {
      this.close();
      return this.onClose();
    }
    const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab;
    if (tab) {
      this.tab = tab;
      this.message = '';
      return this.render(false);
    }
    const res = t.closest<HTMLElement>('[data-res]')?.dataset.res;
    if (res) {
      this.resource = res;
      return this.render(false);
    }
    const act = t.closest<HTMLButtonElement>('[data-act]')?.dataset.act;
    if (!act) return;
    const placed = this.placed();
    if (act === 'upgrade') {
      const result = this.actions.upgrade();
      this.message = result.ok ? 'تمت ترقية مبنى الحكم' : result.reason;
    } else if (act === 'level-up' && placed) {
      const result = this.actions.upgradeBuilding(placed.uid);
      this.message = result.ok ? 'بدأت الترقية' : result.reason;
    } else if (act === 'buy' || act === 'sell') {
      const amount = parseNumber(this.el.querySelector<HTMLInputElement>('[data-qty]')?.value ?? '');
      const { defs, state, now } = this.context();
      const check = Number.isFinite(amount) ? checkTrade(state, defs, this.resource, amount, act, now) : { ok: false as const, reason: 'أدخل كمية صحيحة' };
      const result = check.ok ? this.actions.trade(this.resource, amount, act) : check;
      this.message = result.ok ? `تمت الصفقة: ${act === 'buy' ? 'شراء' : 'بيع'} ${formatNumber(amount)}` : result.reason;
    } else if (act === 'move' && placed) {
      this.actions.move(placed.uid);
      return this.close();
    } else if (act === 'demolish' && placed) {
      if (this.pendingDemolish < Date.now()) this.pendingDemolish = Date.now() + 4000;
      else {
        this.actions.demolish(placed.uid);
        return this.close();
      }
    }
    this.render(false);
  }
}
