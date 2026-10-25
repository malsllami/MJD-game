// مسؤولية الملف: لوحة الوزارات — تبويب لكل وزارة، ومحتوى كل وزارة من حالة اللعبة الحقيقية
// File responsibility: ministries panel — one tab per ministry, content drawn from real game state

import { buildingStatus, housingCapacity, netRates, nextStage, stageById } from '../core/economy';
import type { GameDefinitions, GameState, Ministry, World } from '../core/types';
import { formatNumber } from '../utils/format';
import { esc } from '../utils/html';
import { icon } from './icons';

/** مولّد محتوى وزارة / Ministry content renderer */
type Renderer = (ctx: PanelContext) => string;

export interface PanelContext {
  defs: GameDefinitions;
  state: GameState;
  world: World;
  now: number;
}

/**
 * محتوى الوزارات المفعّلة حاليًا؛ أي وزارة أخرى تُظهر وصفها حتى يُبنى نظامها
 * Content for ministries implemented so far; others show their description until their system exists
 */
const RENDERERS: Record<string, Renderer> = {
  finance: ({ defs, state, now }) => {
    const rates = netRates(state, defs, now);
    return table(
      ['المورد', 'المخزون', 'الصافي في الدقيقة'],
      defs.resources.map((r) => [
        `${icon(r.icon)} ${esc(r.name)}`,
        formatNumber(Math.floor(state.resources[r.id] ?? 0)),
        signed(rates[r.id] ?? 0),
      ]),
    );
  },
  interior: ({ defs, state, now }) => {
    const stage = stageById(defs, state.stage);
    const next = nextStage(defs, state.stage);
    const capacity = housingCapacity(state, defs, now);
    const byId = new Map(defs.buildings.map((b) => [b.id, b]));
    const resourceName = new Map(defs.resources.map((r) => [r.id, r.name]));
    const stopped = state.buildings
      .map((b) => ({ b, status: buildingStatus(b, state, defs, now) }))
      .filter((x) => x.status.kind === 'stopped')
      .map((x) => [esc(byId.get(x.b.buildingId)?.name ?? ''), x.status.kind === 'stopped' ? esc(x.status.missing.map((id) => resourceName.get(id) ?? id).join('، ')) : '']);
    const summary = table(['المؤشر', 'القيمة'], [
      ['المرحلة', esc(stage.name)],
      ['السكان', formatNumber(Math.floor(state.population))],
      ['سعة المساكن العاملة', formatNumber(capacity)],
      ['المرحلة التالية', next ? `${esc(next.name)} عند ${formatNumber(next.population)} نسمة` : 'أعلى مرحلة'],
    ]);
    const problems = stopped.length
      ? `<p class="panel-note warn">مبانٍ متوقفة لنقص الموارد؛ السكان لا يزيدون حتى تعود للعمل.</p>${table(['المبنى', 'ينقصه'], stopped)}`
      : '<p class="panel-note">كل المباني تعمل.</p>';
    return summary + problems;
  },
  housing: ({ defs, world, state }) => {
    const owned = new Set(state.territory);
    const counts = new Map<string, { all: number; owned: number }>();
    for (const t of world.tiles) {
      const c = counts.get(t.terrainId) ?? { all: 0, owned: 0 };
      c.all++;
      if (owned.has(`${t.x},${t.z}`)) c.owned++;
      counts.set(t.terrainId, c);
    }
    const rows = defs.terrain
      .filter((t) => counts.get(t.id)?.all)
      .map((t) => {
        const c = counts.get(t.id)!;
        return [`<span class="swatch" style="background:${esc(t.color)}"></span>${esc(t.name)}`, formatNumber(c.owned), formatNumber(c.all)];
      });
    return `<p class="panel-note">مساحة الدولة ${formatNumber(owned.size)} مربعًا، والمباني ${formatNumber(state.buildings.length)}.</p>
      ${table(['نوع الأرض', 'في الدولة', 'في العالم'], rows)}`;
  },
};

export class MinistriesPanel {
  private active: string;

  constructor(private readonly el: HTMLElement, private readonly context: () => PanelContext) {
    this.active = context().defs.ministries[0]?.id ?? '';
    el.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ministry]');
      if (tab) {
        this.active = tab.dataset.ministry!;
        this.render();
      }
    });
    this.render();
  }

  /** تحديث محتوى الوزارة المفتوحة فقط إن كان يتغير مع الحالة / Refresh the open ministry only if its content is live */
  refresh(): void {
    if (!RENDERERS[this.active]) return;
    const body = this.el.querySelector<HTMLElement>('.panel-body');
    const scroll = body?.querySelector('.tbox')?.scrollTop ?? 0;
    const current = this.context().defs.ministries.find((m) => m.id === this.active);
    if (body && current) body.innerHTML = this.body(current);
    const box = body?.querySelector('.tbox');
    if (box) box.scrollTop = scroll;
  }

  private render(): void {
    const { ministries } = this.context().defs;
    const current = ministries.find((m) => m.id === this.active);
    const tabs = ministries
      .map((m) => `<button type="button" role="tab" data-ministry="${esc(m.id)}" aria-selected="${m.id === this.active}">${esc(m.name)}</button>`)
      .join('');
    this.el.innerHTML = `
      <header class="panel-head"><h2>وزارة ${esc(current?.name ?? '')}</h2><small>${esc(current?.description ?? '')}</small></header>
      <nav class="tabs" role="tablist">${tabs}</nav>
      <div class="panel-body">${current ? this.body(current) : ''}</div>`;
  }

  private body(m: Ministry): string {
    const renderer = RENDERERS[m.id];
    if (renderer) return renderer(this.context());
    return `<div class="empty">${icon('info')}<p>تُفعَّل لوحة وزارة ${esc(m.name)} مع بناء نظام ${esc(m.description)}.</p></div>`;
  }
}

/** رقم بإشارة: +5 أو −3 أو — / Signed number: +5, −3 or — */
function signed(n: number): string {
  if (!n) return '—';
  return `<span class="${n > 0 ? 'pos' : 'neg'}">${n > 0 ? '+' : '−'}${formatNumber(Math.abs(n))}</span>`;
}

/** جدول بصف أول ثابت وملوّن / Table with a sticky coloured header row */
function table(headers: string[], rows: string[][]): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="tbox"><table class="gt"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
