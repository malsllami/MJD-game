// مسؤولية الملف: الإعدادات التقنية للخادم — معرّف ملف قاعدة البيانات ومدة الكاش وحجم الأجزاء
// File responsibility: technical server settings — database file id, cache TTL and chunk size

/** معرّف ملف Google Sheets الذي يحتوي كل جداول اللعبة / Google Sheets file holding every game table */
const SPREADSHEET_ID = '1XuXR208QHwmRyXRlCqMl8noVJz5dQLua8CtvC9dAuds';

/** مدة صلاحية الكاش بالثواني / Cache time-to-live in seconds */
const CACHE_TTL_SECONDS = 300;

/**
 * أقصى عدد أحرف في الجزء الواحد: هامش واسع تحت حد 100 كيلوبايت مع تمدد العربية في UTF-8
 * Max characters per cache chunk: wide margin under the 100KB limit given Arabic UTF-8 growth
 */
const CACHE_CHUNK_CHARS = 40000;

/** ألوان تنسيق الجداول / Table formatting colours */
const HEADER_BACKGROUND = '#c9a961';
const HEADER_FONT_COLOR = '#16221f';

/** فتح ملف قاعدة البيانات مرة واحدة في كل تنفيذ / Opens the database file once per execution */
let SPREADSHEET_ = null;
function db_() {
  if (!SPREADSHEET_) SPREADSHEET_ = SpreadsheetApp.openById(SPREADSHEET_ID);
  return SPREADSHEET_;
}
