// مسؤولية الملف: حماية النصوص القادمة من قاعدة البيانات قبل إدراجها في الواجهة
// File responsibility: escapes database-sourced text before it is inserted into the HUD

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** تهريب النص لمنع حقن HTML / Escapes text to prevent HTML injection */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
