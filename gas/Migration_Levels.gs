// مسؤولية الملف: مستويات القرية — مستويات الحكم ومستويات المباني والمباني الابتدائية، ومجمع الحكم وموارد البداية داخل القرية
// File responsibility: village levels — government and building levels, the starting buildings, the government compound and in-village starter resources

/**
 * مستويات القرية: ثلاثة جداول جديدة (مستويات الحكم، مستويات المباني، المباني الابتدائية) وإعدادان للعالم
 * (نصف قطر مجمع الحكم، وبعد موارد البداية). إضافة فقط وآمنة للتشغيل أكثر من مرة: الجدول الموجود لا يُمس.
 * تغيير موارد البداية يغيّر شكل العالم، فيبدأ اللاعب دولة جديدة بعد النشر.
 * Village levels: three new tables (government levels, building levels, starting buildings) and two world settings
 * (government compound radius, starter resource distance). Additive and safe to re-run: an existing table is left untouched.
 * Moving the starter resources changes the world's shape, so players start a new nation after deploying.
 */
function addVillageLevels() {
  const ss = db_();
  const report = [];
  ['governmentLevels', 'buildingLevels', 'startBuildings'].forEach(function (id) {
    const table = tableById_(id);
    const sheet = ensureSheet_(ss, table);
    const columns = ensureColumns_(sheet, table);
    const rows = seedIfEmpty_(sheet, table);
    formatTable_(sheet, table);
    report.push(table.name + ': أعمدة جديدة ' + columns + '، صفوف جديدة ' + rows);
  });
  const world = tableById_('world');
  const settings = ensureSheet_(ss, world);
  report.push(world.name + ': إعدادات جديدة ' + ensureSettingsRows_(settings, world));
  formatTable_(settings, world);

  bumpVersions_(['governmentLevels', 'buildingLevels', 'startBuildings', 'world']);
  Logger.log('اكتملت إضافة مستويات القرية:\n' + report.join('\n'));
}
