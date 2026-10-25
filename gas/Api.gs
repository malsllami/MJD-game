// مسؤولية الملف: واجهة الويب التي تتواصل معها اللعبة — قراءة أرقام الإصدار والتعريفات المتغيرة
// File responsibility: web API the game talks to — reads data versions and changed definitions
//
// الطلبات / Requests:
//   ?action=versions                     أرقام إصدار كل الجداول
//   ?action=definitions&have={"terrain":3} الجداول التي تغيّرت عن الأرقام المرسلة فقط

/** استقبال طلبات GET / Handles GET requests */
function doGet(e) {
  resetRequestMemo_();
  try {
    const params = (e && e.parameter) || {};
    const action = params.action || 'versions';
    let data;
    if (action === 'versions') data = { versions: getVersions_() };
    else if (action === 'definitions') data = getDefinitionsDelta_(parseVersions_(params.have));
    else throw new Error('طلب غير معروف: ' + action);
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/** قراءة أرقام الإصدار المرسلة من اللعبة بأمان / Safely parse versions sent by the game */
function parseVersions_(text) {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : {};
  } catch (err) {
    return {};
  }
}

/** رد JSON / JSON response */
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
