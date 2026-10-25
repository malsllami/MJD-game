// مسؤولية الملف: إعداد قاعدة البيانات تلقائيًا — إنشاء الجداول والأعمدة وتنسيقها وتعبئتها الأولية وتثبيت المشغّلات
// File responsibility: automatic database setup — create, format and seed tables, and install triggers
//
// آمن للتشغيل أكثر من مرة: يضيف الناقص فقط، ولا يحذف ولا يعدّل أي بيانات موجودة.
// Safe to run repeatedly: only adds what is missing; never deletes or modifies existing data.

/**
 * نقطة البداية: شغّل هذه الدالة من محرر Apps Script
 * Entry point: run this function from the Apps Script editor
 */
function setupDatabase() {
  const ss = db_();
  const report = [];
  TABLES.forEach(function (table) {
    const sheet = ensureSheet_(ss, table);
    const addedColumns = ensureColumns_(sheet, table);
    const addedRows = table.kind === 'settings' ? ensureSettingsRows_(sheet, table) : seedIfEmpty_(sheet, table);
    formatTable_(sheet, table);
    report.push(table.name + ': أعمدة جديدة ' + addedColumns + '، صفوف جديدة ' + addedRows);
  });
  installTriggers_();
  bumpVersions_(TABLES.map(function (t) { return t.id; }));
  Logger.log('اكتمل الإعداد:\n' + report.join('\n'));
}

/** إنشاء الورقة إن لم توجد / Create the sheet if missing */
function ensureSheet_(ss, table) {
  return ss.getSheetByName(table.name) || ss.insertSheet(table.name);
}

/**
 * إضافة الأعمدة الناقصة في نهاية الصف الأول دون المساس بالأعمدة الموجودة
 * Append missing columns to the header row without touching existing ones
 */
function ensureColumns_(sheet, table) {
  const lastCol = sheet.getLastColumn();
  const header = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  const missing = table.columns.map(function (c) { return c.name; }).filter(function (name) { return header.indexOf(name) < 0; });
  if (missing.length) sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
  return missing.length;
}

/** قراءة الصف الأول / Read the header row */
function headerOf_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
}

/** إضافة صفوف بمواقع أعمدتها الفعلية / Append rows aligned to the actual column positions */
function appendRows_(sheet, rows) {
  if (!rows.length) return 0;
  const header = headerOf_(sheet);
  const values = rows.map(function (row) {
    return header.map(function (name) { return Object.prototype.hasOwnProperty.call(row, name) ? row[name] : ''; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, header.length).setValues(values);
  return values.length;
}

/** مفتاح صف من عدة أعمدة / Row key from several columns */
function rowKey_(row, keyColumns) {
  return keyColumns.map(function (c) { return String(row[c] === undefined ? '' : row[c]).trim(); }).join('|');
}

/** الصفوف الموجودة في الورقة ككائنات بأسماء الأعمدة / Existing sheet rows as objects keyed by column name */
function sheetRows_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const header = headerOf_(sheet);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues().map(function (values) {
    const row = {};
    header.forEach(function (name, i) { row[name] = values[i]; });
    return row;
  });
}

/**
 * إضافة صفوف البيانات الأولية التي لا يوجد صف بمفتاحها؛ يعيد الصفوف المضافة
 * Append seed rows whose key is not present yet; returns the appended rows
 */
function appendMissingRows_(sheet, seedRows, keyColumns) {
  const existing = {};
  sheetRows_(sheet).forEach(function (r) { existing[rowKey_(r, keyColumns)] = true; });
  const missing = seedRows.filter(function (r) { return !existing[rowKey_(r, keyColumns)]; });
  appendRows_(sheet, missing);
  return missing;
}

/**
 * ملء الخلايا الفارغة فقط في أعمدة محددة للصفوف الموجودة؛ أي قيمة مكتوبة لا تُلمس
 * Fill only empty cells of given columns in existing rows; any written value is left untouched
 */
function fillEmptyCells_(sheet, seedRows, keyColumn, columns) {
  const header = headerOf_(sheet);
  const keyIndex = header.indexOf(keyColumn);
  const seedByKey = {};
  seedRows.forEach(function (r) { seedByKey[String(r[keyColumn]).trim()] = r; });
  let filled = 0;
  sheetRows_(sheet).forEach(function (row, i) {
    const seed = seedByKey[String(row[keyColumn]).trim()];
    if (keyIndex < 0 || !seed) return;
    columns.forEach(function (col) {
      const c = header.indexOf(col);
      if (c < 0 || row[col] !== '' || seed[col] === undefined || seed[col] === '') return;
      sheet.getRange(i + 2, c + 1).setValue(seed[col]);
      filled++;
    });
  });
  return filled;
}

/** تعبئة أولية لجدول جديد فارغ فقط / Seed only a new, empty table */
function seedIfEmpty_(sheet, table) {
  if (sheet.getLastRow() > 1 || !SEED_ROWS[table.id]) return 0;
  return appendRows_(sheet, SEED_ROWS[table.id]);
}

/**
 * إضافة مفاتيح الإعدادات الناقصة فقط؛ القيم الموجودة لا تُلمس
 * Add only missing setting keys; existing values are left untouched
 */
function ensureSettingsRows_(sheet, table) {
  const existing = readTable_(table);
  const keys = {};
  if (sheet.getLastRow() > 1) {
    const header = headerOf_(sheet);
    const keyCol = header.indexOf('المفتاح');
    sheet.getRange(2, keyCol + 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) { keys[String(r[0]).trim()] = true; });
  }
  const rows = WORLD_SETTINGS.filter(function (s) { return !keys[s.key] && existing[s.field] === undefined; }).map(function (s) {
    return { 'المفتاح': s.key, 'القيمة': SEED_WORLD[s.field], 'الوصف': s.description };
  });
  return appendRows_(sheet, rows);
}

/**
 * تنسيق الجدول: من اليمين لليسار، صف أول ثابت وملوّن، محتوى في المنتصف بخط 12 عريض، ومربعات اختيار
 * Format: right-to-left, frozen coloured header, centred bold 12pt content, checkboxes
 */
function formatTable_(sheet, table) {
  const cols = sheet.getLastColumn();
  const rows = sheet.getMaxRows();
  sheet.setRightToLeft(true);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, rows, cols)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setFontSize(12)
    .setFontWeight('bold');
  sheet.getRange(1, 1, 1, cols).setBackground(HEADER_BACKGROUND).setFontColor(HEADER_FONT_COLOR);

  const header = headerOf_(sheet);
  const checkbox = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  table.columns.forEach(function (c) {
    const col = header.indexOf(c.name) + 1;
    if (c.type === 'boolean' && col > 0 && rows > 1) sheet.getRange(2, col, rows - 1, 1).setDataValidation(checkbox);
  });
  sheet.autoResizeColumns(1, cols);
}

/** تثبيت مشغّلات التعديل مرة واحدة / Install edit triggers once */
function installTriggers_() {
  const existing = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (existing.indexOf('onDatabaseEdit') < 0) ScriptApp.newTrigger('onDatabaseEdit').forSpreadsheet(SPREADSHEET_ID).onEdit().create();
  if (existing.indexOf('onDatabaseChange') < 0) ScriptApp.newTrigger('onDatabaseChange').forSpreadsheet(SPREADSHEET_ID).onChange().create();
}
