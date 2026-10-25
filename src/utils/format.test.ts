// اختبارات التنسيق / Formatting tests
import { describe, expect, it } from 'vitest';
import { formatDualDate, formatDuration, formatNumber } from './format';

describe('formatNumber', () => {
  it('يستخدم الأرقام العربية وفاصل الآلاف / uses Arabic digits and thousands separator', () => {
    expect(formatNumber(12480)).toBe('١٢٬٤٨٠');
  });
});

describe('formatDuration', () => {
  it('يعرض الثواني والدقائق والساعات / shows seconds, minutes and hours', () => {
    expect(formatDuration(45)).toBe('٤٥ ث');
    expect(formatDuration(180)).toBe('٣ د');
    expect(formatDuration(90)).toBe('١ د ٣٠ ث');
    expect(formatDuration(3900)).toBe('١ س ٥ د');
  });
});

describe('formatDualDate', () => {
  it('يعيد التاريخين الميلادي والهجري / returns both Gregorian and Hijri', () => {
    const { gregorian, hijri } = formatDualDate(new Date(Date.UTC(2026, 9, 25, 12)));
    expect(gregorian).toContain('أكتوبر');
    expect(hijri).toMatch(/هـ/);
  });
});
