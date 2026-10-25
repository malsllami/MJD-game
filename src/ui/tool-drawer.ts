// مسؤولية الملف: أدوات القيادة على اليسار — نظرة عامة، الخريطة، المهام، التنبيهات، التقارير؛ كل محتواها محسوب من حالة الدولة الحقيقية
// File responsibility: left command tools — overview, map, tasks, alerts, reports; all content is computed from the real nation state

import { buildingStatus, housingCapacity, isRoad, isUnderConstruction, netRates, nextStage, rateBreakdown, stageById } from '../core/economy';
import { formatDuration, formatNumber } from '../utils/format';
import { esc } from '../utils/html';
import { icon } from './icons';
import type { PanelContext } from './ministries-panel';
import { signed, table } from './table';

/** الأدوات بترتيب ظهورها؛ "الخريطة" توسّع الخريطة المصغرة بدل فتح لوحة / Tools in order; "map" enlarges the minimap instead of a panel */
export const TOOLS = [
  { id: 'overview', name: 'نظرة عامة', icon: 'overview' },
  { id: 'map', name: 'الخريطة', icon: 'map' },
  { id: 'tasks', name: 'المهام', icon: 'tasks' },
  { id: 'alerts', name: 'التنبيهات', icon: 'bell' },
  { id: 'reports', name: 'التقارير', icon: 'chart' },
] as const;

type ToolId = (typeof TOOLS)[number]['id'];

/** تنبيه واحد، مع موقعه على الخريطة إن وُجد / One alert, with its map position when it has one */
interface Alert {
  text: string;
  at?: { x: number; z: number };
}

export class ToolDrawer {
  private open: ToolId | null = null;

  constructor(
    private readonly nav: HTMLElement,
    private readonly drawer: HTMLElement,
    private readonly context: () => PanelContext,
    private readonly onFocus: (x: number, z: number) => void,
    private readonly onMap: (expanded: boolean) => void,
  ) {
    nav.innerHTML = TOOLS.map((t) => `<button type="button" data-tool="${t.id}" aria-pressed="false">${icon(t.icon)}<span>${esc(t.name)}</span><i data-badge hidden></i></button>`).join('');
    nav.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]')?.dataset.tool as ToolId | undefined;
      if (id) this.toggle(id);
    });
    drawer.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]')) return this.toggle(this.open!);
      const focus = t.closest<HTMLElement>('[data-focus]');
      if (focus) {
        const [x, z] = focus.dataset.focus!.split(',').map(Number);
        this.onFocus(x, z);
      }
    });
    this.refresh();
  }

  /** فتح الأداة أو إغلاقها إن كانت مفتوحة / Open the tool, or close it when already open */
  private toggle(id: ToolId): void {
    this.open = this.open === id ? null : id;
    this.onMap(this.open === 'map');
    this.nav.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === this.open)));
    this.refresh();
  }

  /** تحديث شارة التنبيهات ومحتوى الأداة المفتوحة / Refresh the alerts badge and the open tool's content */
  refresh(): void {
    const ctx = this.context();
    const alerts = collectAlerts(ctx);
    const badge = this.nav.querySelector<HTMLElement>('[data-tool="alerts"] [data-badge]')!;
    badge.hidden = !alerts.length;
    badge.textContent = formatNumber(alerts.length);

    const tool = TOOLS.find((t) => t.id === this.open);
    this.drawer.hidden = !tool || tool.id === 'map';
    if (!tool || tool.id === 'map') return;
    const body = tool.id === 'overview' ? overview(ctx) : tool.id === 'tasks' ? tasks(ctx) : tool.id === 'alerts' ? alertList(alerts) : reports(ctx);
    const html = `<header class="drawer-head"><h2>${icon(tool.icon)} ${esc(tool.name)}</h2><button type="button" class="icon-btn" data-close aria-label="إغلاق">✕</button></header><div class="drawer-body">${body}</div>`;
    if (this.drawer.dataset.html === html) return;
    const scroll = this.drawer.querySelector('.drawer-body')?.scrollTop ?? 0;
    this.drawer.dataset.html = html;
    this.drawer.innerHTML = html;
    this.drawer.querySelector('.drawer-body')!.scrollTop = scroll;
  }
}

/** نظرة عامة على الدولة / Nation overview */
function overview({ defs, world, state, now }: PanelContext): string {
  const stage = stageById(defs, state.stage);
  const next = nextStage(defs, state.stage);
  const pop = Math.floor(state.population);
  const building = state.buildings.filter((b) => isUnderConstruction(b, now)).length;
  const typeName = new Map(defs.deposits.map((d) => [d.id, d.name]));
  const known = world.deposits.filter((d) => state.discovered.includes(d.id));
  const stats = [
    ['المرحلة', esc(stage.name)],
    ['السكان', `${formatNumber(pop)} / ${formatNumber(housingCapacity(state, defs, now))}`],
    ['مساحة الدولة', `${formatNumber(state.territory.length)} مربعًا`],
    ['المباني', `${formatNumber(state.buildings.length - building)} مكتمل · ${formatNumber(building)} قيد الإنشاء`],
    ['قطع الطرق', formatNumber(state.roads.length)],
  ];
  const progress = next ? Math.min(100, Math.round((pop / next.population) * 100)) : 100;
  const goal = next ? `<p class="panel-note">التقدم نحو ${esc(next.name)}: ${formatNumber(pop)} من ${formatNumber(next.population)} نسمة</p><i class="meter wide" style="--p:${progress}%"></i>` : '<p class="panel-note">بلغت الدولة أعلى مرحلة</p>';
  const deposits = known.length
    ? `<h3>المكامن المكتشفة</h3><div class="chips">${known.map((d) => `<button type="button" class="chip" data-focus="${d.x},${d.z}">${esc(typeName.get(d.typeId) ?? d.typeId)}</button>`).join('')}</div>`
    : '<p class="panel-note">لم تُكتشف مكامن بعد؛ وسّع الحدود أو استخدم المسح.</p>';
  return `<dl class="stats">${stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>${goal}${deposits}`;
}

/**
 * المهام: هدف المرحلة التالية، ومباني المرحلة الحالية التي لم تُبنَ بعد، وربط المباني بالطرق
 * Tasks: the next-stage goal, current-stage buildings not built yet, and connecting buildings to roads
 */
function tasks({ defs, state, now }: PanelContext): string {
  const stage = stageById(defs, state.stage);
  const next = nextStage(defs, state.stage);
  const items: { ok: boolean; text: string }[] = [];
  const pop = Math.floor(state.population);
  if (next) items.push({ ok: false, text: `بلوغ ${formatNumber(next.population)} نسمة لتصبح ${next.name} (الآن ${formatNumber(pop)})` });
  items.push({ ok: state.roads.length > 0, text: 'ارسم أول طريق متصل بمبنى الحكم' });
  const disconnected = state.buildings.filter((b) => buildingStatus(b, state, defs, now).kind === 'disconnected').length;
  if (disconnected) items.push({ ok: false, text: `اربط ${formatNumber(disconnected)} من المباني بطريق متصل` });
  const built = new Set(state.buildings.filter((b) => !isUnderConstruction(b, now)).map((b) => b.buildingId));
  for (const b of defs.buildings.filter((x) => x.stage === stage.id && !x.requiresTech && !isRoad(x))) items.push({ ok: built.has(b.id), text: `ابنِ ${b.name}` });
  // غير المنجز أولًا / Unfinished first
  const sorted = [...items.filter((i) => !i.ok), ...items.filter((i) => i.ok)];
  const list = sorted.map((i) => `<li class="${i.ok ? 'done' : ''}"><i>${i.ok ? '✓' : ''}</i>${esc(i.text)}</li>`).join('');
  return `<p class="panel-note">مهام مرحلة ${esc(stage.name)}: أُنجز ${formatNumber(items.filter((i) => i.ok).length)} من ${formatNumber(items.length)}</p><ul class="tasks">${list}</ul>`;
}

/** التنبيهات: مبانٍ متوقفة، وموارد تنفد، ومساكن ممتلئة / Alerts: stopped buildings, running-out resources, full housing */
function collectAlerts({ defs, state, now }: PanelContext): Alert[] {
  const name = new Map(defs.buildings.map((b) => [b.id, b.name]));
  const resource = new Map(defs.resources.map((r) => [r.id, r.name]));
  const out: Alert[] = [];
  for (const b of state.buildings) {
    const s = buildingStatus(b, state, defs, now);
    if (s.kind === 'disconnected') out.push({ text: `${name.get(b.buildingId) ?? ''}: لا يصله طريق متصل بمبنى الحكم`, at: b });
    else if (s.kind === 'stopped') out.push({ text: `${name.get(b.buildingId) ?? ''}: متوقف لنقص ${s.missing.map((id) => resource.get(id) ?? id).join('، ')}`, at: b });
  }
  for (const [id, rate] of Object.entries(netRates(state, defs, now))) {
    if (rate >= 0) continue;
    const stock = state.resources[id] ?? 0;
    out.push({ text: `${resource.get(id) ?? id} ينخفض ${formatNumber(-rate)} في الدقيقة، وينفد خلال ${formatDuration(Math.floor((stock / -rate) * 60))}` });
  }
  const capacity = housingCapacity(state, defs, now);
  if (capacity > 0 && state.population >= capacity) out.push({ text: 'المساكن ممتلئة؛ ابنِ مساكن جديدة ليزيد السكان' });
  return out;
}

function alertList(alerts: Alert[]): string {
  if (!alerts.length) return `<div class="empty">${icon('bell')}<p>لا توجد تنبيهات؛ كل شيء يعمل.</p></div>`;
  return `<ul class="alerts">${alerts
    .map((a) => (a.at ? `<li><button type="button" data-focus="${a.at.x},${a.at.z}">${esc(a.text)}<small>عرض على الخريطة</small></button></li>` : `<li><span>${esc(a.text)}</span></li>`))
    .join('')}</ul>`;
}

/** التقارير: الإنتاج والاستهلاك لكل مورد، وحالة المباني حسب النوع / Reports: production and consumption per resource, building states by type */
function reports({ defs, state, now }: PanelContext): string {
  const { production, consumption } = rateBreakdown(state, defs, now);
  const rates = defs.resources.map((r) => [
    `${icon(r.icon)} ${esc(r.name)}`,
    formatNumber(production[r.id] ?? 0),
    formatNumber(consumption[r.id] ?? 0),
    signed((production[r.id] ?? 0) - (consumption[r.id] ?? 0)),
  ]);
  const byType = new Map<string, { all: number; working: number }>();
  for (const b of state.buildings) {
    const c = byType.get(b.buildingId) ?? { all: 0, working: 0 };
    c.all++;
    if (buildingStatus(b, state, defs, now).kind === 'operating') c.working++;
    byType.set(b.buildingId, c);
  }
  const buildings = defs.buildings
    .filter((b) => byType.has(b.id))
    .map((b) => {
      const c = byType.get(b.id)!;
      return [esc(b.name), formatNumber(c.all), formatNumber(c.working), formatNumber(c.all - c.working)];
    });
  return `<h3>الموارد في الدقيقة</h3>${table(['المورد', 'الإنتاج', 'الاستهلاك', 'الصافي'], rates)}
    <h3>المباني</h3>${buildings.length ? table(['المبنى', 'العدد', 'يعمل', 'لا يعمل'], buildings) : '<p class="panel-note">لم تُبنَ مبانٍ بعد.</p>'}`;
}
