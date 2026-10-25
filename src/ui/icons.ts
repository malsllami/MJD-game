// مسؤولية الملف: مجموعة أيقونات SVG المضمّنة ودالة إدراجها بالمعرّف
// File responsibility: inline SVG icon sprite and a helper to reference icons by id

/** رموز الأيقونات؛ معرّفاتها تُستخدم في التعريفات (عمود "الأيقونة") / Icon symbols; ids are referenced by definitions */
export const ICON_SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-food" viewBox="0 0 16 16"><path fill="currentColor" d="M8 1c3 2 4 5 0 14C4 6 5 3 8 1z"/></symbol>
  <symbol id="i-wood" viewBox="0 0 16 16"><rect x="1" y="5" width="14" height="6" rx="3" fill="currentColor"/></symbol>
  <symbol id="i-stone" viewBox="0 0 16 16"><path fill="currentColor" d="M3 12l1-6 5-3 5 4-1 6z"/></symbol>
  <symbol id="i-iron" viewBox="0 0 16 16"><path fill="currentColor" d="M3 11h10l-2-5H5z"/></symbol>
  <symbol id="i-oil" viewBox="0 0 16 16"><path fill="currentColor" d="M8 1c3 5 5 7 5 9a5 5 0 0 1-10 0c0-2 2-4 5-9z"/></symbol>
  <symbol id="i-move" viewBox="0 0 16 16"><path fill="currentColor" d="M8 0l3 3H9v4h4V5l3 3-3 3V9H9v4h2l-3 3-3-3h2V9H3v2L0 8l3-3v2h4V3H5z"/></symbol>
  <symbol id="i-demolish" viewBox="0 0 16 16"><path fill="currentColor" d="M5 1h6v2h4v2H1V3h4zm-2 5h10l-1 9H4z"/></symbol>
  <symbol id="i-water" viewBox="0 0 16 16"><path fill="currentColor" d="M8 1c2 4 5 6 5 9a5 5 0 0 1-10 0c0-3 3-5 5-9zM5.5 10a2.5 2.5 0 0 0 2.5 2.5v-1A1.5 1.5 0 0 1 6.5 10z"/></symbol>
  <symbol id="i-power" viewBox="0 0 16 16"><path fill="currentColor" d="M9 1L3 9h4l-1 6 6-8H8z"/></symbol>
  <symbol id="i-gold" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor"/><circle cx="8" cy="8" r="3" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/></symbol>
  <symbol id="i-pop" viewBox="0 0 16 16"><circle cx="8" cy="5" r="3" fill="currentColor"/><path fill="currentColor" d="M2 15c0-4 3-6 6-6s6 2 6 6z"/></symbol>
  <symbol id="i-shield" viewBox="0 0 16 16"><path fill="currentColor" d="M8 1l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V3z"/></symbol>
  <symbol id="i-army" viewBox="0 0 16 16"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3 3l10 10M13 3L3 13"/></symbol>
  <symbol id="i-lab" viewBox="0 0 16 16"><path fill="currentColor" d="M6 1h4v5l4 8H2l4-8z"/></symbol>
  <symbol id="i-ally" viewBox="0 0 16 16"><circle cx="5" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="11" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/></symbol>
  <symbol id="i-build" viewBox="0 0 16 16"><path fill="currentColor" d="M2 14V7l6-5 6 5v7h-4v-4H6v4z"/></symbol>
  <symbol id="i-road" viewBox="0 0 16 16"><path fill="currentColor" d="M5 1h2v14H2zm4 0h2l3 14H9z"/></symbol>
  <symbol id="i-map" viewBox="0 0 16 16"><path fill="currentColor" d="M1 3l4-2 6 2 4-2v12l-4 2-6-2-4 2z"/></symbol>
  <symbol id="i-info" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path fill="currentColor" d="M7 7h2v5H7zM7 4h2v2H7z"/></symbol>
  <symbol id="i-up" viewBox="0 0 16 16"><path fill="currentColor" d="M8 1l6 7H10v7H6V8H2z"/></symbol>
  <symbol id="i-trade" viewBox="0 0 16 16"><path fill="currentColor" d="M1 5h10V2l4 4-4 4V7H1zm14 6H5v3l-4-4 4-4v3h10z"/></symbol>
  <symbol id="i-rotl" viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 8a5 5 0 1 0 2-4"/><path fill="currentColor" d="M2 1v5h5z"/></symbol>
  <symbol id="i-rotr" viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M13 8a5 5 0 1 1-2-4"/><path fill="currentColor" d="M14 1v5H9z"/></symbol>
  <symbol id="i-plus" viewBox="0 0 16 16"><path fill="currentColor" d="M7 2h2v5h5v2H9v5H7V9H2V7h5z"/></symbol>
  <symbol id="i-minus" viewBox="0 0 16 16"><path fill="currentColor" d="M2 7h12v2H2z"/></symbol>
  <symbol id="i-panel" viewBox="0 0 16 16"><path fill="currentColor" d="M1 2h14v12H1zm2 2v8h6V4z"/></symbol>
</svg>`;

/** وسم أيقونة بالمعرّف / Icon markup by id */
export function icon(id: string, cls = 'ico'): string {
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${id.replace(/[^a-z0-9_-]/gi, '')}"/></svg>`;
}
