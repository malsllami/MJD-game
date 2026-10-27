// مسؤولية الملف: الري — قناة ري تُرسم من البئر إلى المزارع، وسرعة إنتاج المزرعة المروية
// File responsibility: irrigation — an irrigation canal drawn from the well to the farms, and an irrigated farm's output speed

/**
 * الري، إضافة فقط وآمنة للتشغيل أكثر من مرة: مبنى «قناة ري» في المرافق بتكلفته، وإعداد سرعة الإنتاج مع الري
 * Irrigation, additive and safe to re-run: the "irrigation canal" in utilities with its cost, and the irrigated output speed setting
 */
function addIrrigation() {
  const ss = db_();
  const report = [];
  const buildings = tableById_('buildings');
  const rows = SEED_ROWS.buildings.filter(function (r) { return SEED_IRRIGATION_IDS.indexOf(r['المعرف']) >= 0; });
  report.push(buildings.name + ': صفوف جديدة ' + appendMissingRows_(ensureSheet_(ss, buildings), rows, ['المعرف']).length);
  const costs = tableById_('buildingCosts');
  report.push(costs.name + ': صفوف جديدة ' + appendMissingRows_(ensureSheet_(ss, costs), amounts_('الكمية', SEED_IRRIGATION_COSTS), ['معرف المبنى', 'معرف المورد']).length);
  const world = tableById_('world');
  report.push(world.name + ': إعدادات جديدة ' + ensureSettingsRows_(ensureSheet_(ss, world), world));
  bumpVersions_(['buildings', 'buildingCosts', 'world']);
  Logger.log('اكتملت إضافة الري:\n' + report.join('\n'));
}
