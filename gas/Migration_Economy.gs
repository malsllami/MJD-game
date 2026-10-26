// مسؤولية الملف: الاقتصاد الحي — البداية المتقاربة (تعديل صريح بطلب المدير)، ثم إضافات المهن والمخازن والسوق
// File responsibility: the living economy — the compact start (an explicit edit on the admin's request), then professions, storage and market additions

/**
 * البداية المتقاربة: قرية 13 × 13 مربعًا (نصف قطر 6)، والبلدة 12، والمدينة 20، وأرض مسطحة بنصف قطر 8، وقطع ضم 4 × 4.
 * تعديل مقصود لقيم موجودة بطلب صريح من المدير، ويسجّل كل قيمة قديمة قبل تغييرها.
 * The compact start: a 13 × 13 village (radius 6), town 12, city 20, an 8-radius flat zone and 4 × 4 annex parcels.
 * A deliberate edit of existing values on the admin's explicit request; logs every old value first.
 */
function applyCompactVillage() {
  applyWorldScale_(COMPACT_VILLAGE, 'طُبّقت البداية المتقاربة');
}
