// مسؤولية الملف: شاشة اختيار موقع انطلاق الدولة — بطاقة لكل موقع مقترح مع أرضه وحدوده على الخريطة
// File responsibility: start-site picker — one card per suggested site with its land and its borders on the map

import { Color3 } from '@babylonjs/core';
import { landAround } from '../core/economy';
import type { StartSite } from '../core/start-sites';
import type { GameDefinitions, World } from '../core/types';
import { tileCenter } from '../core/world-gen';
import { formatNumber } from '../utils/format';
import { esc } from '../utils/html';
import type { GameScene } from '../world/game-scene';
import { TileSetOutline } from '../world/tile-set-outline';
import { WorldLabels } from './world-labels';

/**
 * يعرض المواقع وينتظر اختيار اللاعب
 * Shows the sites and waits for the player's choice
 */
export function chooseStartSite(root: HTMLElement, defs: GameDefinitions, world: World, game: GameScene, sites: StartSite[]): Promise<StartSite> {
  const terrain = new Map(defs.terrain.map((t) => [t.id, t]));
  const names = new Map(defs.buildings.map((b) => [b.id, b.name]));
  const first = defs.stages[0];

  const depositNames = new Map(defs.deposits.map((d) => [d.id, d.name]));
  const panel = document.createElement('section');
  panel.className = 'start-picker glass';
  panel.setAttribute('aria-label', 'اختيار موقع الانطلاق');
  const cards = sites
    .map((s, i) => {
      const land = Object.entries(s.terrainCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `<span><i class="swatch" style="background:${esc(terrain.get(id)?.color ?? '#888')}"></i>${esc(terrain.get(id)?.name ?? id)} ${formatNumber(n)}</span>`)
        .join('');
      const warn = s.unbuildable.length
        ? `<p class="warn">لا تتوفر أرض مناسبة لـ: ${esc(s.unbuildable.map((id) => names.get(id) ?? id).join('، '))}</p>`
        : '<p class="fit">تتوفر أرض لكل مباني المرحلة الأولى</p>';
      const found = s.nearbyDeposits.map((id) => depositNames.get(id) ?? id);
      const deposits = `<p class="deposits">${found.length ? `موارد قريبة: ${esc(found.join('، '))}` : 'لا موارد ظاهرة قربه؛ ستحتاج إلى البحث والتوسع'}</p>`;
      return `<button type="button" class="site" data-site="${i}" aria-pressed="false"><b>الموقع ${formatNumber(i + 1)}</b><div class="land">${land}</div>${deposits}${warn}</button>`;
    })
    .join('');
  const side = first.territoryRadius * 2 + 1;
  panel.innerHTML = `
    <header><h2>اختر موقع انطلاق ${esc(defs.world.nationName)}</h2>
      <p>تبدأ ${esc(first.name)} بأرض مسطحة مساحتها ${formatNumber(side)} × ${formatNumber(side)} مربعًا، والجبال والمعادن والغابات حولها تصل إليها بالتوسع.</p></header>
    <div class="sites">${cards}</div>
    <button type="button" class="start-btn" data-start disabled>ابدأ هنا</button>`;
  root.append(panel);

  // اللافتات تحت اللوحة حتى لا تغطي نصها / Labels sit below the panel so they never cover its text
  const labelLayer = document.createElement('div');
  labelLayer.className = 'labels';
  root.prepend(labelLayer);
  const labels = new WorldLabels(labelLayer, (p) => game.project(p));
  sites.forEach((s, i) => {
    const anchor = game.tileAnchor(s);
    anchor.y += world.settings.tileSize;
    labels.set(`site-${i}`, `الموقع ${formatNumber(i + 1)}`, anchor);
  });
  const follow = game.scene.onAfterRenderObservable.add(() => labels.update());
  const outline = new TileSetOutline(game.scene, world, new Color3(0.91, 0.83, 0.6), 0.35);

  let chosen = -1;
  const select = (i: number) => {
    chosen = i;
    const s = sites[i];
    panel.querySelectorAll('[data-site]').forEach((b) => b.setAttribute('aria-pressed', String(Number((b as HTMLElement).dataset.site) === i)));
    panel.querySelector<HTMLButtonElement>('[data-start]')!.disabled = false;
    outline.show(landAround(defs, world, s.x, s.z, first.territoryRadius));
    const c = tileCenter(world, s.x, s.z);
    game.camera.focus(c.x, c.z);
  };

  // النقر على الخريطة قرب موقع يختاره أيضًا / Clicking the map near a site selects it too
  game.onTileClick((tile) => {
    if (!panel.isConnected) return;
    const near = sites.findIndex((s) => Math.hypot(s.x - tile.x, s.z - tile.z) <= 2);
    if (near >= 0) select(near);
  });

  return new Promise((resolve) => {
    panel.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const card = t.closest<HTMLElement>('[data-site]');
      if (card) select(Number(card.dataset.site));
      if (t.closest('[data-start]') && chosen >= 0) {
        game.scene.onAfterRenderObservable.remove(follow);
        outline.clear();
        panel.remove();
        labelLayer.remove();
        resolve(sites[chosen]);
      }
    });
    if (sites.length) select(0);
  });
}
