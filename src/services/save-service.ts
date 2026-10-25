// مسؤولية الملف: حفظ تقدم اللاعب محليًا واسترجاعه، مع رفض الحفظ إن تغيّر شكل العالم
// File responsibility: saves and restores player progress locally, rejecting a save if the world shape changed

import type { GameState, WorldSettings } from '../core/types';

/** الإصدار 3: الطرق على حدود المربعات والمكامن المكتشفة / Format 3: roads on tile edges and discovered deposits */
const SAVE_KEY = 'nation-game:save:v3';

interface SaveFile {
  format: 3;
  worldSignature: string;
  savedAt: number;
  state: GameState;
}

/**
 * بصمة العالم: أي تغيير في إعدادات التوليد يغيّر مواقع التضاريس، فيصبح الحفظ القديم غير صالح
 * World signature: changing generation settings moves terrain, so an older save no longer fits
 */
export function worldSignature(w: WorldSettings): string {
  // gen2: مولّد القارة المنبسطة بالأحواض والسلاسل والبحيرات / gen2: the flat-continent generator with basins, ranges and lakes
  return ['gen2', w.seed, w.tilesX, w.tilesZ, w.vertsPerTile, w.seaLevel, w.heightScale, w.noiseScale, w.moistureScale, w.islandFalloff,
    w.flatZoneRadius, w.massifCount, w.massifRadius, w.lakeCount, w.lakeRadius].join('|');
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
      if (file.format !== 3 || !isState(file.state)) return { kind: 'none' };
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
    const file: SaveFile = { format: 3, worldSignature: this.signature, savedAt: Date.now(), state };
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
  return !!v && !!v.settlement && typeof v.population === 'number' && typeof v.stage === 'string' && typeof v.resources === 'object' && Array.isArray(v.buildings) && Array.isArray(v.roads) && Array.isArray(v.discovered) && Array.isArray(v.territory) && typeof v.lastTick === 'number';
}
