// اختبارات كود Apps Script الحقيقي على ملف وهمي: الأسماء، البيانات الأولية، الكاش، والإضافة على قاعدة بيانات قائمة
// Tests of the real Apps Script code on a fake spreadsheet: names, seed data, cache, and the addition on an existing database
import { describe, expect, it } from 'vitest';
import { definitionsFrom, FakeSheet, FakeSpreadsheet, loadGas, seedDefinitions } from '../test/gas-harness';

/** حالة قاعدة البيانات كما أنشأها الإعداد الأول قبل إضافة تطور القرية / The database as the first setup created it */
const FIRST_SETUP = {
  worldKeys: 15,
  resources: ['food', 'wood', 'stone', 'iron', 'oil', 'gold'],
  categories: ['economy', 'housing', 'transport', 'security', 'military', 'science'],
  buildings: 12,
  costs: 17,
  newTables: ['stages', 'buildingProduction', 'buildingConsumption'],
  newBuildingColumns: ['المرحلة المطلوبة', 'السكان المضافون', 'النموذج', 'يتطلب طريق'],
};

/** بناء ملف بحالة الإعداد الأول من البيانات الأولية الحالية / Build a first-setup spreadsheet from today's seed */
function firstSetupSpreadsheet(gas: any): FakeSpreadsheet {
  const ss = new FakeSpreadsheet();
  for (const table of gas.TABLES) {
    if (FIRST_SETUP.newTables.includes(table.id)) continue;
    let header: string[] = table.columns.map((c: { name: string }) => c.name);
    let rows: Record<string, unknown>[] = gas.SEED_ROWS[table.id] ?? [];
    if (table.id === 'world') {
      rows = gas.WORLD_SETTINGS.slice(0, FIRST_SETUP.worldKeys).map((s: any) => ({ 'المفتاح': s.key, 'القيمة': gas.SEED_WORLD[s.field], 'الوصف': s.description }));
    }
    if (table.id === 'resources') rows = rows.filter((r) => FIRST_SETUP.resources.includes(r['المعرف'] as string));
    if (table.id === 'buildingCategories') rows = rows.filter((r) => FIRST_SETUP.categories.includes(r['المعرف'] as string));
    if (table.id === 'buildings') {
      header = header.filter((h) => !FIRST_SETUP.newBuildingColumns.includes(h));
      rows = rows.slice(0, FIRST_SETUP.buildings);
    }
    if (table.id === 'buildingCosts') rows = rows.slice(0, FIRST_SETUP.costs);
    if (table.id === 'contextCommands') rows = rows.filter((r) => r['نوع العنصر'] !== 'building');
    ss.sheets.set(table.name, new FakeSheet(table.name, [header, ...rows.map((r) => header.map((h) => (r[h] as string) ?? ''))]));
  }
  return ss;
}

describe('Apps Script: البيانات الأولية / seed', () => {
  const { gas } = loadGas();
  const defs = seedDefinitions();

  it('أسماء الجداول والأعمدة والإعدادات عربية بمسافة واحدة دون رموز / names are Arabic with single spaces', () => {
    const valid = /^[؀-ۿ]+( [؀-ۿ]+)*$/;
    for (const t of gas.TABLES) {
      expect(t.name).toMatch(valid);
      for (const c of t.columns) expect(c.name).toMatch(valid);
    }
    for (const s of gas.WORLD_SETTINGS) expect(s.key).toMatch(valid);
  });

  it('كل حقل في البيانات الأولية له عمود معرّف / every seed field has a column', () => {
    for (const t of gas.TABLES) {
      if (t.kind === 'settings') continue;
      const names = new Set(t.columns.map((c: { name: string }) => c.name));
      for (const row of gas.SEED_ROWS[t.id]) for (const key of Object.keys(row)) expect(names.has(key), `${t.name}: ${key}`).toBe(true);
    }
  });

  it('المراجع بين الجداول سليمة / cross-table references are valid', () => {
    const stages = new Set(defs.stages.map((s) => s.id));
    const resources = new Set(defs.resources.map((r) => r.id));
    const categories = new Set(defs.buildingCategories.map((c) => c.id));
    const terrain = new Set(defs.terrain.map((t) => t.id));
    for (const b of defs.buildings) {
      expect(stages.has(b.stage), `${b.id} stage`).toBe(true);
      expect(categories.has(b.category), `${b.id} category`).toBe(true);
      for (const t of b.allowedTerrain) expect(terrain.has(t), `${b.id} terrain ${t}`).toBe(true);
      for (const r of [...Object.keys(b.cost), ...Object.keys(b.production), ...Object.keys(b.consumption)]) expect(resources.has(r), `${b.id} ${r}`).toBe(true);
    }
    expect(resources.has(defs.world.annexResource)).toBe(true);
  });

  it('المراحل مرتبة تصاعديًا والأولى بلا شرط سكان / stages ascend and the first needs no population', () => {
    expect(defs.stages[0].population).toBe(0);
    for (let i = 1; i < defs.stages.length; i++) expect(defs.stages[i].population).toBeGreaterThan(defs.stages[i - 1].population);
  });

  it('يقبل الأرقام العربية والفواصل / accepts Arabic digits and separators', () => {
    expect(gas.convert_('١٬٢٥٠', 'number')).toBe(1250);
    expect(gas.convert_('٠٫٤٢', 'number')).toBe(0.42);
    expect(gas.convert_('plain، coast', 'list')).toEqual(['plain', 'coast']);
  });
});

describe('Apps Script: إضافة تطور القرية على قاعدة بيانات قائمة / village addition on an existing database', () => {
  const fresh = seedDefinitions();

  function migrated() {
    const base = loadGas();
    const ss = firstSetupSpreadsheet(base.gas);
    // تعديل يدوي من المدير قبل الإضافة؛ يجب ألا يُلمس / A manual admin edit before the addition; must stay untouched
    const buildings = ss.sheets.get('المباني')!;
    const nameCol = buildings.values[0].indexOf('الاسم');
    buildings.values[1][nameCol] = 'مزرعة القمح';
    const { gas } = loadGas(ss);
    return { gas, ss };
  }

  it('سلسلة الإضافات كاملة تطابق قاعدة بيانات جديدة، مع بقاء التعديل اليدوي / the full chain matches a fresh database and keeps the manual edit', () => {
    const { gas } = migrated();
    gas.addVillageProgression();
    gas.addResourceBuildings();
    gas.addWorldAndDeposits();
    gas.applyCapitalScale();
    gas.addFlatWorld();
    gas.addPrimitiveEra();
    gas.applyPrimitiveEra();
    gas.applyCompactVillage();
    gas.applyForestFrontier();
    const defs = definitionsFrom(gas);
    expect(defs.buildings.find((b) => b.id === 'farm')!.name).toBe('مزرعة القمح');
    const normalise = (d: typeof defs) => ({ ...d, buildings: d.buildings.map((b) => ({ ...b, name: b.id === 'farm' ? '' : b.name })) });
    expect(normalise(defs)).toEqual(normalise(fresh));
  });

  it('تشغيلها مرتين لا يكرر أي صف / running twice adds no duplicate rows', () => {
    const { gas, ss } = migrated();
    gas.addVillageProgression();
    const sizes = [...ss.sheets.values()].map((s) => s.values.length);
    gas.addVillageProgression();
    expect([...ss.sheets.values()].map((s) => s.values.length)).toEqual(sizes);
  });
});

describe('Apps Script: إضافة مباني الموارد على قاعدة بيانات قائمة / resource buildings addition on an existing database', () => {
  const fresh = seedDefinitions();

  /** قاعدة بيانات بعد إضافة تطور القرية وقبل مباني الموارد (حالة ملف المدير الآن) / The DB after the village addition, before resources */
  function beforeResources() {
    const { gas, ss } = loadGas();
    gas.setupDatabase();
    const ids: string[] = gas.SEED_RESOURCE_PRODUCTION.map((p: string[]) => p[0]);
    const drop = (sheetName: string, column: string) => {
      const sheet = ss.sheets.get(sheetName)!;
      const c = sheet.values[0].indexOf(column);
      sheet.values = sheet.values.filter((row, i) => i === 0 || !ids.includes(row[c] as string));
    };
    drop('المباني', 'المعرف');
    drop('تكاليف المباني', 'معرف المبنى');
    drop('إنتاج المباني', 'معرف المبنى');
    drop('استهلاك المباني', 'معرف المبنى');
    const world = ss.sheets.get('إعدادات العالم')!;
    world.values = world.values.filter((row) => row[0] !== 'حجم قطعة الضم');
    return { gas: loadGas(ss).gas, ss };
  }

  it('الناتج يطابق قاعدة بيانات جديدة / result matches a fresh database', () => {
    const { gas, ss } = beforeResources();
    expect(ss.sheets.get('المباني')!.values.some((row) => row.includes('sawmill'))).toBe(false);
    gas.addResourceBuildings();
    expect(definitionsFrom(gas)).toEqual(fresh);
  });

  it('قبل الإضافة تعمل اللعبة بالسلوك السابق (ضم مربع واحد) / before the addition the game keeps the previous behaviour', () => {
    const { gas } = beforeResources();
    expect(definitionsFrom(gas).world.annexBlockSize).toBe(1);
  });

  it('تشغيلها مرتين لا يكرر أي صف / running twice adds no duplicate rows', () => {
    const { gas, ss } = beforeResources();
    gas.addResourceBuildings();
    const sizes = [...ss.sheets.values()].map((s) => s.values.length);
    gas.addResourceBuildings();
    expect([...ss.sheets.values()].map((s) => s.values.length)).toEqual(sizes);
  });

  it('أداة التجربة ترفع الكمية الابتدائية لكل الموارد / the testing tool raises every start amount', () => {
    const { gas } = loadGas();
    gas.setupDatabase();
    gas.setStartAmountsForTesting();
    expect(definitionsFrom(gas).resources.every((r) => r.startAmount === gas.TEST_START_AMOUNT)).toBe(true);
  });
});

describe('Apps Script: إضافة العالم والمكامن ومقياس العاصمة / world and deposits addition, capital scale', () => {
  const fresh = seedDefinitions();

  /** قاعدة بيانات قبل إضافة العالم والمكامن وبالمقياس القديم / The DB before the world addition, at the old scale */
  function beforeWorld() {
    const { gas, ss } = loadGas();
    gas.setupDatabase();
    const newResources = ['copper', 'silver'];
    const newBuildings = ['copper_prospector', 'silver_prospector'];
    const keep = (sheetName: string, column: string, drop: string[]) => {
      const sheet = ss.sheets.get(sheetName)!;
      const c = sheet.values[0].indexOf(column);
      sheet.values = sheet.values.filter((row, i) => i === 0 || !drop.includes(row[c] as string));
    };
    keep('الموارد', 'المعرف', newResources);
    keep('المباني', 'المعرف', newBuildings);
    keep('تكاليف المباني', 'معرف المبنى', newBuildings);
    keep('إنتاج المباني', 'معرف المبنى', newBuildings);
    ss.sheets.delete('أنواع المكامن');
    const buildings = ss.sheets.get('المباني')!;
    const depCol = buildings.values[0].indexOf('يتطلب مكمن');
    buildings.values = buildings.values.map((row) => row.filter((_, i) => i !== depCol));
    const world = ss.sheets.get('إعدادات العالم')!;
    const newKeys = ['نصف قطر المنطقة المسطحة', 'عدد السلاسل الجبلية', 'نصف قطر السلسلة الجبلية', 'عدد البحيرات', 'نصف قطر البحيرة', 'نطاق الاكتشاف', 'نطاق مسح الموارد', 'مورد المسح', 'تكلفة مسح الموارد', 'اسم مبنى الحكم'];
    world.values = world.values.filter((row) => !newKeys.includes(row[0] as string));
    // المقياس القديم / The old scale
    world.values.forEach((row) => { if (row[0] === 'عدد المربعات أفقيا' || row[0] === 'عدد المربعات عموديا') row[1] = 64; });
    const stages = ss.sheets.get('مراحل التطور')!;
    const rc = stages.values[0].indexOf('نصف قطر الحدود');
    stages.values.slice(1).forEach((row) => { row[rc] = 3; });
    return { gas: loadGas(ss).gas, ss };
  }

  it('الإضافة ثم المقياس تطابقان قاعدة بيانات جديدة / the addition then the scale match a fresh database', () => {
    const { gas } = beforeWorld();
    gas.addWorldAndDeposits();
    gas.applyCapitalScale();
    gas.applyCompactVillage();
    gas.applyForestFrontier();
    expect(definitionsFrom(gas)).toEqual(fresh);
  });

  it('الإضافة وحدها لا تغيّر حجم الخريطة ولا حدود المراحل / the addition alone keeps map size and stage borders', () => {
    const { gas } = beforeWorld();
    gas.addWorldAndDeposits();
    const defs = definitionsFrom(gas);
    expect(defs.world.tilesX).toBe(64);
    expect(defs.stages.every((s) => s.territoryRadius === 3)).toBe(true);
    expect(defs.deposits.length).toBe(fresh.deposits.length);
  });

  it('تشغيل الإضافة مرتين لا يكرر أي صف / running the addition twice adds no duplicate rows', () => {
    const { gas, ss } = beforeWorld();
    gas.addWorldAndDeposits();
    const sizes = [...ss.sheets.values()].map((s) => s.values.length);
    gas.addWorldAndDeposits();
    expect([...ss.sheets.values()].map((s) => s.values.length)).toEqual(sizes);
  });
});

describe('Apps Script: العالم المستوي والعصر البدائي / flat world and primitive era', () => {
  const fresh = seedDefinitions();
  const rowsOf = (ss: FakeSpreadsheet, name: string) => ss.sheets.get(name)!;
  const col = (ss: FakeSpreadsheet, name: string, column: string) => rowsOf(ss, name).values[0].indexOf(column);

  /** قاعدة بيانات قبل الإضافتين: بلا نوع العالم ولا البئر والخيمة، والمباني الحديثة في القرية / The DB before both additions */
  function before() {
    const { gas, ss } = loadGas();
    gas.setupDatabase();
    const world = rowsOf(ss, 'إعدادات العالم');
    world.values = world.values.filter((row) => row[0] !== 'نوع العالم');
    for (const name of ['المباني', 'تكاليف المباني', 'إنتاج المباني', 'استهلاك المباني']) {
      const sheet = rowsOf(ss, name);
      const c = sheet.values[0].indexOf(name === 'المباني' ? 'المعرف' : 'معرف المبنى');
      sheet.values = sheet.values.filter((row, i) => i === 0 || !gas.SEED_PRIMITIVE_IDS.includes(row[c] as string));
    }
    const buildings = rowsOf(ss, 'المباني');
    const idCol = col(ss, 'المباني', 'المعرف');
    const stageCol = col(ss, 'المباني', 'المرحلة المطلوبة');
    buildings.values.slice(1).forEach((row) => { if (gas.PRIMITIVE_ERA.buildingStages[row[idCol] as string]) row[stageCol] = 'village'; });
    const stages = rowsOf(ss, 'مراحل التطور');
    stages.values[1][col(ss, 'مراحل التطور', 'الوصف')] = 'بداية الدولة: المنازل والطرق والماء والكهرباء والزراعة والسوق';
    return { gas: loadGas(ss).gas, ss };
  }

  it('الخادم القديم يُعامل كقارة، والإضافة تجعل العالم مستويًا / an old server is a continent; the addition makes it flat', () => {
    const { gas } = before();
    expect(definitionsFrom(gas).world.worldMode).toBe('continent');
    gas.addFlatWorld();
    expect(definitionsFrom(gas).world.worldMode).toBe('flat');
  });

  it('إضافة البئر والخيمة لا تنقل أي مبنى / adding the well and tent moves no building', () => {
    const { gas } = before();
    gas.addPrimitiveEra();
    const defs = definitionsFrom(gas);
    expect(defs.buildings.map((b) => b.id)).toEqual(expect.arrayContaining(['well', 'tent']));
    expect(defs.buildings.find((b) => b.id === 'power_plant')!.stage).toBe('village');
  });

  it('الإضافتان ثم التعديل تطابق قاعدة بيانات جديدة / both additions then the edit match a fresh database', () => {
    const { gas } = before();
    gas.addFlatWorld();
    gas.addPrimitiveEra();
    gas.applyPrimitiveEra();
    expect(definitionsFrom(gas)).toEqual(fresh);
  });

  it('تشغيل الكل مرتين لا يكرر ولا يغير شيئًا / running everything twice duplicates or changes nothing', () => {
    const { gas, ss } = before();
    const runAll = () => { gas.addFlatWorld(); gas.addPrimitiveEra(); gas.applyPrimitiveEra(); };
    runAll();
    const snapshot = JSON.stringify([...ss.sheets.values()].map((s) => s.values));
    runAll();
    expect(JSON.stringify([...ss.sheets.values()].map((s) => s.values))).toBe(snapshot);
  });
});

describe('Apps Script: الاقتصاد الحي / living economy', () => {
  const fresh = seedDefinitions();

  /** قاعدة بيانات قبل الاقتصاد الحي: بلا جداوله وأعمدته ومبانيه وإعداداته / The DB before the living economy */
  function beforeEconomy() {
    const { gas, ss } = loadGas();
    gas.setupDatabase();
    for (const name of ['المهن', 'سعة المخازن', 'أسعار السوق']) ss.sheets.delete(name);
    const dropColumns = (sheetName: string, columns: string[]) => {
      const sheet = ss.sheets.get(sheetName)!;
      const idx = columns.map((c) => sheet.values[0].indexOf(c)).filter((i) => i >= 0);
      sheet.values = sheet.values.map((row) => row.filter((_, i) => !idx.includes(i)));
    };
    dropColumns('المباني', ['المهنة', 'عدد العمال', 'السكان المطلوبون', 'المباني المطلوبة']);
    dropColumns('الموارد', ['السعة الأساسية']);
    dropColumns('مراحل التطور', ['المباني المطلوبة', 'تكلفة الترقية']);
    for (const [name, column] of [['المباني', 'المعرف'], ['تكاليف المباني', 'معرف المبنى'], ['استهلاك المباني', 'معرف المبنى']]) {
      const sheet = ss.sheets.get(name)!;
      const c = sheet.values[0].indexOf(column);
      sheet.values = sheet.values.filter((row, i) => i === 0 || !gas.SEED_ECONOMY_IDS.includes(row[c] as string));
    }
    const world = ss.sheets.get('إعدادات العالم')!;
    world.values = world.values.filter((row) => row[0] !== 'مبنى السوق' && row[0] !== 'مبنى التطوير');
    return { gas: loadGas(ss).gas, ss };
  }

  it('الخادم الأقدم يعمل بلا مهن ولا سعة ولا أسعار / an older server runs with no trades, capacity or prices', () => {
    const defs = definitionsFrom(beforeEconomy().gas);
    expect(defs.professions).toEqual([]);
    expect(defs.marketPrices).toEqual([]);
    expect(defs.resources.every((r) => r.baseCapacity === null)).toBe(true);
    expect(defs.buildings.every((b) => b.workers === 0 && !b.profession)).toBe(true);
  });

  it('الإضافة تطابق قاعدة بيانات جديدة / the addition matches a fresh database', () => {
    const { gas } = beforeEconomy();
    gas.addLivingEconomy();
    expect(definitionsFrom(gas)).toEqual(fresh);
  });

  it('تشغيلها مرتين لا يكرر ولا يغير شيئًا / running it twice duplicates or changes nothing', () => {
    const { gas, ss } = beforeEconomy();
    gas.addLivingEconomy();
    const snapshot = JSON.stringify([...ss.sheets.values()].map((s) => s.values));
    gas.addLivingEconomy();
    expect(JSON.stringify([...ss.sheets.values()].map((s) => s.values))).toBe(snapshot);
  });

  it('لا تمس قيمة كتبها المدير / never touches a value the admin wrote', () => {
    const { gas, ss } = beforeEconomy();
    gas.addLivingEconomy();
    const sheet = ss.sheets.get('المباني')!;
    const c = sheet.values[0].indexOf('عدد العمال');
    const farmRow = sheet.values.findIndex((r) => r[0] === 'farm');
    sheet.values[farmRow][c] = 9;
    const again = loadGas(ss).gas;
    again.addLivingEconomy();
    expect(definitionsFrom(again).buildings.find((b) => b.id === 'farm')!.workers).toBe(9);
  });
});

describe('Apps Script: توجيه البناء / placement guidance', () => {
  const fresh = seedDefinitions();

  /** قاعدة بيانات قبل الإضافة: بلا عمود منطقة الاقتراح ولا إعدادات المناطق / A database before the addition */
  function beforeGuidance() {
    const { gas, ss } = loadGas();
    gas.setupDatabase();
    const sheet = ss.sheets.get('المباني')!;
    const c = sheet.values[0].indexOf('منطقة الاقتراح');
    sheet.values = sheet.values.map((row) => row.filter((_, i) => i !== c));
    const keys = ['نصف قطر المنطقة الإدارية', 'نصف قطر المنطقة السكنية', 'بعد الورش عن الطريق'];
    const world = ss.sheets.get('إعدادات العالم')!;
    world.values = world.values.filter((row) => !keys.includes(row[0] as string));
    return { gas: loadGas(ss).gas, ss };
  }

  it('الخادم الأقدم يعمل بلا اقتراحات / an older server runs with no suggestions', () => {
    const defs = definitionsFrom(beforeGuidance().gas);
    expect(defs.buildings.every((b) => b.zone === null)).toBe(true);
    expect(defs.world.residentialZoneRadius).toBe(0);
  });

  it('الإضافة تطابق قاعدة بيانات جديدة / the addition matches a fresh database', () => {
    const { gas } = beforeGuidance();
    gas.addPlacementGuidance();
    expect(definitionsFrom(gas)).toEqual(fresh);
    expect(fresh.buildings.find((b) => b.id === 'houses')!.zone).toBe('residential');
    expect(fresh.buildings.find((b) => b.id === 'road')!.zone).toBeNull();
  });

  it('تشغيلها مرتين لا يغير شيئًا ولا تمس قيمة كتبها المدير / re-running changes nothing and keeps admin values', () => {
    const { gas, ss } = beforeGuidance();
    gas.addPlacementGuidance();
    const sheet = ss.sheets.get('المباني')!;
    const c = sheet.values[0].indexOf('منطقة الاقتراح');
    sheet.values[sheet.values.findIndex((r) => r[0] === 'farm')][c] = 'industrial';
    const snapshot = JSON.stringify([...ss.sheets.values()].map((s) => s.values));
    const again = loadGas(ss).gas;
    again.addPlacementGuidance();
    expect(JSON.stringify([...ss.sheets.values()].map((s) => s.values))).toBe(snapshot);
    expect(definitionsFrom(again).buildings.find((b) => b.id === 'farm')!.zone).toBe('industrial');
  });
});

describe('Apps Script: مستويات القرية / village levels', () => {
  const fresh = seedDefinitions();

  /** قاعدة بيانات قبل الإضافة: بلا جداول المستويات والمباني الابتدائية ولا إعداديها / A database before the addition */
  function beforeLevels() {
    const { gas, ss } = loadGas();
    gas.setupDatabase();
    for (const name of ['مستويات الحكم', 'مستويات المباني', 'المباني الابتدائية']) ss.sheets.delete(name);
    const world = ss.sheets.get('إعدادات العالم')!;
    world.values = world.values.filter((row) => row[0] !== 'نصف قطر مجمع الحكم' && row[0] !== 'بعد موارد البداية');
    return { gas: loadGas(ss).gas, ss };
  }

  it('الخادم الأقدم: مستوى لكل مرحلة، بلا مبانٍ ابتدائية ولا مجمع / an older server: a level per stage, no starting buildings or compound', () => {
    const defs = definitionsFrom(beforeLevels().gas);
    expect(defs.governmentLevels.map((l) => l.stage)).toEqual(defs.stages.map((s) => s.id));
    expect(defs.buildingLevels).toHaveLength(1);
    expect(defs.startBuildings).toEqual([]);
    expect(defs.world.governmentRadius).toBe(0);
  });

  it('الإضافة تطابق قاعدة بيانات جديدة / the addition matches a fresh database', () => {
    const { gas } = beforeLevels();
    gas.addVillageLevels();
    expect(definitionsFrom(gas)).toEqual(fresh);
    expect(fresh.governmentLevels.filter((l) => l.stage === 'village')).toHaveLength(5);
    expect(fresh.buildingLevels[5].style).toBe('stone');
  });

  it('تشغيلها مرتين لا يغير شيئًا / running it twice changes nothing', () => {
    const { gas, ss } = beforeLevels();
    gas.addVillageLevels();
    const snapshot = JSON.stringify([...ss.sheets.values()].map((s) => s.values));
    loadGas(ss).gas.addVillageLevels();
    expect(JSON.stringify([...ss.sheets.values()].map((s) => s.values))).toBe(snapshot);
  });
});

describe('Apps Script: البداية المتقاربة / compact start', () => {
  it('تصغّر حدود المراحل والأرض المسطحة وقطع الضم ولا تمس غيرها / shrinks stage borders, the flat zone and annex parcels only', () => {
    const { gas } = loadGas();
    gas.setupDatabase();
    gas.applyCapitalScale();
    const before = definitionsFrom(gas);
    gas.applyCompactVillage();
    const after = definitionsFrom(gas);
    expect(after.stages.map((st) => st.territoryRadius)).toEqual([6, 12, 20]);
    expect(after.world.flatZoneRadius).toBe(8);
    expect(after.world.annexBlockSize).toBe(4);
    expect({ ...after.world, flatZoneRadius: 0, annexBlockSize: 0 }).toEqual({ ...before.world, flatZoneRadius: 0, annexBlockSize: 0 });
    expect(after.buildings).toEqual(before.buildings);
  });
});

describe('Apps Script: الكاش والمزامنة / cache and sync', () => {
  const { gas } = loadGas();
  gas.setupDatabase();

  it('يحفظ ويقرأ قيمة كبيرة مجزّأة / stores and reads a large chunked value', () => {
    const big = { text: 'دولة'.repeat(30000) };
    gas.cachedJson_('big', () => big);
    gas.resetRequestMemo_();
    expect(gas.getChunked_('big')).toEqual(big);
  });

  it('قراءة بدأت قبل تعديل لا تُحفظ فوقه / a read that started before a write is not saved over it', () => {
    gas.resetRequestMemo_();
    gas.cachedJson_('raced', () => {
      gas.invalidateCache_('raced');
      return { stale: true };
    });
    expect(gas.getChunked_('raced')).toBeNull();
  });

  it('المزامنة التزايدية لا تعيد جدولًا لم يتغير / incremental sync skips unchanged tables', () => {
    gas.resetRequestMemo_();
    const first = gas.getDefinitionsDelta_({});
    const second = gas.getDefinitionsDelta_(first.versions);
    expect(Object.keys(second.changed)).toHaveLength(0);
  });
});
