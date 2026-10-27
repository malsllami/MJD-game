// مسؤولية الملف: تشغيل ملفات Apps Script الحقيقية (gas/) داخل الاختبارات على ملف Google Sheets وهمي في الذاكرة
// File responsibility: runs the real Apps Script files (gas/) inside tests against an in-memory fake spreadsheet

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { assembleDefinitions, type RawTables } from '../core/definitions-assembler';
import type { GameDefinitions } from '../core/types';

type Cell = string | number | boolean;

/** ورقة وهمية تدعم القراءة والكتابة التي يستخدمها الكود / Fake sheet supporting the reads and writes the code uses */
export class FakeSheet {
  constructor(readonly name: string, public values: Cell[][] = []) {}
  getName() { return this.name; }
  getLastRow() { return this.values.length; }
  getLastColumn() { return this.values.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return Math.max(1000, this.values.length); }
  getRange(r: number, c: number, nr = 1, nc = 1) {
    const sheet = this;
    const chain = new Proxy({}, { get: (_t, p) => (p === 'getValues' ? getValues : p === 'setValues' ? setValues : p === 'setValue' ? setValue : () => chain) });
    function getValues() {
      return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sheet.values[r - 1 + i]?.[c - 1 + j] ?? ''));
    }
    function setValues(v: Cell[][]) {
      v.forEach((row, i) => row.forEach((cell, j) => {
        while (sheet.values.length < r + i) sheet.values.push([]);
        const target = sheet.values[r - 1 + i];
        while (target.length < c + j - 1) target.push('');
        target[c - 1 + j] = cell;
      }));
      return chain;
    }
    function setValue(v: Cell) { return setValues([[v]]); }
    return chain as { getValues: typeof getValues; setValues: typeof setValues; setValue: typeof setValue };
  }
  setRightToLeft() {}
  setFrozenRows() {}
  autoResizeColumns() {}
}

export class FakeSpreadsheet {
  readonly sheets = new Map<string, FakeSheet>();
  getSheetByName(name: string) { return this.sheets.get(name) ?? null; }
  insertSheet(name: string) {
    const s = new FakeSheet(name);
    this.sheets.set(name, s);
    return s;
  }
}

/** بيئة Apps Script كاملة فوق ملف وهمي / A full Apps Script environment over a fake spreadsheet */
export function loadGas(ss = new FakeSpreadsheet()) {
  const cache = new Map<string, string>();
  const props = new Map<string, string>();
  const noop = () => {};
  const chain: any = new Proxy(noop, { get: () => chain, apply: () => chain });
  const ctx = createContext({
    SpreadsheetApp: { openById: () => ss, newDataValidation: () => chain },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => chain },
    LockService: { getScriptLock: () => ({ waitLock: noop, releaseLock: noop }) },
    Logger: { log: noop },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k) ?? null,
        getAll: (ks: string[]) => Object.fromEntries(ks.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])),
        put: (k: string, v: string) => cache.set(k, v),
        putAll: (o: Record<string, string>) => Object.entries(o).forEach(([k, v]) => cache.set(k, v)),
        remove: (k: string) => cache.delete(k),
      }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }) },
  });
  const dir = join(import.meta.dirname, '../../gas');
  // const/let في المستوى الأعلى لا تصبح خصائص للسياق، فنجمع الملفات في نص واحد ونصدّر ما نحتاجه
  // Top-level const/let do not become context properties, so files are joined and needed names exported
  const source = readdirSync(dir).filter((f) => f.endsWith('.gs')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  runInContext(`${source}
;globalThis.__gas = { TABLES, SEED_ROWS, SEED_WORLD, WORLD_SETTINGS, SEED_BUILDING_COMMANDS, readTable_, convert_, getDefinitionsDelta_,
  cachedJson_, invalidateCache_, getChunked_, resetRequestMemo_, setupDatabase, addVillageProgression, addResourceBuildings,
  SEED_RESOURCE_PRODUCTION, setStartAmountsForTesting, TEST_START_AMOUNT, addWorldAndDeposits, applyCapitalScale, CAPITAL_SCALE,
  addFlatWorld, addPrimitiveEra, applyPrimitiveEra, PRIMITIVE_ERA, SEED_PRIMITIVE_IDS, applyCompactVillage, COMPACT_VILLAGE, addLivingEconomy, SEED_ECONOMY_IDS, addPlacementGuidance, addVillageLevels, applyForestFrontier, FOREST_FRONTIER, OPEN_WALLS, applyMenuLayout, SEED_MENU_IDS, addExpansionQuota, applyExpansionPools, addIrrigation };`, ctx);
  return { gas: (ctx as unknown as { __gas: any }).__gas, ss };
}

/** تعريفات اللعبة كما يقرؤها الخادم من الملف ثم تجمعها اللعبة / Definitions as served from the sheet and assembled by the game */
export function definitionsFrom(gas: any): GameDefinitions {
  gas.resetRequestMemo_();
  const delta = gas.getDefinitionsDelta_({});
  return assembleDefinitions(JSON.parse(JSON.stringify(delta.changed)) as RawTables, 'test');
}

/** تعريفات قاعدة بيانات جديدة بعد setupDatabase / Definitions of a fresh database after setupDatabase */
export function seedDefinitions(): GameDefinitions {
  const { gas } = loadGas();
  gas.setupDatabase();
  return definitionsFrom(gas);
}

/**
 * تعريفات بقواعد ما قبل مستويات القرية: بلا مبانٍ ابتدائية، ومبنى حكم بمربع واحد، وموارد البداية خارج القرية، ومستوى حكم لكل مرحلة،
 * والضم الفوري بدل قطع الغابة، وبلا برك ولا شرط خصوبة.
 * تُختبر بها القواعد الأساسية (الوضع والإنتاج والطرق) على قرية فارغة
 * Definitions with the rules before village levels: no starting buildings, a one-tile government building, starter resources outside
 * the village, one government level per stage, instant annexing instead of forest clearing, and no ponds or fertility rule. The core rules (placement, output, roads) are tested on an empty village with them
 */
export function classicDefinitions(): GameDefinitions {
  const defs = seedDefinitions();
  return {
    ...defs,
    world: { ...defs.world, governmentRadius: 0, starterDepositDistance: 0, clearingSeconds: 0, frontierPonds: 0, plainFarmPercent: 100 },
    // حدود القرية كما كانت قبل الغابة المحيطة / The village border as it was before the surrounding forest
    stages: defs.stages.map((st, i) => (i ? st : { ...st, territoryRadius: 6 })),
    startBuildings: [],
    governmentLevels: defs.stages.map((s, i) => ({
      level: i + 1, name: s.name, stage: s.id, population: s.population, requiredBuildings: s.requiredBuildings, upgradeCost: s.upgradeCost,
      maxBuildingLevel: 1, wallStyle: null, description: s.description, expansionParcels: null, expansionPool: s.id,
    })),
  };
}
