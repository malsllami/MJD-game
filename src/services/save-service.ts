// مسؤولية الملف: حفظ تقدم اللاعب محليًا واسترجاعه، مع رفض الحفظ إن تغيّر شكل العالم
// File responsibility: saves and restores player progress locally, rejecting a save if the world shape changed

import type { GameState, WorldSettings } from '../core/types';

/** الإصدار 2: موقع القرية والسكان والمراحل / Format 2: settlement, population and stages */
const SAVE_KEY = 'nation-game:save:v2';

interface SaveFile {
  format: 2;
  worldSignature: string;
  savedAt: number;
  state: GameState;
}

/**
 * بصمة العالم: أي تغيير في إعدادات التوليد يغيّر مواقع التضاريس، فيصبح الحفظ القديم غير صالح
 * World signature: changing generation settings moves terrain, so an older save no longer fits
 */
export function worldSignature(w: WorldSettings): string {
  return [w.seed, w.tilesX, w.tilesZ, w.vertsPerTile, w.seaLevel, w.noiseScale, w.moistureScale, w.islandFalloff].join('|');
}

/** نتيجة التحميل / Load outcome */
export type LoadResult = { kind: 'none' } | { kind: 'loaded'; state: GameState } | { kind: 'world-changed' };

export class SaveService {
  constructor(private readonly signature: string) {}

  load(): LoadResult {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { kind: 'none' };
      const file = JSON.parse(raw) as SaveFile;
      if (file.format !== 2 || !isState(file.state)) return { kind: 'none' };
      if (file.worldSignature !== this.signature) return { kind: 'world-changed' };
      return { kind: 'loaded', state: file.state };
    } catch {
      return { kind: 'none' };
    }
  }

  /** مسح الحفظ / Delete the save */
  clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // التخزين محظور: لا يوجد ما يُمسح / Storage blocked: nothing to delete
    }
  }

  /** حفظ الحالة؛ يعيد false إن تعذّر التخزين / Save the state; false if storage is unavailable */
  save(state: GameState): boolean {
    const file: SaveFile = { format: 2, worldSignature: this.signature, savedAt: Date.now(), state };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(file));
      return true;
    } catch {
      return false;
    }
  }
}

/** تحقق بسيط من شكل الحالة المحفوظة / Basic shape check of a saved state */
function isState(s: unknown): s is GameState {
  const v = s as GameState;
  return !!v && !!v.settlement && typeof v.population === 'number' && typeof v.stage === 'string' && typeof v.resources === 'object' && Array.isArray(v.buildings) && Array.isArray(v.territory) && typeof v.lastTick === 'number';
}
