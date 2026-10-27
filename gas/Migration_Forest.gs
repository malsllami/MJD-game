// مسؤولية الملف: الغابة المحيطة — قرية أولى بقدر منازلها ومواردها تحيط بها غابة كثيفة، والتوسع بقطع الغابة قطعة بعد قطعة
// File responsibility: the surrounding forest — a first village the size of its homes and resources inside a dense forest, growing by clearing it parcel by parcel

/**
 * الغابة المحيطة، بطلب صريح من المدير:
 * - إضافة فقط: جدول «موارد الغابة» وثلاثة إعدادات (مدة القطع، وخشبه، وعمق الغابة).
 * - تعديل مقصود يُسجَّل بقيمه القديمة: حدود القرية 4 (9 × 9)، وقطعة الضم 3 × 3، وبعد موارد البداية 3، واسم أمر الضم وأيقونته،
 *   وفتح السور والبوابة من البداية (بلا سكان ولا مبانٍ مطلوبة).
 * بعد النشر يبدأ اللاعب دولة جديدة لأن شكل البداية تغيّر.
 * The surrounding forest, on the admin's explicit request:
 * - Additive: the "forest resources" table and three settings (clearing time, its wood, forest depth).
 * - A deliberate, logged edit: village radius 4 (9 × 9), 3 × 3 parcels, starter resources at 3, the annex command's name and icon,
 *   and the wall and gate opened from the start (no population or buildings required).
 * After deploying, players start a new nation since the start has changed.
 */
function applyForestFrontier() {
  const ss = db_();
  const report = [];

  const table = tableById_('frontierResources');
  const sheet = ensureSheet_(ss, table);
  const columns = ensureColumns_(sheet, table);
  const rows = seedIfEmpty_(sheet, table);
  formatTable_(sheet, table);
  report.push(table.name + ': أعمدة جديدة ' + columns + '، صفوف جديدة ' + rows);

  const world = tableById_('world');
  const settings = ensureSheet_(ss, world);
  report.push(world.name + ': إعدادات جديدة ' + ensureSettingsRows_(settings, world));
  formatTable_(settings, world);

  // أمر الضم يصبح قطع الغابة (تعديل اسم وأيقونة يُسجَّل) / The annex command becomes forest clearing (a logged name and icon edit)
  const commands = tableById_('contextCommands');
  const cSheet = ss.getSheetByName(commands.name);
  const header = headerOf_(cSheet);
  const [typeCol, idCol, nameCol, iconCol] = ['نوع العنصر', 'المعرف', 'الاسم', 'الأيقونة'].map(function (c) { return header.indexOf(c); });
  const values = cSheet.getRange(2, 1, cSheet.getLastRow() - 1, header.length).getValues();
  values.forEach(function (r, i) {
    if (String(r[typeCol]).trim() !== 'empty_tile' || String(r[idCol]).trim() !== 'annex') return;
    report.push('أمر الضم: ' + r[nameCol] + ' / ' + r[iconCol] + ' ← قطع الغابة / wood');
    cSheet.getRange(i + 2, nameCol + 1).setValue('قطع الغابة');
    cSheet.getRange(i + 2, iconCol + 1).setValue('wood');
  });

  // السور والبوابة مفتوحان من البداية (تعديل يُسجَّل) / The wall and gate open from the start (a logged edit)
  const buildings = tableById_('buildings');
  const bSheet = ss.getSheetByName(buildings.name);
  const bHeader = headerOf_(bSheet);
  const [bId, popCol, needCol] = ['المعرف', 'السكان المطلوبون', 'المباني المطلوبة'].map(function (c) { return bHeader.indexOf(c); });
  const bValues = bSheet.getRange(2, 1, bSheet.getLastRow() - 1, bHeader.length).getValues();
  bValues.forEach(function (r, i) {
    if (OPEN_WALLS.indexOf(String(r[bId]).trim()) < 0) return;
    report.push(r[bId] + ': السكان المطلوبون ' + r[popCol] + ' ← 0، المباني المطلوبة «' + r[needCol] + '» ← فارغ');
    bSheet.getRange(i + 2, popCol + 1).setValue(0);
    bSheet.getRange(i + 2, needCol + 1).setValue('');
  });

  bumpVersions_(['frontierResources', 'world', 'contextCommands', 'buildings']);
  Logger.log('اكتملت إضافة الغابة المحيطة:\n' + report.join('\n'));
  applyWorldScale_(FOREST_FRONTIER, 'طُبّقت حدود القرية الأولى');
}
