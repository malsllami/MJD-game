// مسؤولية الملف: مصدر موحّد لتعريفات اللعبة، قابل للاستبدال لاحقًا (مثل خادم آخر عند تعدد اللاعبين)
// File responsibility: single source of game definitions, swappable later (e.g. another backend for multiplayer)

import type { GameDefinitions } from '../core/types';
import { SheetsDefinitionsSource } from './sheets-definitions-source';

/** أنواع مصادر التعريفات المدعومة / Supported definition source kinds */
export type DefinitionsSourceKind = 'sheets';

/** واجهة أي مصدر تعريفات / Contract every definitions source fulfils */
export interface DefinitionsSource {
  readonly kind: DefinitionsSourceKind;
  load(): Promise<GameDefinitions>;
}

/** ينشئ المصدر المطلوب حسب الإعدادات / Creates the configured source */
export function createDefinitionsSource(kind: DefinitionsSourceKind, apiUrl: string, timeoutMs: number): DefinitionsSource {
  switch (kind) {
    case 'sheets':
      if (!apiUrl) throw new Error('رابط Apps Script غير مضبوط في app.config.ts');
      return new SheetsDefinitionsSource(apiUrl, timeoutMs);
  }
}
