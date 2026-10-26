// مسؤولية الملف: إضافة العالم والمكامن (إضافة فقط)، وتطبيق مقياس العاصمة الجديد (تعديل صريح بطلب المدير)
// File responsibility: world and deposits addition (additive only), and the new capital scale (an explicit edit on the admin's request)

/**
 * إضافة النحاس والفضة، وجدول أنواع المكامن، ومنقبي النحاس والفضة، وعمود "يتطلب مكمن"، وإعدادات العالم الجديدة.
 * إضافة فقط وآمنة للتشغيل أكثر من مرة: لا تحذف ولا تعدّل أي قيمة مكتوبة.
 * Adds copper and silver, the deposit types table, copper/silver prospectors, the "requires deposit" column and new world settings.
 * Additive and safe to re-run: never deletes or changes a written value.
 */
function addWorldAndDeposits() {
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
    report.push(table.name + ': أعمدة جديدة ' + columns + '، ' + note);
  };
  const newIds = ['copper_prospector', 'silver_prospector'];

  step('resources', function (sheet, table) {
    return 'صفوف جديدة ' + appendMissingRows_(sheet, SEED_ROWS[table.id], ['المعرف']).length;
  });
  step('depositTypes', function (sheet, table) {
    return 'صفوف جديدة ' + appendMissingRows_(sheet, SEED_ROWS[table.id], ['المعرف']).length;
  });
  step('buildings', function (sheet, table) {
    const filled = fillEmptyCells_(sheet, SEED_ROWS[table.id], 'المعرف', ['يتطلب مكمن']);
    const rows = SEED_ROWS[table.id].filter(function (r) { return newIds.indexOf(r['المعرف']) >= 0; });
    return 'خلايا مُلئت ' + filled + '، مبانٍ جديدة ' + appendMissingRows_(sheet, rows, ['المعرف']).length;
  });
  step('buildingCosts', function (sheet) {
    return 'صفوف جديدة ' + appendMissingRows_(sheet, amounts_('الكمية', SEED_DEPOSIT_COSTS), ['معرف المبنى', 'معرف المورد']).length;
  });
  step('buildingProduction', function (sheet) {
    return 'صفوف جديدة ' + appendMissingRows_(sheet, amounts_('الكمية في الدقيقة', SEED_DEPOSIT_PRODUCTION), ['معرف المبنى', 'معرف المورد']).length;
  });
  step('world', function (sheet, table) {
    return 'إعدادات جديدة ' + ensureSettingsRows_(sheet, table);
  });

  bumpVersions_(touched);
  Logger.log('اكتملت إضافة العالم والمكامن:\n' + report.join('\n'));
}

/**
 * تطبيق مقياس العاصمة: عالم 160 × 160 مربعًا (8 × 8 كم)، وعاصمة أولى نحو 2 × 2 كم، وضم بقطع 10 × 10.
 * تعديل مقصود لقيم موجودة (حجم الخريطة وحدود المراحل) بطلب صريح من المدير، ويسجّل كل قيمة قديمة قبل تغييرها.
 * Applies the capital scale: a 160 × 160 world (8 × 8 km), a first capital of about 2 × 2 km, 10 × 10 annex parcels.
 * A deliberate edit of existing values (map size, stage borders) on the admin's explicit request; logs every old value first.
 */
function applyCapitalScale() {
  applyWorldScale_(CAPITAL_SCALE, 'طُبّق مقياس العاصمة');
}

/**
 * يكتب قيم إعدادات العالم ونصف قطر حدود كل مرحلة من مقياس، ويسجّل كل قيمة قديمة قبل تغييرها
 * Writes world settings and each stage's border radius from a scale, logging every old value first
 */
function applyWorldScale_(scale, label) {
  const ss = db_();
  const log = [];

  const world = tableById_('world');
  const wSheet = ss.getSheetByName(world.name);
  const wHeader = headerOf_(wSheet);
  const keyCol = wHeader.indexOf('المفتاح');
  const valueCol = wHeader.indexOf('القيمة');
  const keyOf = {};
  WORLD_SETTINGS.forEach(function (s) { keyOf[s.field] = s.key; });
  const wValues = wSheet.getRange(2, 1, wSheet.getLastRow() - 1, wHeader.length).getValues();
  Object.keys(scale.world).forEach(function (field) {
    const row = wValues.findIndex(function (r) { return String(r[keyCol]).trim() === keyOf[field]; });
    if (row < 0) return;
    log.push(keyOf[field] + ': ' + wValues[row][valueCol] + ' ← ' + scale.world[field]);
    wSheet.getRange(row + 2, valueCol + 1).setValue(scale.world[field]);
  });

  const stages = tableById_('stages');
  const sSheet = ss.getSheetByName(stages.name);
  const sHeader = headerOf_(sSheet);
  const idCol = sHeader.indexOf('المعرف');
  const radiusCol = sHeader.indexOf('نصف قطر الحدود');
  const sValues = sSheet.getRange(2, 1, sSheet.getLastRow() - 1, sHeader.length).getValues();
  sValues.forEach(function (r, i) {
    const radius = scale.stageRadius[String(r[idCol]).trim()];
    if (radius === undefined) return;
    log.push('حدود ' + r[idCol] + ': ' + r[radiusCol] + ' ← ' + radius);
    sSheet.getRange(i + 2, radiusCol + 1).setValue(radius);
  });

  bumpVersions_(['world', 'stages']);
  Logger.log(label + ' (القيمة القديمة ← الجديدة):\n' + log.join('\n'));
}
