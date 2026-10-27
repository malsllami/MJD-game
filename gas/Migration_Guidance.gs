// مسؤولية الملف: توجيه البناء — منطقة مقترحة لكل مبنى، وأبعاد المناطق حول مبنى الحكم والطرق
// File responsibility: placement guidance — a suggested zone per building, and zone distances around the government building and roads

/**
 * توجيه البناء: عمود «منطقة الاقتراح» في المباني، وثلاثة إعدادات للعالم (نصف قطر المنطقة الإدارية والسكنية، وبعد الورش عن الطريق).
 * إضافة فقط وآمنة للتشغيل أكثر من مرة: تُملأ الخلايا الفارغة فقط، ولا تُمس أي قيمة كتبها المدير.
 * Placement guidance: a "suggested zone" column on buildings and three world settings (administrative and residential radius,
 * workshop distance from a road). Additive and safe to re-run: only empty cells are filled, and no admin value is touched.
 */
function addPlacementGuidance() {
  const ss = db_();
  const report = [];

  const buildings = tableById_('buildings');
  const sheet = ensureSheet_(ss, buildings);
  const columns = ensureColumns_(sheet, buildings);
  const filled = fillEmptyCells_(sheet, SEED_ROWS.buildings, 'المعرف', ['منطقة الاقتراح']);
  formatTable_(sheet, buildings);
  report.push(buildings.name + ': أعمدة جديدة ' + columns + '، خلايا مُلئت ' + filled);

  const world = tableById_('world');
  const settings = ensureSheet_(ss, world);
  report.push(world.name + ': إعدادات جديدة ' + ensureSettingsRows_(settings, world));
  formatTable_(settings, world);

  bumpVersions_(['buildings', 'world']);
  Logger.log('اكتملت إضافة توجيه البناء:\n' + report.join('\n'));
}
