// مسؤولية الملف: الثوابت التقنية فقط (لا بيانات أعمال) — مصدر التعريفات، الكاميرا، الجودة، التخطيط
// File responsibility: technical constants only (no business data) — source, camera, quality, layout

import type { DefinitionsSourceKind } from '../services/definitions-service';
import type { QualityLevel } from '../core/types';

/** إعدادات جودة الرسوم لكل مستوى / Render settings per quality level */
export interface QualityPreset {
  maxDevicePixelRatio: number;
  shadowMapSize: number;
  waterReflections: boolean;
  /** توهج الأضواء ليلًا / Night light glow */
  glow: boolean;
  fogDensity: number;
}

export const APP_CONFIG = {
  definitionsSource: 'sheets' as DefinitionsSourceKind,
  /** رابط تطبيق الويب المنتهي بـ /exec / Apps Script web app URL ending in /exec */
  apiUrl: 'https://script.google.com/macros/s/AKfycbzkBBBJoF7KUi5QSOj-Z519rchzEW34WnVWNOBH1hMrxJgMebsduILbMtvgJ6ZO12GD/exec',
  apiTimeoutMs: 10000,
  /** نظام الأرقام في العرض: arab (٠١٢) أو latn (012) / Display numbering system */
  numberingSystem: 'arab',
  /** نفس شرط التحول لتخطيط الجوال في main.css / Same mobile-layout condition as main.css */
  mobileLayoutQuery: '(max-width: 899px), (pointer: coarse) and (orientation: portrait)',
  camera: {
    minRadius: 22,
    maxRadiusFactor: 1.15,
    startRadius: 130,
    startBeta: 0.9,
    minBeta: 0.32,
    maxBeta: 1.2,
    keyPanSpeed: 0.9,
    rotateStep: Math.PI / 8,
    zoomStep: 0.18,
  },
  selection: {
    clickTolerancePx: 6,
  },
  radialMenu: {
    radiusDesktop: 92,
    radiusMobile: 84,
  },
  quality: {
    low: { maxDevicePixelRatio: 1, shadowMapSize: 0, waterReflections: false, glow: false, fogDensity: 0.0045 },
    medium: { maxDevicePixelRatio: 1.5, shadowMapSize: 1024, waterReflections: true, glow: true, fogDensity: 0.004 },
    high: { maxDevicePixelRatio: 2, shadowMapSize: 2048, waterReflections: true, glow: true, fogDensity: 0.0035 },
  } satisfies Record<QualityLevel, QualityPreset>,
};
