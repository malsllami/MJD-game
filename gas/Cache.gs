// مسؤولية الملف: التخزين المؤقت بنفس طريقة مشروع "خرائط المحطات"
// File responsibility: caching, following the same approach as the "Maps of Substations" project
//
// - كاش مجزّأ: البيانات الكبيرة تُقسَّم لأجزاء آمنة الحجم (حد جوجل 100 كيلوبايت للمفتاح).
// - كاش عمر الطلب: لا تُقرأ نفس البيانات من CacheService مرتين في طلب واحد.
// - جيل لكل كاش: قراءة بدأت قبل كتابة لا تُحفظ فوقها (لا تعود بيانات قديمة بعد تعديل).
// - الإبطال فور أي تعديل. الكاش وسيلة تسريع فقط، والشيت هو المصدر دائمًا.
// - Chunked cache, request-scoped memo, a generation per key so a read that started before a write
//   is never saved over it, invalidation on every change. The sheet is always the source of truth.

let requestMemo_ = {};

/** بداية كل طلب: كاش عمر الطلب فارغ / Start of every request: empty request memo */
function resetRequestMemo_() {
  requestMemo_ = {};
}

/**
 * قيمة من الكاش: عمر الطلب ← CacheService ← دالة التحميل من الشيت (وتُحفظ إن لم يتغير الجيل أثناء القراءة)
 * Cached value: request memo ← CacheService ← sheet loader (saved only if the generation did not change meanwhile)
 */
function cachedJson_(key, loader) {
  if (Object.prototype.hasOwnProperty.call(requestMemo_, key)) return requestMemo_[key];
  let value = getChunked_(key);
  if (value === null) {
    const genBefore = cacheGen_(key);
    value = loader();
    if (cacheGen_(key) === genBefore) putChunked_(key, value);
  }
  requestMemo_[key] = value;
  return value;
}

/** إبطال قيمة بعد تعديل: جيل جديد + حذف البيانات / Invalidate after a change: new generation + drop the data */
function invalidateCache_(key) {
  delete requestMemo_[key];
  const cache = CacheService.getScriptCache();
  cache.put(key + '_gen', String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600);
  cache.remove(key + '_meta');
}

function cacheGen_(key) {
  return CacheService.getScriptCache().get(key + '_gen') || '0';
}

/** حفظ قيمة JSON بأجزاء؛ فشل الحفظ لا يُفشل الطلب / Save JSON in chunks; a save failure never fails the request */
function putChunked_(key, value) {
  try {
    const text = JSON.stringify(value);
    const payload = {};
    let count = 0;
    for (let i = 0; i < text.length || count === 0; i += CACHE_CHUNK_CHARS) {
      payload[key + '_c' + count] = text.slice(i, i + CACHE_CHUNK_CHARS);
      count++;
    }
    payload[key + '_meta'] = JSON.stringify({ chunks: count, length: text.length });
    CacheService.getScriptCache().putAll(payload, CACHE_TTL_SECONDS);
  } catch (err) {
    // الكاش ممتلئ أو غير متاح: نكمل من الشيت / Cache full or unavailable: carry on from the sheet
  }
}

/** قراءة قيمة مجزّأة، أو null إن نقص أي جزء أو تلف / Read a chunked value, or null if any chunk is missing or broken */
function getChunked_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const meta = JSON.parse(cache.get(key + '_meta') || 'null');
    if (!meta) return null;
    const keys = [];
    for (let i = 0; i < meta.chunks; i++) keys.push(key + '_c' + i);
    const parts = cache.getAll(keys);
    let text = '';
    for (let i = 0; i < meta.chunks; i++) {
      if (typeof parts[keys[i]] !== 'string') return null;
      text += parts[keys[i]];
    }
    return text.length === meta.length ? JSON.parse(text) : null;
  } catch (err) {
    return null; // كاش تالف ← يُقرأ من الشيت / broken cache ← read from the sheet
  }
}
