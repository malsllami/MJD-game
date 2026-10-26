// مسؤولية الملف: العصر البدائي — إضافة البئر والخيمة (إضافة فقط)، ونقل مبانٍ حديثة إلى البلدة (تعديل صريح بطلب المدير)
// File responsibility: the primitive era — adds the well and the tent (additive only), and moves modern buildings to the town (an explicit edit on the admin's request)

/**
 * يضيف مبنيي البئر والخيمة مع تكاليفهما وإنتاجهما واستهلاكهما. إضافة فقط وآمنة للتشغيل أكثر من مرة.
 * Adds the well and tent buildings with their costs, production and consumption. Additive and safe to re-run.
 */
function addPrimitiveEra() {
  const ss = db_();
  const report = [];
  const touched = [];
  const step = function (tableId, rows, keys) {
    const table = tableById_(tableId);
    const sheet = ensureSheet_(ss, table);
    ensureColumns_(sheet, table);
    const added = appendMissingRows_(sheet, rows, keys).length;
    formatTable_(sheet, table);
    touched.push(tableId);
    report.push(table.name + ': صفوف جديدة ' + added);
  };
  const pair = ['معرف المبنى', 'معرف المورد'];
  step('buildings', SEED_ROWS.buildings.filter(function (r) { return SEED_PRIMITIVE_IDS.indexOf(r['المعرف']) >= 0; }), ['المعرف']);
  step('buildingCosts', amounts_('الكمية', SEED_PRIMITIVE_COSTS), pair);
  step('buildingProduction', amounts_('الكمية في الدقيقة', SEED_PRIMITIVE_PRODUCTION), pair);
  step('buildingConsumption', amounts_('الكمية في الدقيقة', SEED_PRIMITIVE_CONSUMPTION), pair);
  bumpVersions_(touched);
  Logger.log('اكتملت إضافة العصر البدائي:\n' + report.join('\n'));
}

/**
 * تطبيق العصر البدائي: محطة التحلية ومحطة الكهرباء والمباني السكنية تُفتح في البلدة، ووصف القرية الجديد.
 * تعديل مقصود لقيم موجودة بطلب صريح من المدير، ويسجّل كل قيمة قديمة قبل تغييرها.
 * Applies the primitive era: desalination, the power plant and apartments open in the town, plus the new village description.
 * A deliberate edit of existing values on the admin's explicit request; logs every old value first.
 */
function applyPrimitiveEra() {
  const ss = db_();
  const log = [];
  const editColumn = function (tableId, column, valueFor) {
    const sheet = ss.getSheetByName(tableById_(tableId).name);
    const header = headerOf_(sheet);
    const idCol = header.indexOf('المعرف');
    const col = header.indexOf(column);
    if (idCol < 0 || col < 0 || sheet.getLastRow() < 2) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues().forEach(function (r, i) {
      const value = valueFor(String(r[idCol]).trim());
      if (value === undefined || String(r[col]) === String(value)) return;
      log.push(r[idCol] + ' / ' + column + ': ' + r[col] + ' ← ' + value);
      sheet.getRange(i + 2, col + 1).setValue(value);
    });
  };
  editColumn('buildings', 'المرحلة المطلوبة', function (id) { return PRIMITIVE_ERA.buildingStages[id]; });
  editColumn('stages', 'الوصف', function (id) { return id === 'village' ? PRIMITIVE_ERA.villageDescription : undefined; });
  bumpVersions_(['buildings', 'stages']);
  Logger.log('طُبّق العصر البدائي (القيمة القديمة ← الجديدة):\n' + (log.join('\n') || 'لا تغييرات؛ القيم مطبقة من قبل'));
}
