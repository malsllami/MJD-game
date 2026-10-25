// مسؤولية الملف: رقم إصدار لكل جدول — يزيد عند أي تعديل، لتجلب اللعبة الجداول المتغيرة فقط
// File responsibility: per-table data version — bumped on every change so the game fetches only changed tables

const VERSIONS_PROPERTY = 'DATA_VERSIONS';

/** أرقام إصدار كل الجداول / Versions of all tables */
function getVersions_() {
  const raw = PropertiesService.getScriptProperties().getProperty(VERSIONS_PROPERTY);
  const versions = raw ? JSON.parse(raw) : {};
  TABLES.forEach(function (t) {
    if (!versions[t.id]) versions[t.id] = 1;
  });
  return versions;
}

/**
 * زيادة إصدار جداول معيّنة وإبطال كاشها فورًا (بقفل يمنع تداخل تعديلين)
 * Bumps the version of given tables and invalidates their cache (locked against concurrent edits)
 */
function bumpVersions_(tableIds) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const versions = getVersions_();
    tableIds.forEach(function (id) {
      versions[id] = (versions[id] || 1) + 1;
      invalidateCache_(tableCacheKey_(id));
    });
    PropertiesService.getScriptProperties().setProperty(VERSIONS_PROPERTY, JSON.stringify(versions));
  } finally {
    lock.releaseLock();
  }
}

/**
 * مشغّل تلقائي عند تعديل أي خلية في الملف: يزيد إصدار الورقة المعدّلة
 * Installable trigger on cell edits: bumps the edited sheet's version
 */
function onDatabaseEdit(e) {
  const table = e && e.range ? tableBySheetName_(e.range.getSheet().getName()) : null;
  if (table) bumpVersions_([table.id]);
}

/**
 * مشغّل تلقائي عند تغييرات الهيكل (إضافة أو حذف صفوف): لا يحدد الورقة، فيزيد إصدار الكل
 * Installable trigger on structural changes (row insert/remove): sheet unknown, so bump all
 */
function onDatabaseChange(e) {
  if (e && e.changeType === 'EDIT') return;
  bumpVersions_(TABLES.map(function (t) { return t.id; }));
}
