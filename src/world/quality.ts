// مسؤولية الملف: تحديد مستوى جودة الرسوم المناسب للجهاز
// File responsibility: resolves the graphics quality level for the current device

import { APP_CONFIG, type QualityPreset } from '../config/app.config';
import type { QualityLevel } from '../core/types';

/**
 * يحوّل الإعداد (auto أو مستوى محدد) إلى مستوى فعلي وإعداداته
 * Resolves the setting ("auto" or explicit) to a concrete level and its preset
 */
export function resolveQuality(setting: QualityLevel | 'auto'): { level: QualityLevel; preset: QualityPreset } {
  const level = setting === 'auto' ? detectQuality() : setting;
  return { level, preset: APP_CONFIG.quality[level] };
}

/** تقدير بسيط لقوة الجهاز: أجهزة اللمس ضعيفة الذاكرة = منخفض / Simple device capability estimate */
function detectQuality(): QualityLevel {
  const touch = navigator.maxTouchPoints > 0;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (touch && memory <= 4) return 'low';
  if (touch) return 'medium';
  return 'high';
}
