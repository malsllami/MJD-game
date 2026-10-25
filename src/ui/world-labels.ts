// مسؤولية الملف: لافتات فوق العناصر في العالم (اسم العاصمة، عدّاد الإنشاء) تتبع الكاميرا
// File responsibility: labels pinned over world entities (capital name, construction timers), following the camera

import type { Vector3 } from '@babylonjs/core';
import type { ScreenPoint } from '../world/game-scene';

interface Label {
  el: HTMLElement;
  anchor: Vector3;
}

export class WorldLabels {
  private readonly labels = new Map<string, Label>();

  constructor(private readonly root: HTMLElement, private readonly project: (p: Vector3) => ScreenPoint) {}

  /** إضافة لافتة أو تحديث نصها / Add a label or update its text */
  set(key: string, text: string, anchor: Vector3, variant = ''): void {
    let label = this.labels.get(key);
    if (!label) {
      const el = document.createElement('div');
      el.className = `pin ${variant}`.trim();
      this.root.append(el);
      label = { el, anchor };
      this.labels.set(key, label);
    }
    if (label.el.textContent !== text) label.el.textContent = text;
  }

  remove(key: string): void {
    this.labels.get(key)?.el.remove();
    this.labels.delete(key);
  }

  /** مفاتيح اللافتات الحالية / Current label keys */
  keys(): string[] {
    return [...this.labels.keys()];
  }

  /** يُستدعى كل إطار / Called every frame */
  update(): void {
    for (const l of this.labels.values()) {
      const p = this.project(l.anchor);
      l.el.style.visibility = p.visible ? 'visible' : 'hidden';
      l.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
  }
}
