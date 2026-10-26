// مسؤولية الملف: الاقتصاد الحي — البداية المتقاربة (تعديل صريح بطلب المدير)، ثم إضافات المهن والمخازن والسوق
// File responsibility: the living economy — the compact start (an explicit edit on the admin's request), then professions, storage and market additions

/**
 * البداية المتقاربة: قرية 13 × 13 مربعًا (نصف قطر 6)، والبلدة 12، والمدينة 20، وأرض مسطحة بنصف قطر 8، وقطع ضم 4 × 4.
 * تعديل مقصود لقيم موجودة بطلب صريح من المدير، ويسجّل كل قيمة قديمة قبل تغييرها.
 * The compact start: a 13 × 13 village (radius 6), town 12, city 20, an 8-radius flat zone and 4 × 4 annex parcels.
 * A deliberate edit of existing values on the admin's explicit request; logs every old value first.
 */
function applyCompactVillage() {
  applyWorldScale_(COMPACT_VILLAGE, 'طُبّقت البداية المتقاربة');
}

/**
 * الاقتصاد الحي: المهن، وسكن لكل مهنة، والعمال وشروط فتح كل مبنى، وشروط ترقية المراحل، والمخازن والبنك والسعة، وأسعار السوق،
 * والحديقة والسور والبوابة والبحيرة والجدول. إضافة فقط وآمنة للتشغيل أكثر من مرة: الأعمدة الجديدة تُملأ خلاياها الفارغة فقط.
 * The living economy: trades, housing per trade, each building's workers and unlock conditions, stage upgrade conditions,
 * stores, bank and capacity, market prices, and the garden, wall, gate, lake and stream. Additive and safe to re-run: new columns fill empty cells only.
 */
function addLivingEconomy() {
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
  const pair = ['معرف المبنى', 'معرف المورد'];
  const added = function (sheet, rows, keys) { return 'صفوف جديدة ' + appendMissingRows_(sheet, rows, keys).length; };

  step('professions', function (sheet, table) { return added(sheet, SEED_ROWS[table.id], ['المعرف']); });
  step('resources', function (sheet, table) {
    return 'خلايا مُلئت ' + fillEmptyCells_(sheet, SEED_ROWS[table.id], 'المعرف', ['السعة الأساسية']);
  });
  step('buildings', function (sheet, table) {
    const filled = fillEmptyCells_(sheet, SEED_ROWS[table.id], 'المعرف', ['المهنة', 'عدد العمال', 'السكان المطلوبون', 'المباني المطلوبة']);
    const rows = SEED_ROWS[table.id].filter(function (r) { return SEED_ECONOMY_IDS.indexOf(r['المعرف']) >= 0; });
    return 'خلايا مُلئت ' + filled + '، ' + added(sheet, rows, ['المعرف']);
  });
  step('stages', function (sheet, table) {
    return 'خلايا مُلئت ' + fillEmptyCells_(sheet, SEED_ROWS[table.id], 'المعرف', ['المباني المطلوبة', 'تكلفة الترقية']);
  });
  step('buildingCosts', function (sheet) { return added(sheet, amounts_('الكمية', SEED_ECONOMY_COSTS), pair); });
  step('buildingConsumption', function (sheet) { return added(sheet, amounts_('الكمية في الدقيقة', SEED_ECONOMY_CONSUMPTION), pair); });
  step('buildingProduction', function (sheet) { return added(sheet, amounts_('الكمية في الدقيقة', SEED_ECONOMY_PRODUCTION), pair); });
  step('storage', function (sheet, table) { return added(sheet, SEED_ROWS[table.id], pair); });
  step('marketPrices', function (sheet, table) { return added(sheet, SEED_ROWS[table.id], ['معرف المورد']); });
  step('world', function (sheet, table) { return 'إعدادات جديدة ' + ensureSettingsRows_(sheet, table); });

  bumpVersions_(touched);
  Logger.log('اكتملت إضافة الاقتصاد الحي:\n' + report.join('\n'));
}
