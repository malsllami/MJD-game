// مسؤولية الملف: قراءة الجداول وتحويل صفوفها العربية إلى بيانات للعبة، عبر الكاش
// File responsibility: reads tables and converts their Arabic rows into game data, through the cache

const ARABIC_DIGITS_ = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS_ = '۰۱۲۳۴۵۶۷۸۹';

/** مفتاح كاش الجدول / Cache key of a table */
function tableCacheKey_(tableId) {
  return 'table:' + tableId;
}

/**
 * بيانات جدول جاهزة للعبة (من الكاش أو من الورقة)
 * Game-ready data of a table (from cache or from the sheet)
 */
function getTableData_(table) {
  return cachedJson_(tableCacheKey_(table.id), function () { return readTable_(table); });
}

/**
 * يقرأ الورقة بأسماء أعمدتها (وليس بمواقعها) حتى لا يتأثر بإعادة ترتيب الأعمدة
 * Reads a sheet by column names (not positions) so reordering columns does not break it
 */
function readTable_(table) {
  const sheet = db_().getSheetByName(table.name);
  if (!sheet || sheet.getLastRow() < 2) return table.kind === 'settings' ? {} : [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const header = values[0].map(function (h) { return String(h).trim(); });
  const index = {};
  table.columns.forEach(function (c) { index[c.field] = header.indexOf(c.name); });

  const rows = values.slice(1).map(function (row) {
    const obj = {};
    table.columns.forEach(function (c) {
      obj[c.field] = index[c.field] >= 0 ? convert_(row[index[c.field]], c.type) : convert_('', c.type);
    });
    return obj;
  });

  if (table.kind === 'settings') return settingsFromRows_(rows);
  // العمود الأول هو مفتاح الصف: صف بلا مفتاح فارغ، والصف الموقوف لا يُرسل للعبة
  // The first column is the row key: a row without it is empty; a disabled row is not sent
  const keyField = table.columns[0].field;
  return rows.filter(function (r) { return r[keyField] !== '' && r[keyField] !== null && !r.disabled; });
}

/** تحويل صفوف المفتاح/القيمة إلى كائن إعدادات / Converts key/value rows into a settings object */
function settingsFromRows_(rows) {
  const byKey = {};
  rows.forEach(function (r) { byKey[String(r.key).trim()] = r.value; });
  const settings = {};
  WORLD_SETTINGS.forEach(function (s) {
    if (Object.prototype.hasOwnProperty.call(byKey, s.key)) settings[s.field] = convert_(byKey[s.key], s.type);
  });
  return settings;
}

/** تحويل قيمة خلية حسب نوع العمود / Converts a cell value according to its column type */
function convert_(value, type) {
  switch (type) {
    case 'number': {
      if (typeof value === 'number') return value;
      const text = normalizeDigits_(String(value)).replace(/[,٬\s]/g, '').replace('٫', '.');
      return text === '' ? null : Number(text);
    }
    case 'boolean':
      return value === true || value === 'TRUE' || value === 'نعم';
    case 'list':
      return String(value).split(/[,،]/).map(function (s) { return s.trim(); }).filter(String);
    default: {
      const text = value === null || value === undefined ? '' : String(value).trim();
      return text;
    }
  }
}

/** تحويل الأرقام العربية والفارسية إلى إنجليزية / Converts Arabic-Indic and Persian digits to Latin */
function normalizeDigits_(text) {
  return text.replace(/[٠-٩۰-۹]/g, function (d) {
    const i = ARABIC_DIGITS_.indexOf(d);
    return String(i >= 0 ? i : PERSIAN_DIGITS_.indexOf(d));
  });
}

/**
 * الجداول التي تغيّر إصدارها عن نسخة اللاعب فقط (مزامنة تزايدية)
 * Only the tables whose version differs from the client's copy (incremental sync)
 */
function getDefinitionsDelta_(clientVersions) {
  const versions = getVersions_();
  const changed = {};
  TABLES.forEach(function (t) {
    if (clientVersions[t.id] !== versions[t.id]) changed[t.id] = getTableData_(t);
  });
  return { versions: versions, changed: changed };
}
