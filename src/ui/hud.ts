// مسؤولية الملف: هيكل واجهة القيادة — شريط الموارد العلوي، أدوات القيادة، الخريطة المصغرة، شريط البناء، الوزارات، أزرار الكاميرا،
// وعلى الجوال شريط سفلي يفتح الخريطة والوزارات والمزيد عند الطلب
// File responsibility: command HUD skeleton — top resource bar, command tools, minimap, build bar, ministries, camera buttons,
// and on phones a bottom dock opening the map, ministries and more on demand

import type { GameDefinitions, GameState } from '../core/types';
import { APP_CONFIG } from '../config/app.config';
import { formatDualDate, formatNumber } from '../utils/format';
import { esc } from '../utils/html';
import { ICON_SPRITE, icon } from './icons';

/** عناصر الواجهة التي تحتاجها بقية الوحدات / HUD elements other modules attach to */
export interface HudElements {
  ministries: HTMLElement;
  buildBar: HTMLElement;
  minimap: HTMLCanvasElement;
  toolNav: HTMLElement;
  drawer: HTMLElement;
  buildingPanel: HTMLElement;
  radial: HTMLElement;
  confirm: HTMLElement;
  labels: HTMLElement;
  toast: HTMLElement;
}

export interface HudActions {
  rotate(direction: 1 | -1): void;
  zoom(direction: 1 | -1): void;
}

/** لوحات الجوال التي يفتحها الشريط السفلي، واحدة في كل مرة / Phone panels the bottom dock opens, one at a time */
export const DOCK_PANELS = ['map-open', 'ministries-open', 'more-open'] as const;

/**
 * يبني هيكل الواجهة: الكمبيوتر (لوحة جانبية + شريط بناء سفلي) والجوال (شريط موارد علوي، وشريط سفلي بفئات البناء
 * وأزرار تفتح الخريطة والوزارات والمزيد عند الطلب)
 * Builds the HUD: desktop (side panel + bottom build bar) and phone (a top resource strip, and a bottom bar of build
 * categories with buttons opening the map, ministries and more on demand)
 */
export function createHud(root: HTMLElement, defs: GameDefinitions, actions: HudActions): HudElements {
  root.innerHTML = `${ICON_SPRITE}
    <header class="topbar glass">
      <div class="nation"><span class="flag"></span><span>${esc(defs.world.nationName)}</span></div>
      <div class="civic" data-civic></div>
      <div class="res" data-resources></div>
      <div class="clock" data-clock title="الوقت في الدولة"></div>
      <div class="dates" data-dates></div>
      <button type="button" class="text-btn" data-action="new-nation" title="حذف الدولة الحالية والبدء من اختيار الموقع">دولة جديدة</button>
      <button type="button" class="icon-btn panel-toggle" data-action="toggle-panel" aria-label="طي لوحة الوزارات أو إظهارها">${icon('panel')}</button>
    </header>

    <section class="ministries glass" data-ministries aria-label="لوحة الوزارات"></section>
    <section class="buildbar glass" data-buildbar aria-label="أدوات البناء"></section>
    <nav class="dock glass" aria-label="لوحات اللعبة">
      <button type="button" data-action="dock" data-panel="map-open" aria-pressed="false">الخريطة</button>
      <button type="button" data-action="dock" data-panel="ministries-open" aria-pressed="false">الوزارات</button>
      <button type="button" data-action="dock" data-panel="more-open" aria-pressed="false" aria-label="المزيد">${icon('more')}</button>
    </nav>
    <section class="more glass" aria-label="المزيد">
      <div class="dates" data-dates></div>
      <div class="more-row">
        <button type="button" class="icon-btn" data-action="rot-l" aria-label="تدوير لليسار" title="تدوير">${icon('rotl')}</button>
        <button type="button" class="icon-btn" data-action="rot-r" aria-label="تدوير لليمين" title="تدوير">${icon('rotr')}</button>
        <button type="button" class="text-btn" data-action="new-nation">دولة جديدة</button>
      </div>
    </section>

    <nav class="toolnav glass" data-toolnav aria-label="أدوات القيادة"></nav>
    <section class="drawer glass" data-drawer hidden></section>
    <section class="building-panel glass" data-bpanel aria-label="داخل المبنى" hidden></section>

    <div class="zoom glass" aria-label="الكاميرا">
      <button type="button" class="icon-btn" data-action="zoom-in" aria-label="تقريب" title="تقريب">${icon('plus')}</button>
      <button type="button" class="icon-btn" data-action="zoom-out" aria-label="إبعاد" title="إبعاد">${icon('minus')}</button>
      <button type="button" class="icon-btn" data-action="rot-l" aria-label="تدوير لليسار" title="تدوير">${icon('rotl')}</button>
      <button type="button" class="icon-btn" data-action="rot-r" aria-label="تدوير لليمين" title="تدوير">${icon('rotr')}</button>
    </div>

    <div class="mapbox glass">
      <div class="mini"><canvas data-minimap aria-label="الخريطة المصغرة"></canvas></div>
      <div class="map-tools">
        <button type="button" class="icon-btn" data-action="toggle-deposits" aria-label="إظهار المكامن المكتشفة أو إخفاؤها" aria-pressed="false" title="المكامن">${icon('stone')}</button>
        <button type="button" class="icon-btn" data-action="toggle-grid" aria-pressed="false" aria-label="إظهار شبكة المربعات أو إخفاؤها" title="الشبكة">${icon('grid')}</button>
        <button type="button" class="icon-btn" data-action="bulldoze" aria-label="هدم الطرق" title="هدم الطرق">${icon('demolish')}</button>
      </div>
    </div>

    <div class="labels" data-labels></div>
    <div class="radial" data-radial hidden></div>
    <div class="confirm-bar" data-confirmbar hidden></div>
    <div class="toast" data-toast hidden></div>`;

  const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const action = t.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'rot-l') actions.rotate(-1);
    else if (action === 'rot-r') actions.rotate(1);
    else if (action === 'zoom-in') actions.zoom(1);
    else if (action === 'zoom-out') actions.zoom(-1);
    else if (action === 'toggle-panel') root.classList.toggle('panel-collapsed');
    else if (action === 'dock') toggleDockPanel(root, t.closest<HTMLElement>('[data-panel]')!.dataset.panel!);
  });
  // على الشاشات الكبيرة تبدأ لوحة الوزارات مطوية لتبقى الخريطة في المركز / On large screens the ministries panel starts folded, keeping the map central
  if (!window.matchMedia(APP_CONFIG.mobileLayoutQuery).matches) root.classList.add('panel-collapsed');

  // التاريخ في الشريط العلوي، وعلى الجوال في «المزيد» / The date sits in the top bar, and on phones in "more"
  const renderDates = () => {
    const { gregorian, hijri } = formatDualDate(new Date());
    root.querySelectorAll('[data-dates]').forEach((el) => (el.innerHTML = `<span>${esc(gregorian)}</span><span>${esc(hijri)}</span>`));
  };
  renderDates();
  window.setInterval(renderDates, 60_000);

  return {
    ministries: q('[data-ministries]'),
    buildBar: q('[data-buildbar]'),
    minimap: q<HTMLCanvasElement>('[data-minimap]'),
    toolNav: q('[data-toolnav]'),
    drawer: q('[data-drawer]'),
    buildingPanel: q('[data-bpanel]'),
    radial: q('[data-radial]'),
    confirm: q('[data-confirmbar]'),
    labels: q('[data-labels]'),
    toast: q('[data-toast]'),
  };
}

/**
 * تحديث شريط الموارد: المخزون مقرّبًا للأسفل، وصافي الإنتاج في الدقيقة بإشارته إن وُجد
 * Refresh the resource bar: stock floored, plus signed net output per minute when non-zero
 */
export function renderResources(root: HTMLElement, defs: GameDefinitions, state: GameState, rates: Record<string, number>, caps: Record<string, number>): void {
  const el = root.querySelector<HTMLElement>('[data-resources]');
  if (!el) return;
  const html = defs.resources
    .map((r) => {
      const n = rates[r.id] ?? 0;
      const rate = n ? `<i class="${n > 0 ? 'pos' : 'neg'}">${n > 0 ? '+' : '−'}${formatNumber(Math.abs(n))}</i>` : '';
      const stock = Math.floor(state.resources[r.id] ?? 0);
      const cap = caps[r.id] ?? Infinity;
      // السعة تظهر حين تكون محدودة، وتتلون عند الامتلاء / Capacity shows when limited, coloured when full
      const capText = Number.isFinite(cap) ? `<small class="${stock >= cap ? 'full' : ''}">/${formatNumber(cap)}</small>` : '';
      return `<span title="${esc(r.name)}${Number.isFinite(cap) ? ` · السعة ${formatNumber(cap)}` : ''}" style="--c:${esc(r.color)}">${icon(r.icon)}<b>${formatNumber(stock)}</b>${capText}<small>${esc(r.name)}</small>${rate}</span>`;
    })
    .join('');
  if (el.dataset.html !== html) {
    el.dataset.html = html;
    el.innerHTML = html;
  }
}

/**
 * المرحلة والسكان والتقدم نحو المرحلة التالية
 * Stage, population and progress toward the next stage
 */
export function renderCivic(root: HTMLElement, stageName: string, population: number, capacity: number, next: { name: string; population: number } | null): void {
  const el = root.querySelector<HTMLElement>('[data-civic]');
  if (!el) return;
  const pop = Math.floor(population);
  const progress = next ? Math.min(100, Math.round((pop / next.population) * 100)) : 100;
  const goal = next ? `${formatNumber(pop)} / ${formatNumber(next.population)} لمرحلة ${esc(next.name)}` : 'أعلى مرحلة';
  const html = `<b class="stage-chip">${esc(stageName)}</b>
    <span class="pop" title="${goal}">${icon('pop')}<b>${formatNumber(pop)}</b><small>سعة ${formatNumber(capacity)}</small><i class="meter" style="--p:${progress}%"></i></span>`;
  if (el.dataset.html !== html) {
    el.dataset.html = html;
    el.innerHTML = html;
  }
}

/**
 * وقت اليوم في الدولة من جزء اليوم (0 منتصف الليل)، مع حالته: فجر، نهار، غروب، ليل
 * Time of day in the nation from the day fraction (0 = midnight), with its phase
 */
export function renderClock(root: HTMLElement, fraction: number): void {
  const el = root.querySelector<HTMLElement>('[data-clock]');
  if (!el) return;
  const minutes = Math.floor(fraction * 1440);
  const time = new Intl.DateTimeFormat(`ar-SA-u-nu-${APP_CONFIG.numberingSystem}`, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)));
  const phase = fraction < 0.22 || fraction >= 0.8 ? 'ليل' : fraction < 0.3 ? 'شروق' : fraction < 0.72 ? 'نهار' : 'غروب';
  const text = `${time} · ${phase}`;
  if (el.textContent !== text) el.textContent = text;
}

/**
 * فتح لوحة من الشريط السفلي أو إغلاقها؛ فتح واحدة يغلق الأخريين، وpanel فارغ يغلق الكل
 * Open or close a bottom-dock panel; opening one closes the others, and an empty panel closes them all
 */
export function toggleDockPanel(root: HTMLElement, panel: string): void {
  const open = !!panel && !root.classList.contains(panel);
  for (const p of DOCK_PANELS) root.classList.toggle(p, open && p === panel);
  root.querySelectorAll<HTMLElement>('[data-panel]').forEach((b) => b.setAttribute('aria-pressed', String(root.classList.contains(b.dataset.panel!))));
}
