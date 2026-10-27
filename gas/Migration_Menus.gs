// مسؤولية الملف: ترتيب قوائم البناء — ست فئات (الصناعة، المرافق، النقل، السكن، الاقتصاد، الحكم)، والشعلات والبلاط، ومباني الحكم الجديدة
// File responsibility: the build menu layout — six categories (industry, utilities, transport, housing, economy, government), torches and paving, and the new government buildings

/**
 * ترتيب القوائم، بطلب صريح من المدير:
 * - تعديل مقصود يُسجَّل بقيمه القديمة: اسم الفئات وترتيبها، وفئة كل مبنى.
 * - إضافة فقط: الشعلة والبلاط الحجري والرملي، والمكتب الهندسي والخارجية ودار التحالف (تُفتح في البلدة) بتكاليفها، وإعدادا مبنى الهندسة.
 * The menu layout, on the admin's explicit request:
 * - A deliberate, logged edit: category names and order, and each building's category.
 * - Additive: the torch, stone and sand paving, and the engineering office, foreign ministry and alliance house (opening in the town)
 *   with their costs, and the two engineering settings.
 */
function applyMenuLayout() {
  const ss = db_();
  const report = [];

  const cats = tableById_('buildingCategories');
  const cSheet = ss.getSheetByName(cats.name);
  const cHeader = headerOf_(cSheet);
  const [cId, cName, cOrder] = ['المعرف', 'الاسم', 'الترتيب'].map(function (c) { return cHeader.indexOf(c); });
  const cValues = cSheet.getRange(2, 1, cSheet.getLastRow() - 1, cHeader.length).getValues();
  const order = MENU_ORDER.map(function (c) { return c[0]; });
  cValues.forEach(function (r, i) {
    const id = String(r[cId]).trim();
    const at = order.indexOf(id);
    const name = at >= 0 ? MENU_ORDER[at][1] : r[cName];
    const position = at >= 0 ? at + 1 : order.length + i + 1;
    if (name === r[cName] && position === r[cOrder]) return;
    report.push('فئة ' + id + ': ' + r[cName] + ' / ' + r[cOrder] + ' ← ' + name + ' / ' + position);
    cSheet.getRange(i + 2, cName + 1).setValue(name);
    cSheet.getRange(i + 2, cOrder + 1).setValue(position);
  });

  const buildings = tableById_('buildings');
  const bSheet = ensureSheet_(ss, buildings);
  ensureColumns_(bSheet, buildings);
  const rows = SEED_ROWS.buildings.filter(function (r) { return SEED_MENU_IDS.indexOf(r['المعرف']) >= 0; });
  report.push('مبانٍ جديدة: ' + appendMissingRows_(bSheet, rows, ['المعرف']).length);
  const bHeader = headerOf_(bSheet);
  const [bId, bCat] = ['المعرف', 'الفئة'].map(function (c) { return bHeader.indexOf(c); });
  const bValues = bSheet.getRange(2, 1, bSheet.getLastRow() - 1, bHeader.length).getValues();
  bValues.forEach(function (r, i) {
    const target = menuCategory_(String(r[bId]).trim(), '');
    if (!target || String(r[bCat]).trim() === target) return;
    report.push(r[bId] + ': ' + r[bCat] + ' ← ' + target);
    bSheet.getRange(i + 2, bCat + 1).setValue(target);
  });
  formatTable_(bSheet, buildings);

  const costs = tableById_('buildingCosts');
  report.push('تكاليف جديدة: ' + appendMissingRows_(ensureSheet_(ss, costs), amounts_('الكمية', SEED_MENU_COSTS), ['معرف المبنى', 'معرف المورد']).length);
  const world = tableById_('world');
  report.push('إعدادات جديدة: ' + ensureSettingsRows_(ensureSheet_(ss, world), world));

  bumpVersions_(['buildingCategories', 'buildings', 'buildingCosts', 'world']);
  Logger.log('اكتمل ترتيب القوائم (القيمة القديمة ← الجديدة):\n' + report.join('\n'));
}
