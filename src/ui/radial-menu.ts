// مسؤولية الملف: قائمة الأوامر الدائرية حول العنصر المحدد، وتتبع موقعه أثناء حركة الكاميرا
// File responsibility: radial command menu around the selected entity, following it as the camera moves

import type { Vector3 } from '@babylonjs/core';
import { APP_CONFIG } from '../config/app.config';
import type { ContextCommand } from '../core/types';
import type { ScreenPoint } from '../world/game-scene';
import { esc } from '../utils/html';
import { icon } from './icons';

export interface RadialContent {
  title: string;
  subtitle: string;
  commands: ContextCommand[];
}

export class RadialMenu {
  private anchor: Vector3 | null = null;
  private commands: ContextCommand[] = [];
  private onCommand: (cmd: ContextCommand) => void = () => {};

  constructor(
    private readonly el: HTMLElement,
    private readonly project: (p: Vector3) => ScreenPoint,
    private readonly isMobile: () => boolean,
  ) {
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cmd]');
      if (!btn) return;
      const cmd = this.commands[Number(btn.dataset.cmd)];
      if (cmd) this.onCommand(cmd);
    });
  }

  /** فتح القائمة حول نقطة في العالم / Open the menu around a world point */
  open(anchor: Vector3, content: RadialContent, onCommand: (cmd: ContextCommand) => void): void {
    this.anchor = anchor;
    this.commands = content.commands;
    this.onCommand = onCommand;
    const radius = this.isMobile() ? APP_CONFIG.radialMenu.radiusMobile : APP_CONFIG.radialMenu.radiusDesktop;
    const n = content.commands.length;
    // الأمر الأول في الأعلى، والبقية بالتساوي مع اتجاه عقارب الساعة / First command on top, rest clockwise
    const buttons = content.commands
      .map((c, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        return `<button type="button" class="opt" data-cmd="${i}" style="transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px)">${icon(c.icon)}<span>${esc(c.name)}</span></button>`;
      })
      .join('');
    this.el.style.setProperty('--r', `${radius}px`);
    this.el.innerHTML = `<div class="ring"></div><div class="core"></div>${buttons}
      <div class="label" style="transform:translate(-50%, ${radius + 40}px)"><b>${esc(content.title)}</b><small>${esc(content.subtitle)}</small></div>`;
    this.el.hidden = false;
    this.update();
  }

  close(): void {
    this.anchor = null;
    this.el.hidden = true;
  }

  /** يُستدعى كل إطار لتحديث الموقع على الشاشة / Called every frame to follow the anchor on screen */
  update(): void {
    if (!this.anchor) return;
    const p = this.project(this.anchor);
    this.el.style.visibility = p.visible ? 'visible' : 'hidden';
    this.el.style.left = `${p.x}px`;
    this.el.style.top = `${p.y}px`;
  }
}
