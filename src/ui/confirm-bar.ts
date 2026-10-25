// مسؤولية الملف: شريط تأكيد البناء فوق موقعه في العالم — وصف وتكلفة وزرّا ✓ و ✗
// File responsibility: build confirmation bar pinned over its world spot — description, cost, and ✓ / ✗ buttons

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
  show(anchor: Vector3, title: string, detail: string, allowed: boolean, onConfirm: () => void, onCancel: () => void): void {
    this.anchor = anchor;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
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
