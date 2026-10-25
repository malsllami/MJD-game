// مسؤولية الملف: شريط البناء — فئات المباني وبطاقاتها، وحالة كل بطاقة (متاح، ينقصه موارد، مقفل بالمرحلة أو البحث)، وطابور الإنشاء
// File responsibility: build bar — categories and cards, each card's state (available, short, locked by stage or research), and the queue

import { isUnderConstruction, missingResources, stageById } from '../core/economy';
import type { BuildingDef, GameDefinitions, GameState } from '../core/types';
import { formatDuration, formatNumber } from '../utils/format';
import { esc } from '../utils/html';

export class BuildBar {
  private category: string;
  private armed: string | null = null;
  private last: { state: GameState; now: number } | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly defs: GameDefinitions,
    private readonly onPick: (b: BuildingDef) => void,
  ) {
    this.category = defs.buildingCategories[0]?.id ?? '';
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const cat = t.closest<HTMLButtonElement>('[data-cat]');
      const card = t.closest<HTMLButtonElement>('[data-building]');
      if (cat) {
        this.category = cat.dataset.cat!;
        this.render();
      } else if (card) {
        const b = defs.buildings.find((x) => x.id === card.dataset.building);
        if (b) this.onPick(b);
      }
    });
    this.render();
  }

  /** تمييز المبنى الجاهز للوضع على الخريطة / Mark the building armed for placement */
  setArmed(id: string | null): void {
    this.armed = id;
    this.el.querySelectorAll<HTMLElement>('[data-building]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.building === id)));
  }

  /**
   * تحديث حالة البطاقات وطابور الإنشاء دون إعادة بناء البطاقات (يحافظ على موضع التمرير)
   * Refresh card states and the queue without rebuilding the cards (keeps scroll position)
   */
  update(state: GameState, now: number): void {
    this.last = { state, now };
    const current = stageById(this.defs, state.stage);
    this.el.querySelectorAll<HTMLElement>('[data-building]').forEach((card) => {
      const b = this.defs.buildings.find((x) => x.id === card.dataset.building);
      if (!b) return;
      const required = stageById(this.defs, b.stage);
      const lockedByStage = required.order > current.order;
      const locked = lockedByStage || !!b.requiresTech;
      const short = locked ? null : missingResources(this.defs, state, b.cost);
      card.classList.toggle('lock', locked);
      card.classList.toggle('short', !!short);
      const note = card.querySelector<HTMLElement>('[data-lock]')!;
      note.textContent = lockedByStage ? `يُفتح في ${required.name} · ${formatNumber(required.population)} نسمة` : b.requiresTech ? 'يتطلب بحثًا' : '';
      card.title = locked ? note.textContent : short ? `ينقص: ${short}` : 'متاح للبناء';
    });
    const names = new Map(this.defs.buildings.map((b) => [b.id, b.name]));
    const active = state.buildings.filter((b) => isUnderConstruction(b, now));
    const queue = this.el.querySelector<HTMLElement>('[data-queue]')!;
    queue.innerHTML = active.length
      ? active
          .map((b) => {
            const left = Math.ceil((b.completesAt - now) / 1000);
            const pct = Math.round(((now - b.startedAt) / (b.completesAt - b.startedAt)) * 100);
            return `<div class="q-item"><span>${esc(names.get(b.buildingId) ?? b.buildingId)}</span><b>${formatDuration(left)}</b><i style="--p:${pct}%"></i></div>`;
          })
          .join('')
      : `<span class="q-empty">لا يوجد بناء جارٍ · الحد ${formatNumber(this.defs.world.maxConcurrentBuilds)}</span>`;
  }

  private render(): void {
    const terrainName = new Map(this.defs.terrain.map((t) => [t.id, t.name]));
    const resourceName = new Map(this.defs.resources.map((r) => [r.id, r.name]));
    const cats = this.defs.buildingCategories
      .filter((c) => this.defs.buildings.some((b) => b.category === c.id))
      .map((c) => `<button type="button" role="tab" data-cat="${esc(c.id)}" aria-selected="${c.id === this.category}">${esc(c.name)}</button>`)
      .join('');
    const list = (m: Record<string, number>) => Object.entries(m).map(([id, n]) => `${formatNumber(n)} ${esc(resourceName.get(id) ?? id)}`).join(' · ');
    const cards = this.defs.buildings
      .filter((b) => b.category === this.category)
      .map((b) => {
        const where = b.allowedTerrain.map((id) => terrainName.get(id) ?? id).join('، ');
        const output = Object.keys(b.production).length ? `<span class="out">+${list(b.production)} / د</span>` : '';
        const input = Object.keys(b.consumption).length ? `<span class="in">−${list(b.consumption)} / د</span>` : '';
        const homes = b.housing ? `<span class="out">يسكنه ${formatNumber(b.housing)}</span>` : '';
        return `<button type="button" class="card" data-building="${esc(b.id)}" aria-pressed="${this.armed === b.id}">
          <b>${esc(b.name)}</b>
          <span>${esc(where)}</span>
          <span>${formatDuration(b.buildSeconds)} · ${list(b.cost)}</span>
          ${homes}${output}${input}
          <em data-lock></em>
        </button>`;
      })
      .join('');
    this.el.innerHTML = `<div class="bar-head"><nav class="cats" role="tablist">${cats}</nav><div class="queue" data-queue></div></div><div class="cards">${cards}</div>`;
    if (this.last) this.update(this.last.state, this.last.now);
  }
}
