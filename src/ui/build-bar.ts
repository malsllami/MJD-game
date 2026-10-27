// مسؤولية الملف: شريط البناء — تبويب "الكل" وفئات المباني، وبطاقات مصوّرة للمباني المفتوحة فقط بحالتها (متاح أو ينقصه موارد)، وطابور الإنشاء
// File responsibility: build bar — an "all" tab and categories, picture cards for unlocked buildings only with their state (available or short), and the queue

import { styleOf } from '../assets/catalog';
import { isRoad, isTorch, isUnderConstruction, isUnlocked, isWall, missingResources, PAVING_MODELS } from '../core/economy';
import type { BuildingDef, GameDefinitions, GameState } from '../core/types';
import { formatDuration, formatNumber } from '../utils/format';
import { esc } from '../utils/html';
import { icon } from './icons';

/** تبويب يعرض كل المباني / The tab showing every building */
const ALL = '*';

export class BuildBar {
  private category: string;
  /** البطاقات تظهر عند اختيار فئة فقط، فتبقى الخريطة ظاهرة / Cards show only once a category is chosen, keeping the map visible */
  private open = false;
  private armed: string | null = null;
  private last: { state: GameState; now: number } | null = null;
  /** المباني المفتوحة المعروضة حاليًا / The unlocked buildings currently shown */
  private unlocked = '';

  constructor(
    private readonly el: HTMLElement,
    private readonly defs: GameDefinitions,
    private readonly onPick: (b: BuildingDef) => void,
    /** صورة نمط المبنى / Picture of a building style */
    private readonly thumbnail: (style: string) => Promise<string>,
  ) {
    this.category = ALL;
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const cat = t.closest<HTMLButtonElement>('[data-cat]');
      const card = t.closest<HTMLButtonElement>('[data-building]');
      if (cat) {
        // الضغط على الفئة المفتوحة يطويها / Tapping the open category folds it
        this.open = !(this.open && this.category === cat.dataset.cat);
        this.category = cat.dataset.cat!;
        this.render();
      } else if (card) {
        const b = defs.buildings.find((x) => x.id === card.dataset.building);
        if (b) {
          this.onPick(b);
          this.setOpen(false);
        }
      }
    });
    this.render();
  }

  /** فتح البطاقات أو طيّها / Open or fold the cards */
  setOpen(open: boolean): void {
    this.open = open;
    this.el.dataset.open = String(open);
    this.el.querySelectorAll<HTMLElement>('[data-cat]').forEach((c) => c.setAttribute('aria-selected', String(open && c.dataset.cat === this.category)));
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
    // مبنى جديد فُتح يعيد بناء البطاقات / A newly unlocked building rebuilds the cards
    const unlocked = this.defs.buildings.filter((b) => isUnlocked(b, state, this.defs, now)).map((b) => b.id).join(',');
    if (unlocked !== this.unlocked) {
      this.unlocked = unlocked;
      this.render();
      return;
    }
    this.el.querySelectorAll<HTMLElement>('[data-building]').forEach((card) => {
      const b = this.defs.buildings.find((x) => x.id === card.dataset.building);
      if (!b) return;
      const short = missingResources(this.defs, state, b.cost);
      card.classList.toggle('short', !!short);
      card.title = [b.name, card.dataset.info ?? '', short ? `ينقص: ${short}` : 'متاح للبناء'].join('\n');
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
    const resourceIcon = new Map(this.defs.resources.map((r) => [r.id, r.icon]));
    // المقفل لا يظهر أصلًا؛ والفئة بلا مبانٍ مفتوحة لا تظهر / Locked buildings never show; a category with none open is hidden
    const open = new Set(this.unlocked.split(','));
    const available = this.defs.buildings.filter((b) => open.has(b.id));
    const cats = [{ id: ALL, name: 'الكل' }, ...this.defs.buildingCategories.filter((c) => available.some((b) => b.category === c.id))]
      .map((c) => `<button type="button" role="tab" data-cat="${esc(c.id)}" aria-selected="${c.id === this.category}">${esc(c.name)}</button>`)
      .join('');
    const list = (m: Record<string, number>) => Object.entries(m).map(([id, n]) => `${formatNumber(n)} ${esc(resourceName.get(id) ?? id)}`).join(' · ');
    // التكلفة رقائق بأيقونات الموارد / Cost as chips with resource icons
    const cost = (m: Record<string, number>) => Object.entries(m).map(([id, n]) => `<span title="${esc(resourceName.get(id) ?? id)}">${icon(resourceIcon.get(id) ?? id)}${formatNumber(n)}</span>`).join('');
    const shown = available.filter((b) => this.category === ALL || b.category === this.category);
    const cards = shown
      .map((b) => {
        const where = b.allowedTerrain.map((id) => terrainName.get(id) ?? id).join('، ');
        const effects = [
          b.housing ? `يسكنه ${formatNumber(b.housing)}` : '',
          Object.keys(b.production).length ? `+${list(b.production)} / د` : '',
          Object.keys(b.consumption).length ? `−${list(b.consumption)} / د` : '',
        ].filter(Boolean);
        // التفاصيل الكاملة في التلميح، وأهم أثر تحت الاسم / Full details in the tooltip, the main effect under the name
        const info = [`يُبنى على: ${where}`, formatDuration(b.buildSeconds), ...effects].join('\n');
        // ما يُرسم على الحواف أو الزوايا أو الأرض بأيقونة بدل صورة / What is drawn on edges, corners or the ground gets an icon instead of a picture
        const glyph = b.model === 'stream' ? 'water' : isWall(b) ? 'shield' : isTorch(b) ? 'fire' : PAVING_MODELS.has(b.model) ? 'map' : isRoad(b) ? 'road' : '';
        const picture = glyph ? `<span class="thumb road">${icon(glyph)}</span>` : `<span class="thumb"><img data-thumb="${esc(styleOf(b))}" alt="" hidden></span>`;
        return `<button type="button" class="card" data-building="${esc(b.id)}" aria-pressed="${this.armed === b.id}" data-info="${esc(info)}">
          ${picture}
          <b>${esc(b.name)}</b>
          <span class="cost">${cost(b.cost)}</span>
          ${effects.length ? `<small class="fx">${esc(effects[0])}</small>` : ''}
        </button>`;
      })
      .join('');
    this.el.innerHTML = `<div class="bar-head"><nav class="cats" role="tablist">${cats}</nav><div class="queue" data-queue></div></div><div class="cards">${cards}</div>`;
    this.el.querySelectorAll<HTMLImageElement>('img[data-thumb]').forEach((img) => {
      void this.thumbnail(img.dataset.thumb!).then((src) => {
        img.src = src;
        img.hidden = false;
      }).catch(() => undefined);
    });
    this.setOpen(this.open);
    if (this.last) this.update(this.last.state, this.last.now);
  }
}
