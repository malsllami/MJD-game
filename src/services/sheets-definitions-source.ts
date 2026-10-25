// مسؤولية الملف: تحميل التعريفات من Google Sheets عبر Apps Script بمزامنة تزايدية، مع نسخة محلية للعمل دون اتصال
// File responsibility: loads definitions from Google Sheets via Apps Script with incremental sync and an offline local copy

import { assembleDefinitions, RAW_TABLE_IDS, type RawTables } from '../core/definitions-assembler';
import type { GameDefinitions } from '../core/types';
import type { DefinitionsSource } from './definitions-service';

const STORAGE_KEY = 'nation-game:definitions';

/** النسخة المحلية: أرقام الإصدار والجداول / Local copy: versions and tables */
interface LocalCopy {
  versions: Record<string, number>;
  tables: Partial<RawTables>;
}

interface ApiResponse {
  ok: boolean;
  error?: string;
  data?: { versions: Record<string, number>; changed: Partial<RawTables> };
}

export class SheetsDefinitionsSource implements DefinitionsSource {
  readonly kind = 'sheets' as const;

  constructor(private readonly apiUrl: string, private readonly timeoutMs: number) {}

  /**
   * يرسل أرقام إصدار النسخة المحلية فيعود الخادم بالجداول المتغيرة فقط؛ وعند تعذّر الاتصال تُستخدم النسخة المحلية
   * Sends local versions so the server returns only changed tables; falls back to the local copy when offline
   */
  async load(): Promise<GameDefinitions> {
    const local = readLocal();
    try {
      const fresh = await this.fetchChanges(local.versions);
      const merged: LocalCopy = { versions: fresh.versions, tables: { ...local.tables, ...fresh.changed } };
      writeLocal(merged);
      return toDefinitions(merged);
    } catch (err) {
      if (hasAllTables(local)) {
        console.warn('تعذّر الاتصال بقاعدة البيانات، تُستخدم آخر نسخة محفوظة', err);
        return toDefinitions(local);
      }
      throw err;
    }
  }

  private async fetchChanges(have: Record<string, number>): Promise<NonNullable<ApiResponse['data']>> {
    const url = `${this.apiUrl}?action=definitions&have=${encodeURIComponent(JSON.stringify(have))}`;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`رد غير متوقع من الخادم: ${res.status}`);
      const body = (await res.json()) as ApiResponse;
      if (!body.ok || !body.data) throw new Error(body.error ?? 'رد غير صالح من الخادم');
      return body.data;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** تحويل النسخة المحلية إلى تعريفات؛ رقم الإصدار يجمع إصدارات الجداول / Local copy → definitions */
function toDefinitions(copy: LocalCopy): GameDefinitions {
  if (!hasAllTables(copy)) throw new Error('جداول قاعدة البيانات ناقصة؛ شغّل آخر دالة إضافة في Apps Script ثم انشر إصدارًا جديدًا');
  const version = RAW_TABLE_IDS.map((id) => `${id}:${copy.versions[id] ?? 0}`).join(',');
  return assembleDefinitions(copy.tables as RawTables, version);
}

function hasAllTables(copy: LocalCopy): boolean {
  return RAW_TABLE_IDS.every((id) => copy.tables[id] !== undefined);
}

/** قراءة النسخة المحلية بأمان (قد يكون التخزين محظورًا) / Safe local read (storage may be blocked) */
function readLocal(): LocalCopy {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LocalCopy;
  } catch {
    // التخزين غير متاح: نكمل بدون نسخة محلية / Storage unavailable: continue without a local copy
  }
  return { versions: {}, tables: {} };
}

function writeLocal(copy: LocalCopy): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
  } catch {
    // التخزين ممتلئ أو محظور: تعمل اللعبة لكن دون نسخة للعمل دون اتصال / Full or blocked: game runs without offline copy
  }
}
