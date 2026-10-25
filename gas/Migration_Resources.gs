// مسؤولية الملف: إضافة مباني الموارد — المنجرة والحدادون ومنقبو النفط والذهب والحجارة، وإعداد حجم قطعة الضم
// File responsibility: resource buildings addition — sawmill, blacksmiths, oil/gold/stone prospectors, and the annex block size
//
// إضافة فقط وآمنة للتشغيل أكثر من مرة: تضيف الصفوف الناقصة ولا تحذف ولا تعدّل أي قيمة موجودة.
// Additive and safe to re-run: adds missing rows; never deletes or changes an existing value.

/**
 * شغّل هذه الدالة مرة واحدة من محرر Apps Script بعد لصق الملفات الجديدة
 * Run once from the Apps Script editor after pasting the new files
 */
function addResourceBuildings() {
  const ss = db_();
  const ids = SEED_RESOURCE_PRODUCTION.map(function (p) { return p[0]; });
  const report = [];
  const pairs = function (list, column) { return amounts_(column, list); };

  const buildings = tableById_('buildings');
  const bSheet = ensureSheet_(ss, buildings);
  const newRows = SEED_ROWS.buildings.filter(function (r) { return ids.indexOf(r['المعرف']) >= 0; });
  report.push('المباني: ' + appendMissingRows_(bSheet, newRows, ['المعرف']).length);
  formatTable_(bSheet, buildings);

  [
    ['buildingCosts', pairs(SEED_RESOURCE_COSTS, 'الكمية')],
    ['buildingProduction', pairs(SEED_RESOURCE_PRODUCTION, 'الكمية في الدقيقة')],
    ['buildingConsumption', pairs(SEED_RESOURCE_CONSUMPTION, 'الكمية في الدقيقة')],
  ].forEach(function (entry) {
    const table = tableById_(entry[0]);
    const sheet = ensureSheet_(ss, table);
    report.push(table.name + ': ' + appendMissingRows_(sheet, entry[1], ['معرف المبنى', 'معرف المورد']).length);
    formatTable_(sheet, table);
  });

  const world = tableById_('world');
  const wSheet = ensureSheet_(ss, world);
  report.push(world.name + ': ' + ensureSettingsRows_(wSheet, world));
  formatTable_(wSheet, world);

  bumpVersions_(['buildings', 'buildingCosts', 'buildingProduction', 'buildingConsumption', 'world']);
  Logger.log('اكتملت إضافة مباني الموارد (صفوف جديدة):\n' + report.join('\n'));
}
