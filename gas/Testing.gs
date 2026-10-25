// مسؤولية الملف: أدوات التجربة — تُشغَّل يدويًا بطلب صريح من المدير فقط
// File responsibility: testing tools — run manually, only on the admin's explicit request
//
// هذه الدالة تعدّل قيمًا موجودة عن قصد (الكمية الابتدائية لكل مورد) لتسهيل التجربة، ولا تحذف شيئًا.
// This function deliberately edits existing values (each resource's start amount) to ease testing; it deletes nothing.

/** الكمية التي تُكتب لكل مورد / Amount written for every resource */
const TEST_START_AMOUNT = 100000;

/**
 * يرفع "الكمية الابتدائية" لكل الموارد إلى TEST_START_AMOUNT؛ تظهر في كل دولة جديدة تبدأ بعد التشغيل
 * Raises every resource's start amount to TEST_START_AMOUNT; applies to every nation started afterwards
 */
function setStartAmountsForTesting() {
  const sheet = db_().getSheetByName(tableById_('resources').name);
  const header = headerOf_(sheet);
  const col = header.indexOf('الكمية الابتدائية') + 1;
  const rows = sheet.getLastRow() - 1;
  if (col < 1 || rows < 1) throw new Error('عمود الكمية الابتدائية غير موجود');
  sheet.getRange(2, col, rows, 1).setValues(Array.from({ length: rows }, function () { return [TEST_START_AMOUNT]; }));
  bumpVersions_(['resources']);
  Logger.log('رُفعت الكمية الابتدائية لكل الموارد إلى ' + TEST_START_AMOUNT);
}
