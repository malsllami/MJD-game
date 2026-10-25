// مسؤولية الملف: تنسيق الأرقام والمدد والتواريخ (الميلادي والهجري معًا) للعرض بالعربية
// File responsibility: Arabic display formatting for numbers, durations and dates (Gregorian + Hijri)

import { APP_CONFIG } from '../config/app.config';

const numberFormat = new Intl.NumberFormat(`ar-SA-u-nu-${APP_CONFIG.numberingSystem}`, { maximumFractionDigits: 0 });

/** تنسيق رقم صحيح بفواصل الآلاف / Formats an integer with thousands separators */
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/**
 * تنسيق مدة بالثواني إلى صيغة مختصرة: "45 ث" أو "3 د" أو "1 س 5 د"
 * Formats a duration in seconds as a short Arabic label
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${formatNumber(seconds)} ث`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${formatNumber(minutes)} د ${formatNumber(rest)} ث` : `${formatNumber(minutes)} د`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${formatNumber(hours)} س ${formatNumber(mins)} د` : `${formatNumber(hours)} س`;
}

/** التاريخ الميلادي والهجري (أم القرى) لتاريخ معيّن / Gregorian and Umm al-Qura Hijri dates */
export function formatDualDate(date: Date): { gregorian: string; hijri: string } {
  const ns = APP_CONFIG.numberingSystem;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  return {
    gregorian: new Intl.DateTimeFormat(`ar-SA-u-ca-gregory-nu-${ns}`, opts).format(date),
    hijri: new Intl.DateTimeFormat(`ar-SA-u-ca-islamic-umalqura-nu-${ns}`, opts).format(date),
  };
}
