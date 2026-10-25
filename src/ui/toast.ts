// مسؤولية الملف: إشعار قصير يظهر أعلى العالم ثم يختفي
// File responsibility: short notification shown over the world, then dismissed

import { esc } from '../utils/html';

export class Toast {
  private timer = 0;

  constructor(private readonly el: HTMLElement) {
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
  }

  /** عرض رسالة لمدة محددة / Show a message for a while */
  show(message: string, ms = 3200): void {
    this.el.innerHTML = `<i></i>${esc(message)}`;
    this.el.hidden = false;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => (this.el.hidden = true), ms);
  }
}
