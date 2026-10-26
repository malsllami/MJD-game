// مسؤولية الملف: شريط التأكيد — فوق موقع المبنى في العالم بزرّي ✓ و ✗، أو مثبت أسفل الشاشة بزرّي "تأكيد" و"إلغاء" وتلميح (للطرق)
// File responsibility: the confirmation bar — over the building's world spot with ✓ / ✗, or docked at the bottom with "confirm" / "cancel" and a hint (for roads)

import type { Vector3 } from '@babylonjs/core';
import { esc } from '../utils/html';
import type { ScreenPoint } from '../world/game-scene';

export class ConfirmBar {
  private anchor: Vector3 | null = null;
  private onConfirm: () => void = () => {};
  private onCancel: () => void = () => {};

  constructor(private readonly el: HTMLElement, private readonly project: (p: Vector3) => ScreenPoint) {
    el.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-confirm]')?.dataset.confirm;
      if (action === 'yes') this.onConfirm();
      else if (action === 'no') this.onCancel();
    });
  }

  /**
   * إظهار الشريط؛ allowed=false يعطّل ✓ ويعرض السبب بدل التكلفة
   * Show the bar; allowed=false disables ✓ and shows the reason instead of the cost
   */
  show(anchor: Vector3 | null, title: string, detail: string, allowed: boolean, onConfirm: () => void, onCancel: () => void, hint = ''): void {
    this.anchor = anchor;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    // بلا موضع: شريط مثبت أسفل الشاشة / Without a spot: a bar docked at the bottom
    this.el.classList.toggle('docked', !anchor);
    if (!anchor) {
      this.el.style.transform = '';
      this.el.style.visibility = 'visible';
      this.el.innerHTML = `
        <div class="confirm-text"><b>${esc(title)}</b><small class="${allowed ? '' : 'bad'}">${esc(detail)}</small></div>
        <div class="confirm-actions">
          <button type="button" class="text-btn cancel" data-confirm="no">إلغاء</button>
          <button type="button" class="text-btn ok" data-confirm="yes" ${allowed ? '' : 'disabled'}>تأكيد</button>
        </div>
        ${hint ? `<p class="confirm-hint">${esc(hint)}</p>` : ''}`;
      this.el.hidden = false;
      return;
    }
    this.el.innerHTML = `
      <div class="confirm-text"><b>${esc(title)}</b><small class="${allowed ? '' : 'bad'}">${esc(detail)}</small></div>
      <button type="button" class="confirm-btn no" data-confirm="no" aria-label="إلغاء">✕</button>
      <button type="button" class="confirm-btn yes" data-confirm="yes" aria-label="تأكيد البناء" ${allowed ? '' : 'disabled'}>✓</button>`;
    this.el.hidden = false;
    this.update();
  }

  hide(): void {
    this.anchor = null;
    this.el.hidden = true;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** يُستدعى كل إطار / Called every frame */
  update(): void {
    if (!this.anchor) return;
    const p = this.project(this.anchor);
    this.el.style.visibility = p.visible ? 'visible' : 'hidden';
    this.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, calc(-100% - 14px))`;
  }
}
