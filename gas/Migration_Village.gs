// مسؤولية الملف: إضافة تطور القرية — المراحل، الإنتاج والاستهلاك، الماء والكهرباء، المباني الجديدة، وإعدادات البداية
// File responsibility: village progression addition — stages, production and consumption, water and power, new buildings, start settings
//
// إضافة فقط وآمنة للتشغيل أكثر من مرة: تضيف الجداول والأعمدة والصفوف الناقصة، وتملأ الخلايا الفارغة
// في الأعمدة الجديدة فقط. لا تحذف ولا تعدّل أي قيمة مكتوبة.
// Additive and safe to re-run: adds missing tables, columns and rows, and fills only empty cells in the
// new columns. Never deletes or changes a written value.

/**
 * شغّل هذه الدالة مرة واحدة من محرر Apps Script بعد لصق الملفات الجديدة
 * Run once from the Apps Script editor after pasting the new files
 */
function addVillageProgression() {
  const ss = db_();
  const report = [];
  const touched = [];
  const step = function (tableId, work) {
    const table = tableById_(tableId);
    const sheet = ensureSheet_(ss, table);
    const columns = ensureColumns_(sheet, table);
    const note = work(sheet, table);
    formatTable_(sheet, table);
    touched.push(tableId);
    report.push(table.name + ': أعمدة جديدة ' + columns + (note ? '، ' + note : ''));
  };
  const appendById = function (sheet, table) {
    return 'صفوف جديدة ' + appendMissingRows_(sheet, SEED_ROWS[table.id], ['المعرف']).length;
  };
  const appendByPair = function (sheet, table) {
    return 'صفوف جديدة ' + appendMissingRows_(sheet, SEED_ROWS[table.id], ['معرف المبنى', 'معرف المورد']).length;
  };

  step('stages', appendById);
  step('resources', appendById);
  step('buildingCategories', appendById);

  // المباني: ملء الأعمدة الجديدة للمباني الحالية، ثم إضافة المباني الجديدة وتكاليفها فقط
  // Buildings: fill the new columns of current buildings, then add new buildings and only their costs
  let newBuildingIds = [];
  step('buildings', function (sheet, table) {
    const filled = fillEmptyCells_(sheet, SEED_ROWS[table.id], 'المعرف', ['المرحلة المطلوبة', 'السكان المضافون', 'النموذج', 'يتطلب طريق']);
    const added = appendMissingRows_(sheet, SEED_ROWS[table.id], ['المعرف']);
    newBuildingIds = added.map(function (r) { return r['المعرف']; });
    return 'خلايا مُلئت ' + filled + '، مبانٍ جديدة ' + added.length;
  });
  step('buildingCosts', function (sheet, table) {
    const rows = SEED_ROWS[table.id].filter(function (r) { return newBuildingIds.indexOf(r['معرف المبنى']) >= 0; });
    return 'صفوف جديدة ' + appendMissingRows_(sheet, rows, ['معرف المبنى', 'معرف المورد']).length;
  });
  step('buildingProduction', appendByPair);
  step('buildingConsumption', appendByPair);

  step('contextCommands', function (sheet) {
    const hasBuildingMenu = sheetRows_(sheet).some(function (r) { return r['نوع العنصر'] === 'building'; });
    return 'أوامر جديدة ' + (hasBuildingMenu ? 0 : appendRows_(sheet, SEED_BUILDING_COMMANDS));
  });
  step('world', function (sheet, table) {
    return 'إعدادات جديدة ' + ensureSettingsRows_(sheet, table);
  });

  bumpVersions_(touched);
  Logger.log('اكتملت إضافة تطور القرية:\n' + report.join('\n'));
}
