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
  /** كثافة الأشجار والصخور (1 = كاملة) / Tree and rock density (1 = full) */
  natureDensity: number;
  fogDensity: number;
  /** دقة خريطة مزج الأرض (عشب، تراب، تربة) بالبكسل / Ground blend map resolution (grass, dirt, soil) in pixels */
  groundResolution: number;
  /** أقصى عدد للسكان والعمال المتحركين الظاهرين قرب الكاميرا / Max moving residents and workers shown near the camera */
  maxPeople: number;
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
    /** تقريب حتى مستوى الشارع / Zoom down to street level */
    minRadius: 6,
    maxRadiusFactor: 1.15,
    startRadius: 60,
    /** على الجوال تبدأ الكاميرا أقرب حتى تملأ القرية الشاشة الصغيرة / On phones the camera starts closer so the village fills the small screen */
    startRadiusMobile: 34,
    /**
     * أبعد مسافة للكاميرا كنسبة من مدى الضباب (1 ÷ كثافته)، حتى لا يبيضّ المشهد عند الإبعاد
     * Farthest camera distance as a share of the fog range (1 ÷ its density), so the scene never washes out white when zooming out
     */
    fogClearance: 0.6,
    startBeta: 0.9,
    minBeta: 0.32,
    maxBeta: 1.35,
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
    low: { maxDevicePixelRatio: 1, shadowMapSize: 0, waterReflections: false, glow: false, natureDensity: 0.4, fogDensity: 0.0045, groundResolution: 1024, maxPeople: 12 },
    medium: { maxDevicePixelRatio: 1.5, shadowMapSize: 1024, waterReflections: true, glow: true, natureDensity: 0.7, fogDensity: 0.004, groundResolution: 2048, maxPeople: 28 },
    high: { maxDevicePixelRatio: 2, shadowMapSize: 2048, waterReflections: true, glow: true, natureDensity: 1, fogDensity: 0.0035, groundResolution: 2048, maxPeople: 48 },
  } satisfies Record<QualityLevel, QualityPreset>,
};
