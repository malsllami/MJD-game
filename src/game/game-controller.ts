// مسؤولية الملف: ربط الجلسة بالعالم والواجهة — الأوضاع (بناء، رسم طريق، نقل)، التحديد والأوامر، الحلقة الزمنية، والحفظ الدوري
// File responsibility: wires the session to the world and HUD — modes (build, road drawing, move), selection and commands, time loop, autosave

import { Color3, type Mesh, type MultiMaterial, type StandardMaterial } from '@babylonjs/core';
import { APP_CONFIG } from '../config/app.config';
import {
  buildingAt, buildingStatus, checkMove, costShare, housingCapacity, isRoad, isSettlementTile, isUnderConstruction,
  netRates, nextStage, stageById, tileKey, tilePath,
} from '../core/economy';
import type { BuildingDef, ContextCommand, EntityType, GameDefinitions, Tile, World } from '../core/types';
import { sampleHeight } from '../core/world-gen';
import { BottomSheet } from '../ui/bottom-sheet';
import { BuildBar } from '../ui/build-bar';
import { createHud, renderCivic, renderClock, renderResources, showBuildView } from '../ui/hud';
import { MinistriesPanel } from '../ui/ministries-panel';
import { Minimap } from '../ui/minimap';
import { RadialMenu, type RadialContent } from '../ui/radial-menu';
import { Toast } from '../ui/toast';
import { WorldLabels } from '../ui/world-labels';
import { formatDuration, formatNumber } from '../utils/format';
import { BuildingModels } from '../world/building-models';
import type { GameScene } from '../world/game-scene';
import { RoadNetwork } from '../world/road-network';
import { createSettlementModel } from '../world/settlements';
import { TileSetOutline } from '../world/tile-set-outline';
import { Traffic } from '../world/traffic';
import type { GameSession } from './game-session';

const TICK_MS = 250;
const HUD_MS = 500;
const AUTOSAVE_MS = 5000;
const CONFIRM_MS = 4000;

/** وضع التفاعل الحالي / Current interaction mode */
type Mode =
  | { kind: 'idle' }
  | { kind: 'place'; building: BuildingDef }
  | { kind: 'road'; building: BuildingDef }
  | { kind: 'move'; uid: string };

/**
 * يشغّل اللعبة فوق مشهد وجلسة جاهزين
 * Runs the game on top of a ready scene and session
 */
export function startGame(root: HTMLElement, defs: GameDefinitions, world: World, game: GameScene, session: GameSession, worldChanged: boolean): void {
  const byId = new Map(defs.buildings.map((b) => [b.id, b]));
  const terrainById = new Map(defs.terrain.map((t) => [t.id, t]));
  const resourceName = (id: string) => defs.resources.find((r) => r.id === id)?.name ?? id;
  const tileAt = (x: number, z: number) => world.tiles[z * world.settings.tilesX + x];
  const mobile = window.matchMedia(APP_CONFIG.mobileLayoutQuery);

  const hud = createHud(root, defs, { rotate: (d) => game.camera.rotate(d), zoom: (d) => game.camera.zoom(d) });
  const toast = new Toast(hud.toast);
  const sheet = new BottomSheet(hud.sheet, hud.sheetHandle);
  const ministries = new MinistriesPanel(hud.ministries, () => ({ defs, world, state: session.state, now: Date.now() }));
  const minimap = new Minimap(hud.minimap, world, defs.terrain, (x, z) => game.camera.focus(x, z));
  const labels = new WorldLabels(hud.labels, (p) => game.project(p));
  const radial = new RadialMenu(hud.radial, (p) => game.project(p), () => mobile.matches);
  const borders = new TileSetOutline(game.scene, world, new Color3(0.9, 0.8, 0.5), 0.35);
  const allowed = new TileSetOutline(game.scene, world, new Color3(0.45, 0.95, 0.6), 0.45);
  const preview = new TileSetOutline(game.scene, world, new Color3(1, 0.85, 0.35), 0.55);
  const roads = new RoadNetwork(game.scene, world, byId, game.dayNight.lights);
  const traffic = new Traffic(game.scene, world);
  const models = new BuildingModels(
    game.scene, world, byId, game.shadows,
    (mesh, placed) => game.registerPickable(mesh, tileAt(placed.x, placed.z)),
    (mesh) => game.unregisterPickable(mesh),
    game.dayNight.lights,
  );
  const buildBar = new BuildBar(hud.buildBar, defs, (b) => pickBuilding(b));

  let mode: Mode = { kind: 'idle' };
  let selected: Tile | null = null;
  let pendingDemolish: { uid: string; until: number } | null = null;

  const labelAbove = (x: number, z: number, lift: number) => {
    const p = game.tileAnchor({ x, z });
    p.y += world.settings.tileSize * lift;
    return p;
  };

  // ===== مركز القرية: يكبر مع كل مرحلة / Settlement centre: grows each stage =====
  const settlementTile = tileAt(session.state.settlement.x, session.state.settlement.z);
  let settlementMesh: Mesh | null = null;
  let settlementStage = '';
  function syncSettlement(): void {
    const { stage } = session.state;
    if (stage === settlementStage) return;
    const level = stageById(defs, stage).order;
    if (settlementMesh) {
      game.unregisterPickable(settlementMesh);
      for (const m of (settlementMesh.material as MultiMaterial | null)?.subMaterials ?? []) if (m) game.dayNight.lights.remove(m as StandardMaterial);
      settlementMesh.dispose(false, true);
    }
    settlementMesh = createSettlementModel(
      game.scene, game.tileAnchor(settlementTile), world.settings.tileSize, world.settings.seed,
      (x, z) => Math.max(0, sampleHeight(world, x, z)), game.shadows, level, game.dayNight.lights,
    );
    game.registerPickable(settlementMesh, settlementTile);
    if (settlementStage) toast.show(`أصبحت ${defs.world.capitalName} ${stageById(defs, stage).name}! فُتحت مبانٍ جديدة وتوسعت الحدود`, 6000);
    settlementStage = stage;
  }

  // ===== الأوضاع / Modes =====

  function setMode(next: Mode): void {
    mode = next;
    buildBar.setArmed(next.kind === 'place' || next.kind === 'road' ? next.building.id : null);
    preview.clear();
    game.setTileDrag(next.kind === 'road' ? roadDrawing(next.building) : null);
    refreshAllowed();
  }

  /** المربعات المسموحة للوضع الحالي باللون الأخضر / Allowed tiles for the current mode, in green */
  function refreshAllowed(): void {
    const now = Date.now();
    const state = session.state;
    const current = mode;
    if (current.kind === 'idle') return allowed.clear();
    const fits = (key: string): boolean => {
      const [x, z] = key.split(',').map(Number);
      const tile = tileAt(x, z);
      if (current.kind === 'move') return checkMove(defs, state, current.uid, tile, now).ok;
      const occupant = buildingAt(state, x, z);
      const free = !occupant || (current.kind === 'road' && isRoad(byId.get(occupant.buildingId)));
      return !isSettlementTile(state, x, z) && current.building.allowedTerrain.includes(tile.terrainId) && free;
    };
    allowed.show(state.territory.filter(fits));
  }

  /** اختيار بطاقة: طريق للرسم، أو مبنى يُبنى على المربع المحدد أو ينتظر مربعًا / Card pick: road to draw, or a building */
  function pickBuilding(b: BuildingDef): void {
    if ((mode.kind === 'place' || mode.kind === 'road') && mode.building.id === b.id) return setMode({ kind: 'idle' });
    if (isRoad(b)) {
      closeSelection();
      setMode({ kind: 'road', building: b });
      toast.show(`اسحب على الخريطة لرسم ${b.name} من القرية أو من طريق قائم. اضغط البطاقة مرة أخرى أو Esc للإنهاء`, 5000);
      return;
    }
    if (selected && !isSettlementTile(session.state, selected.x, selected.z) && !buildingAt(session.state, selected.x, selected.z) &&
        session.state.territory.includes(tileKey(selected.x, selected.z))) {
      tryBuild(b, selected);
      return;
    }
    setMode({ kind: 'place', building: b });
    toast.show(`اختر مربعًا من المربعات الخضراء لبناء ${b.name}`);
  }

  function tryBuild(b: BuildingDef, tile: Tile): void {
    const result = session.place(b, tile, Date.now());
    if (!result.ok) return toast.show(result.reason);
    toast.show(`بدأ بناء ${b.name} · ${formatDuration(b.buildSeconds)}`);
    setMode({ kind: 'idle' });
    closeSelection();
    refresh(true);
  }

  /** رسم الطريق بالسحب: يجمع مسارًا متصلًا ثم يبنيه عند الإفلات / Drag to draw: collect a connected path, lay it on release */
  function roadDrawing(road: BuildingDef) {
    let path: { x: number; z: number }[] = [];
    const show = () => preview.show(path.map((p) => tileKey(p.x, p.z)));
    return {
      start(tile: Tile) {
        path = [{ x: tile.x, z: tile.z }];
        show();
      },
      move(tile: Tile) {
        const last = path[path.length - 1];
        for (const p of tilePath(last, tile).slice(1)) {
          // الرجوع على المسار يمحو آخر خطوة / Stepping back onto the path erases the last step
          const back = path.length > 1 && path[path.length - 2].x === p.x && path[path.length - 2].z === p.z;
          if (back) path.pop();
          else if (!path.some((q) => q.x === p.x && q.z === p.z)) path.push(p);
        }
        show();
      },
      end() {
        const tiles = path.map((p) => tileAt(p.x, p.z));
        path = [];
        preview.clear();
        const result = session.placeRoad(road, tiles, Date.now());
        if (result.placed) toast.show(`بدأ بناء ${formatNumber(result.placed)} مربع ${road.name}${result.stoppedBy ? `، وتوقف الرسم: ${result.stoppedBy}` : ''}`);
        else if (result.stoppedBy) toast.show(result.stoppedBy);
        refresh(true);
      },
    };
  }

  // ===== التحديد والأوامر / Selection and commands =====

  game.onTileClick((tile) => {
    if (mode.kind === 'place') return tryBuild(mode.building, tile);
    if (mode.kind === 'move') {
      const result = session.move(mode.uid, tile, Date.now());
      toast.show(result.ok ? 'نُقل المبنى إلى موقعه الجديد' : result.reason);
      if (result.ok) {
        setMode({ kind: 'idle' });
        refresh(true);
      }
      return;
    }
    selected = tile;
    game.highlight(tile);
    radial.open(game.tileAnchor(tile), describe(tile), (cmd) => runCommand(cmd, tile));
  });

  function closeSelection(): void {
    selected = null;
    radial.close();
    game.highlight(null);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (mode.kind !== 'idle') setMode({ kind: 'idle' });
    else closeSelection();
  });

  /** نوع العنصر في المربع وعنوان القائمة / Entity on the tile and the menu heading */
  function describe(tile: Tile): RadialContent {
    const now = Date.now();
    const state = session.state;
    const terrain = terrainById.get(tile.terrainId);
    const coords = `المربع ${formatNumber(tile.x + 1)}، ${formatNumber(tile.z + 1)}`;
    const placed = buildingAt(state, tile.x, tile.z);
    const owned = state.territory.includes(tileKey(tile.x, tile.z));
    let entity: EntityType | null = terrain?.isWater ? null : 'empty_tile';
    let title = terrain?.name ?? '';
    let subtitle = `${coords} · ${owned ? 'داخل الدولة' : 'خارج الدولة'}`;
    if (isSettlementTile(state, tile.x, tile.z)) {
      entity = 'city';
      title = defs.world.capitalName;
      subtitle = `${stageById(defs, state.stage).name} · ${formatNumber(Math.floor(state.population))} نسمة`;
    } else if (placed) {
      entity = 'building';
      title = byId.get(placed.buildingId)?.name ?? placed.buildingId;
      subtitle = statusText(placed.uid, now);
    }
    const commands = entity ? (defs.contextMenus.find((m) => m.entityType === entity)?.commands ?? []) : [];
    return { title, subtitle, commands };
  }

  function statusText(uid: string, now: number): string {
    const placed = session.state.buildings.find((b) => b.uid === uid);
    if (!placed) return '';
    const status = buildingStatus(placed, session.state, defs, now);
    switch (status.kind) {
      case 'constructing': return `تحت الإنشاء · ${formatDuration(Math.ceil((placed.completesAt - now) / 1000))}`;
      case 'disconnected': return 'متوقف · لا يصله طريق متصل بالقرية';
      case 'stopped': return `متوقف · ينقصه ${status.missing.map(resourceName).join('، ')}`;
      default: return 'يعمل';
    }
  }

  /** أول طريق مفتوح في المرحلة الحالية / First road unlocked at the current stage */
  function availableRoad(): BuildingDef | undefined {
    const order = stageById(defs, session.state.stage).order;
    return defs.buildings.filter((b) => isRoad(b) && stageById(defs, b.stage).order <= order).at(-1);
  }

  /** تنفيذ أمر من القائمة الدائرية / Run a radial-menu command */
  function runCommand(cmd: ContextCommand, tile: Tile): void {
    const now = Date.now();
    const state = session.state;
    const placed = buildingAt(state, tile.x, tile.z);
    const def = placed && byId.get(placed.buildingId);
    switch (cmd.id) {
      case 'build': {
        if (isSettlementTile(state, tile.x, tile.z) || placed || !state.territory.includes(tileKey(tile.x, tile.z))) {
          return toast.show('اختر مربعًا فارغًا داخل حدود الدولة للبناء عليه');
        }
        if (mobile.matches) {
          showBuildView(hud.sheet);
          sheet.reveal();
        }
        return toast.show('اختر مبنى من شريط البناء لبنائه على هذا المربع');
      }
      case 'road':
      case 'roads': {
        const road = availableRoad();
        if (!road) return toast.show('لا يوجد طريق مفتوح في هذه المرحلة');
        closeSelection();
        setMode({ kind: 'road', building: road });
        return toast.show(`اسحب على الخريطة لرسم ${road.name}. اضغط Esc أو بطاقة الطريق للإنهاء`, 5000);
      }
      case 'move': {
        if (!placed || !def) return;
        const price = Object.entries(costShare(def.cost, defs.world.moveCostPercent)).map(([id, n]) => `${formatNumber(n)} ${resourceName(id)}`).join('، ');
        closeSelection();
        setMode({ kind: 'move', uid: placed.uid });
        return toast.show(`اختر موقعًا جديدًا لـ${def.name} من المربعات الخضراء${price ? ` · تكلفة النقل ${price}` : ''}`, 5000);
      }
      case 'demolish': {
        if (!placed || !def) return;
        if (pendingDemolish?.uid !== placed.uid || pendingDemolish.until < now) {
          pendingDemolish = { uid: placed.uid, until: now + CONFIRM_MS };
          return toast.show(`اضغط «${cmd.name}» مرة أخرى خلال ${formatNumber(CONFIRM_MS / 1000)} ثوانٍ لتأكيد هدم ${def.name}`);
        }
        pendingDemolish = null;
        session.demolish(placed.uid, now);
        closeSelection();
        refresh(true);
        return toast.show(`هُدم ${def.name} واسترددت ${formatNumber(defs.world.demolishRefundPercent)}٪ من تكلفته`);
      }
      case 'annex': {
        const result = session.annex(tile, now);
        toast.show(result.ok ? `انضم المربع إلى الدولة مقابل ${formatNumber(defs.world.annexCost)} ${resourceName(defs.world.annexResource)}` : result.reason);
        if (result.ok) {
          refresh(true);
          radial.open(game.tileAnchor(tile), describe(tile), (c) => runCommand(c, tile));
        }
        return;
      }
      case 'info': {
        if (placed && def) {
          const out = Object.entries(def.production).map(([id, n]) => `+${formatNumber(n)} ${resourceName(id)}`);
          const use = Object.entries(def.consumption).map(([id, n]) => `−${formatNumber(n)} ${resourceName(id)}`);
          const flows = [...out, ...use].join('، ');
          return toast.show(`${def.name}: ${statusText(placed.uid, now)}${flows ? ` · في الدقيقة ${flows}` : ''}${def.housing ? ` · يسكنه ${formatNumber(def.housing)}` : ''}`, 6000);
        }
        const fits = defs.buildings.filter((b) => b.allowedTerrain.includes(tile.terrainId) && !isRoad(b)).map((b) => b.name).join('، ');
        return toast.show(`${terrainById.get(tile.terrainId)?.name}: ${fits ? `يصلح لبناء ${fits}` : 'لا يصلح لأي مبنى'}`, 6000);
      }
      default:
        toast.show(`أمر «${cmd.name}» يُفعَّل مع الأنظمة القادمة`);
    }
  }

  // ===== الحلقة الزمنية والتحديث / Time loop and refresh =====

  let lastHud = 0;
  const completed = new Set(session.state.buildings.filter((b) => !isUnderConstruction(b, Date.now())).map((b) => b.uid));
  function refresh(force = false): void {
    const now = Date.now();
    session.tick(now);
    const state = session.state;
    syncSettlement();
    models.sync(state, now);
    roads.sync(state);
    traffic.sync(roads.tilesByStyle(state).get('paved-road') ?? new Set(), state.population);
    borders.show(state.territory);

    // لافتات: عدّاد فوق ما يُبنى، وتحذير فوق المتوقف / Labels: timer over construction, warning over stopped buildings
    const keep = new Set<string>(['settlement']);
    labels.set('settlement', `${defs.world.capitalName} · ${stageById(defs, state.stage).name}`, labelAbove(settlementTile.x, settlementTile.z, 1.5));
    for (const b of state.buildings) {
      const def = byId.get(b.buildingId);
      const status = buildingStatus(b, state, defs, now);
      if (status.kind === 'constructing' && !isRoad(def)) {
        keep.add(`c-${b.uid}`);
        labels.set(`c-${b.uid}`, `${def?.name ?? ''} · ${formatDuration(Math.ceil((b.completesAt - now) / 1000))}`, labelAbove(b.x, b.z, 1.2), 'pin-build');
      } else if (status.kind === 'stopped' || status.kind === 'disconnected') {
        keep.add(`s-${b.uid}`);
        labels.set(`s-${b.uid}`, status.kind === 'disconnected' ? 'بلا طريق' : `ينقصه ${status.missing.map(resourceName).join('، ')}`, labelAbove(b.x, b.z, 1.1), 'pin-warn');
      }
      if (status.kind !== 'constructing' && !completed.has(b.uid)) {
        completed.add(b.uid);
        if (!isRoad(def)) toast.show(`اكتمل بناء ${def?.name ?? ''}`);
      }
    }
    for (const key of labels.keys()) if (!keep.has(key)) labels.remove(key);

    if (force || now - lastHud >= HUD_MS) {
      lastHud = now;
      if (mode.kind !== 'idle') refreshAllowed();
      renderResources(root, defs, state, netRates(state, defs, now));
      renderCivic(root, stageById(defs, state.stage).name, state.population, housingCapacity(state, defs, now), nextStage(defs, state.stage));
      renderClock(root, game.dayNight.dayFraction);
      buildBar.update(state, now);
      ministries.refresh();
      minimap.setOverlay(state.territory, [{ x: settlementTile.x, z: settlementTile.z, emphasis: true }]);
    }
  }

  window.setInterval(() => refresh(), TICK_MS);
  window.setInterval(() => session.persist(), AUTOSAVE_MS);
  const saveNow = () => session.persist();
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow());

  game.scene.onAfterRenderObservable.add(() => {
    radial.update();
    labels.update();
    const cam = game.camera.camera;
    minimap.update(cam.target.x, cam.target.z, -Math.PI / 2 - cam.alpha);
  });

  const start = game.tileAnchor(settlementTile);
  game.camera.focus(start.x, start.z);
  refresh(true);
  announceStart();

  /** رسالة البداية / Start message */
  function announceStart(): void {
    const s = session.start;
    if (worldChanged) {
      toast.show('تغيّرت إعدادات توليد العالم في قاعدة البيانات، فبدأت دولة جديدة', 6000);
    } else if (s.kind === 'new') {
      toast.show('ابدأ برسم طريق من القرية، ثم ابنِ المساكن بجواره ومحطة تحلية على الساحل', 7000);
    } else if (s.resume.creditedMs >= 60_000) {
      const gained = Object.entries(s.resume.gained).map(([id, n]) => `${formatNumber(Math.floor(n))} ${resourceName(id)}`).join('، ');
      const capped = s.resume.awayMs > s.resume.creditedMs ? ` (حُسبت أول ${formatNumber(defs.world.offlineCapHours)} ساعات فقط)` : '';
      if (gained) toast.show(`أثناء غيابك أنتجت الدولة: ${gained}${capped}`, 7000);
    }
  }
}
