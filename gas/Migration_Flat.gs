// مسؤولية الملف: إضافة إعداد "نوع العالم" لتبدأ الدولة على أرض مستوية متصلة (إضافة فقط)
// File responsibility: adds the "world mode" setting so the nation starts on connected flat land (additive only)

/**
 * يضيف إعداد "نوع العالم" بقيمة flat إن لم يكن موجودًا. لا يعدّل أي قيمة مكتوبة، وآمن للتشغيل أكثر من مرة.
 * لإعادة القارة بجبالها وبحيراتها لاحقًا: غيّر القيمة في الشيت إلى continent.
 * Adds the "world mode" setting as flat when missing. Never changes a written value; safe to re-run.
 * To bring back the continent with its ranges and lakes later: change the value in the sheet to continent.
 */
function addFlatWorld() {
  const ss = db_();
  const table = tableById_('world');
  const sheet = ensureSheet_(ss, table);
  const added = ensureSettingsRows_(sheet, table);
  formatTable_(sheet, table);
  bumpVersions_(['world']);
  Logger.log('اكتملت إضافة العالم المستوي: إعدادات جديدة ' + added);
}
