// مسؤولية الملف: تنبيه «أدر جهازك» على الجوال بالطول — لا يمنع اللعب، ويختفي تلقائيًا بالعرض، ويمكن إخفاؤه لبقية الجلسة
// File responsibility: the "rotate your device" hint on phones in portrait — never blocks play, hides itself in landscape,
// and can be dismissed for the rest of the session

import { APP_CONFIG } from '../config/app.config';

const DISMISS_KEY = 'mjd-rotate-hint-dismissed';

/** هل أخفاه اللاعب في هذه الجلسة؟ التخزين قد لا يتوفر فيُعامل كأنه لم يُخفَ / Dismissed this session? Storage may be unavailable */
function dismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * يضيف التنبيه إلى الصفحة؛ ظهوره يتبع اتجاه الشاشة مباشرة دون إعادة تحميل
 * Adds the hint to the page; it follows the screen orientation live, without a reload
 */
export function mountRotateHint(parent: HTMLElement): void {
  const el = document.createElement('aside');
  el.className = 'rotate-hint glass';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <span class="rotate-icon" aria-hidden="true"></span>
    <p>لأفضل تجربة، أدر جهازك إلى الوضع الأفقي</p>
    <button type="button" class="text-btn" data-rotate-dismiss>متابعة بالطول</button>`;
  parent.append(el);

  const portrait = window.matchMedia(APP_CONFIG.portraitPhoneQuery);
  const sync = () => (el.hidden = !portrait.matches || dismissed());
  portrait.addEventListener('change', sync);
  el.querySelector('[data-rotate-dismiss]')!.addEventListener('click', () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // بلا تخزين يُخفى حتى إعادة التحميل فقط / Without storage it stays hidden until a reload only
    }
    el.hidden = true;
  });
  sync();
}
