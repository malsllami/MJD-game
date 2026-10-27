// مسؤولية الملف: حصة التوسع — عدد قطع الغابة المسموح بقطعها حسب مستوى الحكم، والأرض الخصبة كنتيجة جديدة للقطع
// File responsibility: the expansion quota — how many forest parcels may be cleared by government level, and fertile land as a new clearing result

/**
 * حصة التوسع، إضافة فقط وآمنة للتشغيل أكثر من مرة:
 * - عمود «قطع التوسع» في مستويات الحكم (تُملأ خلاياه الفارغة فقط).
 * - نوع المكمن «أرض خصبة» وصفّه في موارد الغابة.
 * The expansion quota, additive and safe to re-run:
 * - The "expansion parcels" column on government levels (only empty cells are filled).
 * - The "fertile land" deposit type and its forest resources row.
 */
function addExpansionQuota() {
  const ss = db_();
  const report = [];
  const levels = tableById_('governmentLevels');
  const lSheet = ensureSheet_(ss, levels);
  const columns = ensureColumns_(lSheet, levels);
  report.push(levels.name + ': أعمدة جديدة ' + columns + '، خلايا مُلئت ' + fillEmptyCells_(lSheet, SEED_ROWS.governmentLevels, 'المستوى', ['قطع التوسع']));
  formatTable_(lSheet, levels);

  const types = tableById_('depositTypes');
  const fertile = SEED_ROWS.depositTypes.filter(function (r) { return r['المعرف'] === 'fertile_land'; });
  report.push(types.name + ': صفوف جديدة ' + appendMissingRows_(ensureSheet_(ss, types), fertile, ['المعرف']).length);
  const frontier = tableById_('frontierResources');
  const row = SEED_ROWS.frontierResources.filter(function (r) { return r['معرف نوع المكمن'] === 'fertile_land'; });
  report.push(frontier.name + ': صفوف جديدة ' + appendMissingRows_(ensureSheet_(ss, frontier), row, ['معرف نوع المكمن']).length);

  bumpVersions_(['governmentLevels', 'depositTypes', 'frontierResources']);
  Logger.log('اكتملت إضافة حصة التوسع:\n' + report.join('\n'));
}
