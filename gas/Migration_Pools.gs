// مسؤولية الملف: حصص التوسع المستقلة والماء — حصة مشتركة للمستويات 1–3 وحصة لكل مستوى بعدها، والأرض الخصبة أرجح قرب الماء
// File responsibility: separate expansion pools and water — one pool shared by levels 1–3 and one per later level, and fertile land likelier near water

/**
 * حصص التوسع المستقلة، بطلب صريح من المدير:
 * - إضافة فقط: عمود «مجموعة التوسع» في مستويات الحكم، وعمود «قرب الماء» في موارد الغابة، وأربعة إعدادات للعالم.
 * - تعديل مقصود يُسجَّل بقيمه القديمة: «قطع التوسع» صار حصة كل مجموعة (16 للمستويات 1–3، و4 لكل مستوى بعدها)،
 *   و«قرب الماء» واحتمال الأرض الخصبة.
 * Separate expansion pools, on the admin's explicit request:
 * - Additive: the "expansion pool" column on government levels, the "near water" column on forest resources, and four world settings.
 * - A deliberate, logged edit: "expansion parcels" becomes each pool's quota (16 for levels 1–3, 4 per later level), and fertile
 *   land's "near water" flag and chance.
 */
function applyExpansionPools() {
  const ss = db_();
  const report = [];
  const edit = function (tableId, keyColumn, columns, label) {
    const table = tableById_(tableId);
    const sheet = ensureSheet_(ss, table);
    report.push(table.name + ': أعمدة جديدة ' + ensureColumns_(sheet, table));
    const header = headerOf_(sheet);
    const keyCol = header.indexOf(keyColumn);
    const seedByKey = {};
    SEED_ROWS[tableId].forEach(function (r) { seedByKey[String(r[keyColumn]).trim()] = r; });
    const values = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), header.length).getValues();
    values.forEach(function (r, i) {
      const seed = seedByKey[String(r[keyCol]).trim()];
      if (!seed) return;
      columns.forEach(function (col) {
        const c = header.indexOf(col);
        if (c < 0 || r[c] === seed[col]) return;
        report.push(label + ' ' + r[keyCol] + ' / ' + col + ': «' + r[c] + '» ← «' + seed[col] + '»');
        sheet.getRange(i + 2, c + 1).setValue(seed[col]);
      });
    });
    formatTable_(sheet, table);
  };
  edit('governmentLevels', 'المستوى', ['قطع التوسع', 'مجموعة التوسع'], 'المستوى');
  edit('frontierResources', 'معرف نوع المكمن', ['قرب الماء', 'الاحتمال'], 'المورد');
  const world = tableById_('world');
  report.push('إعدادات جديدة: ' + ensureSettingsRows_(ensureSheet_(ss, world), world));

  bumpVersions_(['governmentLevels', 'frontierResources', 'world']);
  Logger.log('اكتملت حصص التوسع المستقلة (القيمة القديمة ← الجديدة):\n' + report.join('\n'));
}
