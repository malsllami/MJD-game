// مسؤولية الملف: أدوات عرض مشتركة للوحات — جدول بصف أول ثابت ملوّن، ورقم بإشارته
// File responsibility: shared panel render helpers — a table with a sticky coloured header, and a signed number

import { formatNumber } from '../utils/format';
import { esc } from '../utils/html';

/** رقم بإشارة: +5 أو −3 أو — / Signed number: +5, −3 or — */
export function signed(n: number): string {
  if (!n) return '—';
  return `<span class="${n > 0 ? 'pos' : 'neg'}">${n > 0 ? '+' : '−'}${formatNumber(Math.abs(n))}</span>`;
}

/** جدول بصف أول ثابت وملوّن / Table with a sticky coloured header row */
export function table(headers: string[], rows: string[][]): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="tbox"><table class="gt"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
