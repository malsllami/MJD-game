// مسؤولية الملف: ربط الجلسة بالعالم والواجهة — الأوضاع (بناء، رسم طرق على الشبكة، هدم طرق، نقل)، التحديد والأوامر،
// المكامن والمسح، الحلقة الزمنية، والحفظ الدوري
// File responsibility: wires the session to the world and HUD — modes (build, draw roads on the grid, bulldoze roads, move),
// selection and commands, deposits and survey, the time loop and autosave

import { Color3, type AbstractMesh, type TransformNode } from '@babylonjs/core';
import { eraOf } from '../assets/catalog';
import { APP_CONFIG } from '../config/app.config';
import {
  buildingAt, buildingStatus, checkMove, checkPlacement, cornerPath, costShare, depositAt, edgeTiles, housingCapacity, isRoad,
  isSettlementTile, isUnderConstruction, netRates, nextStage, pathEdges, placeRoadPath, roadAt, stageById, surveyCost, tileKey,
} from '../core/economy';
import type { BuildingDef, ContextCommand, EntityType, GameDefinitions, Tile, World } from '../core/types';
import { BottomSheet } from '../ui/bottom-sheet';
import { BuildBar } from '../ui/build-bar';
import { ConfirmBar } from '../ui/confirm-bar';
import { createHud, renderCivic, renderClock, renderResources, showBuildView } from '../ui/hud';
import { MinistriesPanel } from '../ui/ministries-panel';
import { Minimap } from '../ui/minimap';
import { RadialMenu, type RadialContent } from '../ui/radial-menu';
import { Toast } from '../ui/toast';
import { ToolDrawer } from '../ui/tool-drawer';
import { WorldLabels } from '../ui/world-labels';
import { formatDuration, formatNumber } from '../utils/format';
import { BuildingModels, partsFor } from '../world/building-models';
import type { DragPoint, GameScene } from '../world/game-scene';
import { GhostPreview } from '../world/ghost-preview';
import { GridLines } from '../world/grid-lines';
import { RoadNetwork } from '../world/road-network';
import { createSettlementModel } from '../world/settlements';
import { Thumbnails } from '../world/thumbnails';
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
  | { kind: 'bulldoze' }
  | { kind: 'move'; uid: string };

/**
 * يشغّل اللعبة فوق مشهد وجلسة جاهزين
 * Runs the game on top of a ready scene and session
 */
export function startGame(root: HTMLElement, defs: GameDefinitions, world: World, game: GameScene, session: GameSession, worldChanged: boolean): void {
  const byId = new Map(defs.buildings.map((b) => [b.id, b]));
  const terrainById = new Map(defs.terrain.map((t) => [t.id, t]));
  const depositTypeById = new Map(defs.deposits.map((d) => [d.id, d]));
  const resourceName = (id: string) => defs.resources.find((r) => r.id === id)?.name ?? id;
  const tileAt = (x: number, z: number) => world.tiles[z * world.settings.tilesX + x];
  const mobile = window.matchMedia(APP_CONFIG.mobileLayoutQuery);
  const governmentName = defs.world.governmentName || defs.world.capitalName;

  const hud = createHud(root, defs, { rotate: (d) => game.camera.rotate(d), zoom: (d) => game.camera.zoom(d) });
  const toast = new Toast(hud.toast);
  const sheet = new BottomSheet(hud.sheet, hud.sheetHandle);
  const ministries = new MinistriesPanel(hud.ministries, () => ({ defs, world, state: session.state, now: Date.now() }));
  const minimap = new Minimap(hud.minimap, world, defs.terrain, (x, z) => game.camera.focus(x, z));
  const labels = new WorldLabels(hud.labels, (p) => game.project(p));
  const radial = new RadialMenu(hud.radial, (p) => game.project(p), () => mobile.matches);
  const borders = new TileSetOutline(game.scene, world, new Color3(0.9, 0.8, 0.5), 0.35);
  const allowed = new TileSetOutline(game.scene, world, new Color3(0.45, 0.95, 0.6), 0.45);
  // شبكة خضراء تظهر عند البناء والرسم، أو دائمًا بزر الشبكة / A green grid shown while building and drawing, or always via the grid button
  const grid = new GridLines(game.scene, world, new Color3(0.62, 1, 0.55), 0.3, 0.12);
  const roadPreview = new GridLines(game.scene, world, new Color3(1, 0.85, 0.35), 1, 0.3);
  // الطريق الترابي ترسمه خامة الأرض حين تتوفر / The dirt road is painted by the ground texture when available
  const roads = new RoadNetwork(game.scene, world, byId, game.dayNight.lights, game.ground ? new Set(['road']) : new Set());
  const traffic = new Traffic(game.scene, world, game.library);
  const models = new BuildingModels(
    game.scene, world, game.library, byId, game.shadows,
    (mesh, placed) => game.registerPickable(mesh, tileAt(placed.x, placed.z)),
    (mesh) => game.unregisterPickable(mesh),
    game.dayNight.lights,
  );
  const nature = game.nature;
  const ghost = new GhostPreview(game.scene, world, game.library);
  const confirm = new ConfirmBar(hud.confirm, (p) => game.project(p));
  /** عصر الدولة البصري من مرحلتها الحالية / The nation's visual era from its current stage */
  const era = () => eraOf(stageById(defs, session.state.stage).order);
  const thumbnails = new Thumbnails(game.scene, game.library, world.settings.tileSize);
  const buildBar = new BuildBar(hud.buildBar, defs, (b) => pickBuilding(b), (style) => thumbnails.get(style, era()));
  const tools = new ToolDrawer(
    hud.toolNav, hud.drawer, () => ({ defs, world, state: session.state, now: Date.now() }),
    (x, z) => {
      const p = game.tileAnchor({ x, z });
      game.camera.focus(p.x, p.z);
    },
    (expanded) => root.classList.toggle('map-expanded', expanded),
  );

  let mode: Mode = { kind: 'idle' };
  let gridAlways = false;
  grid.setVisible(false);
  let selected: Tile | null = null;
  let pendingDemolish: { uid: string; until: number } | null = null;

  const labelAbove = (x: number, z: number, lift: number) => {
    const p = game.tileAnchor({ x, z });
    p.y += world.settings.tileSize * lift;
    return p;
  };
  const costText = (cost: Record<string, number>) => Object.entries(cost).map(([id, n]) => `${formatNumber(n)} ${resourceName(id)}`).join('، ');

  // ===== مبنى الحكم: أول مبنى في القرية، يكبر مع كل مرحلة / Government building: the village's first building, growing each stage =====
  const settlementTile = tileAt(session.state.settlement.x, session.state.settlement.z);
  let settlement: { root: TransformNode; meshes: AbstractMesh[] } | null = null;
  let settlementStage = '';
  function syncSettlement(): void {
    const { stage } = session.state;
    if (stage === settlementStage) return;
    const announce = !!settlementStage;
    settlementStage = stage;
    void createSettlementModel(
      game.library, game.scene, game.tileAnchor(settlementTile), world.settings.tileSize, stageById(defs, stage).order, game.shadows, game.dayNight.lights,
    ).then((next) => {
      if (settlement) {
        for (const m of settlement.meshes) game.unregisterPickable(m);
        settlement.root.dispose();
      }
      settlement = next;
      for (const m of next.meshes) {
        m.isPickable = true;
        game.registerPickable(m, settlementTile);
      }
    });
    if (announce) toast.show(`أصبحت ${defs.world.capitalName} ${stageById(defs, stage).name}! فُتحت مبانٍ جديدة وتوسعت الحدود`, 6000);
  }

  // ===== الأوضاع / Modes =====

  function setMode(next: Mode): void {
    mode = next;
    grid.setVisible(gridAlways || next.kind !== 'idle');
    buildBar.setArmed(next.kind === 'place' || next.kind === 'road' ? next.building.id : null);
    roadPreview.clear();
    clearPreview();
    game.setTileDrag(next.kind === 'road' ? gridDrawing(next.building) : next.kind === 'bulldoze' ? gridDrawing(null) : null);
    refreshAllowed();
  }

  /** المربعات المسموحة للوضع الحالي باللون الأخضر / Allowed tiles for the current mode, in green */
  function refreshAllowed(): void {
    const now = Date.now();
    const state = session.state;
    const current = mode;
    if (current.kind !== 'place' && current.kind !== 'move') return allowed.clear();
    const fits = (key: string): boolean => {
      const [x, z] = key.split(',').map(Number);
      const tile = tileAt(x, z);
      if (current.kind === 'move') return checkMove(defs, world, state, current.uid, tile, now).ok;
      const b = current.building;
      if (isSettlementTile(state, x, z) || buildingAt(state, x, z) || !b.allowedTerrain.includes(tile.terrainId)) return false;
      return !b.requiresDeposit || !!depositAt(world, state, x, z, b.requiresDeposit);
    };
    allowed.show(state.territory.filter(fits));
  }

  /** اختيار بطاقة: طريق للرسم، أو مبنى يُعاين على المربع المحدد أو ينتظر مربعًا / Card pick: a road to draw, or a building */
  function pickBuilding(b: BuildingDef): void {
    if ((mode.kind === 'place' || mode.kind === 'road') && mode.building.id === b.id) return setMode({ kind: 'idle' });
    closeSelection();
    if (isRoad(b)) {
      setMode({ kind: 'road', building: b });
      toast.show(`اسحب على خطوط الشبكة لتخطيط ${b.name} من حول ${governmentName} أو من طريق قائم، ثم أكّد بعلامة ✓`, 6000);
      return;
    }
    const target = selected;
    setMode({ kind: 'place', building: b });
    if (target && session.state.territory.includes(tileKey(target.x, target.z)) && !buildingAt(session.state, target.x, target.z)) return previewBuild(b, target);
    const hint = b.requiresDeposit ? ` على ${defs.deposits.find((d) => d.resourceId === b.requiresDeposit)?.name ?? 'مكمن'} مكتشف` : '';
    toast.show(`اختر مربعًا أخضر${hint} لمعاينة ${b.name}، ثم أكّد بعلامة ✓`);
  }

  /** معاينة المبنى على المربع مع شريط تأكيد / Preview the building on the tile with a confirmation bar */
  function previewBuild(b: BuildingDef, tile: Tile): void {
    const check = checkPlacement(defs, world, session.state, b, tile, Date.now());
    ghost.show(partsFor(b.model, `preview-${b.id}`, era()), tile, check.ok);
    const detail = check.ok ? `${formatDuration(b.buildSeconds)} · ${costText(b.cost)}` : check.reason;
    confirm.show(labelAbove(tile.x, tile.z, 0.6), b.name, detail, check.ok, () => tryBuild(b, tile), clearPreview);
  }

  function clearPreview(): void {
    ghost.hide();
    confirm.hide();
  }

  function tryBuild(b: BuildingDef, tile: Tile): void {
    const result = session.place(b, tile, Date.now());
    if (!result.ok) return toast.show(result.reason);
    toast.show(`بدأ بناء ${b.name} · ${formatDuration(b.buildSeconds)}`);
    setMode({ kind: 'idle' });
    refresh(true);
  }

  /**
   * السحب على خطوط الشبكة من زاوية إلى زاوية: يرسم طريقًا (road) أو يحدد طرقًا للهدم (null)، ثم ينتظر التأكيد
   * Drag along grid lines corner to corner: lays a road (road) or marks roads to remove (null), then waits for confirmation
   */
  function gridDrawing(road: BuildingDef | null) {
    let corners: { x: number; z: number }[] = [];
    const edges = () => {
      const all = pathEdges(corners);
      return road ? all : all.filter((e) => roadAt(session.state, e));
    };
    const show = () => roadPreview.showEdges(edges(), road ? new Color3(1, 0.85, 0.35) : new Color3(1, 0.35, 0.3));
    const reset = () => {
      corners = [];
      roadPreview.clear();
      confirm.hide();
    };
    return {
      start(at: DragPoint) {
        confirm.hide();
        corners = [at.corner];
        show();
      },
      move(at: DragPoint) {
        for (const p of cornerPath(corners[corners.length - 1], at.corner).slice(1)) {
          // الرجوع على المسار يمحو آخر خطوة / Stepping back onto the path erases the last step
          const back = corners.length > 1 && corners[corners.length - 2].x === p.x && corners[corners.length - 2].z === p.z;
          if (back) corners.pop();
          else if (!corners.some((q) => q.x === p.x && q.z === p.z)) corners.push(p);
        }
        show();
      },
      // عند الإفلات تبقى المعاينة وينتظر التأكيد / On release the preview stays and waits for confirmation
      end() {
        const list = edges();
        const last = corners[corners.length - 1];
        if (!last) return;
        const anchor = game.tileAnchor({ x: Math.min(world.settings.tilesX - 1, last.x), z: Math.min(world.settings.tilesZ - 1, last.z) });
        anchor.y += world.settings.tileSize * 0.4;
        if (!road) {
          return confirm.show(anchor, 'هدم الطرق', list.length ? `${formatNumber(list.length)} قطعة طريق` : 'لا طرق في هذا المسار', list.length > 0, () => {
            const removed = session.demolishRoads(list, Date.now());
            toast.show(`أُزيلت ${formatNumber(removed)} قطعة طريق واسترددت ${formatNumber(defs.world.demolishRefundPercent)}٪ من تكلفتها`);
            reset();
            refresh(true);
          }, reset);
        }
        const dry = placeRoadPath(session.state, defs, world, road, list, Date.now(), () => 'preview');
        const total = Object.fromEntries(Object.entries(road.cost).map(([id, n]) => [id, n * dry.placed]));
        const detail = dry.placed
          ? `${formatNumber(dry.placed)} قطعة · ${costText(total)}${dry.stoppedBy ? ` · يتوقف: ${dry.stoppedBy}` : ''}`
          : (dry.stoppedBy ?? 'لا قطع جديدة في هذا المسار');
        confirm.show(anchor, road.name, detail, dry.placed > 0, () => {
          const result = session.placeRoad(road, list, Date.now());
          if (result.placed) toast.show(`بدأ بناء ${formatNumber(result.placed)} قطعة ${road.name}`);
          else if (result.stoppedBy) toast.show(result.stoppedBy);
          reset();
          refresh(true);
        }, reset);
      },
    };
  }

  // ===== التحديد والأوامر / Selection and commands =====

  game.onTileClick((tile) => {
    if (mode.kind === 'place') return previewBuild(mode.building, tile);
    if (mode.kind === 'move') return previewMove(mode.uid, tile);
    if (mode.kind === 'road' || mode.kind === 'bulldoze') return;
    selected = tile;
    game.highlight(tile);
    radial.open(game.tileAnchor(tile), describe(tile), (cmd) => runCommand(cmd, tile));
  });

  /** معاينة نقل المبنى إلى مربع جديد مع تكلفة النقل / Preview moving a building to a new tile with its cost */
  function previewMove(uid: string, tile: Tile): void {
    const placed = session.state.buildings.find((b) => b.uid === uid);
    const def = placed && byId.get(placed.buildingId);
    if (!placed || !def) return setMode({ kind: 'idle' });
    const check = checkMove(defs, world, session.state, uid, tile, Date.now());
    ghost.show(partsFor(def.model, uid, era()), tile, check.ok);
    const detail = check.ok ? `تكلفة النقل ${costText(costShare(def.cost, defs.world.moveCostPercent)) || 'مجانًا'}` : check.reason;
    confirm.show(labelAbove(tile.x, tile.z, 0.6), `نقل ${def.name}`, detail, check.ok, () => {
      const result = session.move(uid, tile, Date.now());
      toast.show(result.ok ? 'نُقل المبنى إلى موقعه الجديد' : result.reason);
      if (result.ok) {
        setMode({ kind: 'idle' });
        refresh(true);
      }
    }, clearPreview);
  }

  function closeSelection(): void {
    selected = null;
    radial.close();
    game.highlight(null);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (confirm.visible) {
      clearPreview();
      roadPreview.clear();
    } else if (mode.kind !== 'idle') setMode({ kind: 'idle' });
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
    const deposit = depositAt(world, state, tile.x, tile.z);
    let entity: EntityType | null = terrain?.isWater ? null : 'empty_tile';
    let title = deposit ? (depositTypeById.get(deposit.typeId)?.name ?? '') : (terrain?.name ?? '');
    let subtitle = `${coords} · ${owned ? 'داخل الدولة' : 'خارج الدولة'}`;
    if (isSettlementTile(state, tile.x, tile.z)) {
      entity = 'city';
      title = governmentName;
      subtitle = `${defs.world.capitalName} · ${stageById(defs, state.stage).name} · ${formatNumber(Math.floor(state.population))} نسمة`;
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
      case 'disconnected': return `متوقف · لا يطل على طريق متصل بـ${governmentName}`;
      case 'stopped': return `متوقف · ينقصه ${status.missing.map(resourceName).join('، ')}`;
      default: return 'يعمل';
    }
  }

  /** أحدث طريق مفتوح في المرحلة الحالية / The latest road unlocked at the current stage */
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
        return toast.show(`اسحب على خطوط الشبكة لرسم ${road.name}، ثم أكّد بعلامة ✓`, 5000);
      }
      case 'survey': {
        const result = session.survey(tile, now);
        if ('reason' in result) return toast.show(result.reason);
        const names = [...new Set(result.found.map((d) => depositTypeById.get(d.typeId)?.name ?? d.typeId))].join('، ');
        refresh(true);
        return toast.show(names ? `اكتشف المسح: ${names}` : `لم يجد المسح مكامن جديدة حول هذا المربع · ${costText(surveyCost(defs))}`, 6000);
      }
      case 'move': {
        if (!placed || !def) return;
        const price = costText(costShare(def.cost, defs.world.moveCostPercent));
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
        toast.show(result.ok ? `انضمت قطعة أرض جديدة إلى الدولة مقابل ${formatNumber(defs.world.annexCost)} ${resourceName(defs.world.annexResource)}` : result.reason);
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
        const deposit = depositAt(world, state, tile.x, tile.z);
        const fits = defs.buildings
          .filter((b) => !isRoad(b) && b.allowedTerrain.includes(tile.terrainId) && (!b.requiresDeposit || deposit?.resourceId === b.requiresDeposit))
          .map((b) => b.name).join('، ');
        const where = deposit ? depositTypeById.get(deposit.typeId)?.name : terrainById.get(tile.terrainId)?.name;
        return toast.show(`${where}: ${fits ? `يصلح لبناء ${fits}` : 'لا يصلح لأي مبنى'}`, 6000);
      }
      default:
        toast.show(`أمر «${cmd.name}» يُفعَّل مع الأنظمة القادمة`);
    }
  }

  // ===== أدوات الشبكة: إظهارها وهدم الطرق / Grid tools: show it and bulldoze roads =====

  root.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'toggle-grid') {
      gridAlways = !gridAlways;
      grid.setVisible(gridAlways || mode.kind !== 'idle');
      toast.show(gridAlways ? 'شبكة المربعات ظاهرة دائمًا' : 'الشبكة تظهر عند البناء ورسم الطرق فقط');
    } else if (action === 'bulldoze') {
      closeSelection();
      if (mode.kind === 'bulldoze') return setMode({ kind: 'idle' });
      setMode({ kind: 'bulldoze' });
      toast.show('اسحب على الطرق التي تريد إزالتها، ثم أكّد بعلامة ✓. اضغط الزر مرة أخرى أو Esc للإنهاء', 6000);
    }
  });

  // ===== الحلقة الزمنية والتحديث / Time loop and refresh =====

  let lastHud = 0;
  const completed = new Set(session.state.buildings.filter((b) => !isUnderConstruction(b, Date.now())).map((b) => b.uid));
  function refresh(force = false): void {
    const now = Date.now();
    session.tick(now);
    const state = session.state;
    // الأرض تُسوّى تحت المباني، والطبيعة تُزال منها ومن جوانب الطرق / Level under buildings; clear nature there and beside roads
    const built = [tileKey(state.settlement.x, state.settlement.z), ...state.buildings.map((b) => tileKey(b.x, b.z))];
    game.surface.level(built);
    const cleared = new Set(built);
    for (const r of state.roads) for (const [x, z] of edgeTiles(r.edge)) cleared.add(tileKey(x, z));
    nature.hide(cleared);
    // تراب تحت الطرق والمباني، وتربة محروثة تحت الحقول / Dirt under roads and buildings, tilled soil under fields
    const isField = (id: string) => byId.get(id)?.model === 'field';
    game.ground?.paint({
      dirt: [state.settlement, ...state.buildings.filter((b) => !isField(b.buildingId)).map((b) => ({ x: b.x, z: b.z }))],
      soil: state.buildings.filter((b) => isField(b.buildingId)).map((b) => ({ x: b.x, z: b.z })),
      roads: state.roads.map((r) => r.edge),
    });
    syncSettlement();
    models.sync(state, now, era());
    roads.sync(state);
    traffic.sync(roads.edgesByStyle(state).get('paved-road') ?? new Set(), state.population);
    borders.show(state.territory);
    grid.showTiles(state.territory);

    // لافتات: مبنى الحكم، والمكامن المكتشفة، وعدّاد ما يُبنى، وتحذير المتوقف
    // Labels: the government building, discovered deposits, construction timers, stopped warnings
    const keep = new Set<string>(['settlement']);
    labels.set('settlement', `${governmentName} · ${stageById(defs, state.stage).name}`, labelAbove(settlementTile.x, settlementTile.z, 1.5));
    for (const d of world.deposits) {
      if (!state.discovered.includes(d.id)) continue;
      keep.add(`d-${d.id}`);
      labels.set(`d-${d.id}`, depositTypeById.get(d.typeId)?.name ?? d.typeId, labelAbove(d.x, d.z, 1.4), 'pin-deposit');
    }
    for (const b of state.buildings) {
      const def = byId.get(b.buildingId);
      const status = buildingStatus(b, state, defs, now);
      if (status.kind === 'constructing') {
        keep.add(`c-${b.uid}`);
        labels.set(`c-${b.uid}`, `${def?.name ?? ''} · ${formatDuration(Math.ceil((b.completesAt - now) / 1000))}`, labelAbove(b.x, b.z, 1.2), 'pin-build');
      } else if (status.kind === 'stopped' || status.kind === 'disconnected') {
        keep.add(`s-${b.uid}`);
        labels.set(`s-${b.uid}`, status.kind === 'disconnected' ? 'بلا طريق' : `ينقصه ${status.missing.map(resourceName).join('، ')}`, labelAbove(b.x, b.z, 1.1), 'pin-warn');
      }
      if (status.kind !== 'constructing' && !completed.has(b.uid)) {
        completed.add(b.uid);
        toast.show(`اكتمل بناء ${def?.name ?? ''}`);
      }
    }
    for (const key of labels.keys()) if (!keep.has(key)) labels.remove(key);

    if (force || now - lastHud >= HUD_MS) {
      lastHud = now;
      refreshAllowed();
      renderResources(root, defs, state, netRates(state, defs, now));
      renderCivic(root, stageById(defs, state.stage).name, state.population, housingCapacity(state, defs, now), nextStage(defs, state.stage));
      renderClock(root, game.dayNight.dayFraction);
      buildBar.update(state, now);
      ministries.refresh();
      tools.refresh();
      const deposits = world.deposits.filter((d) => state.discovered.includes(d.id)).map((d) => ({ x: d.x, z: d.z, emphasis: false }));
      minimap.setOverlay(state.territory, [{ x: settlementTile.x, z: settlementTile.z, emphasis: true }, ...deposits]);
    }
  }

  window.setInterval(() => refresh(), TICK_MS);
  window.setInterval(() => session.persist(), AUTOSAVE_MS);
  const saveNow = () => session.persist();
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow());

  // دولة جديدة: ضغطتان للتأكيد، ثم يُمسح الحفظ وتبدأ اللعبة من اختيار الموقع / New nation: two taps, then the save is wiped
  let pendingReset = 0;
  root.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-action="new-nation"]')) return;
    const now = Date.now();
    if (now > pendingReset) {
      pendingReset = now + CONFIRM_MS;
      return toast.show(`اضغط «دولة جديدة» مرة أخرى خلال ${formatNumber(CONFIRM_MS / 1000)} ثوانٍ لحذف دولتك الحالية والبدء من جديد`);
    }
    session.abandon();
    location.reload();
  });

  game.scene.onAfterRenderObservable.add(() => {
    confirm.update();
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
      toast.show('تغيّر شكل العالم في قاعدة البيانات أو في اللعبة، فبدأت دولة جديدة', 6000);
    } else if (s.kind === 'new') {
      toast.show(`خطّط المنطقة أولًا: ارسم الطرق على خطوط الشبكة من حول ${governmentName}، ثم ابنِ على القطع المطلة عليها`, 8000);
    } else if (s.resume.creditedMs >= 60_000) {
      const gained = Object.entries(s.resume.gained).map(([id, n]) => `${formatNumber(Math.floor(n))} ${resourceName(id)}`).join('، ');
      const capped = s.resume.awayMs > s.resume.creditedMs ? ` (حُسبت أول ${formatNumber(defs.world.offlineCapHours)} ساعات فقط)` : '';
      if (gained) toast.show(`أثناء غيابك أنتجت الدولة: ${gained}${capped}`, 7000);
    }
  }
}
