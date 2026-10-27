// مسؤولية الملف: ربط الجلسة بالعالم والواجهة — الأوضاع (بناء، رسم طرق على الشبكة، هدم طرق، نقل)، التحديد والأوامر،
// المكامن والمسح، الحلقة الزمنية، والحفظ الدوري
// File responsibility: wires the session to the world and HUD — modes (build, draw roads on the grid, bulldoze roads, move),
// selection and commands, deposits and survey, the time loop and autosave

import { Color3, type AbstractMesh, type TransformNode } from '@babylonjs/core';
import { compoundLook, eraOf, styleOf, type Era } from '../assets/catalog';
import { COMPOUND_ENTRANCE_X, compoundPlaza, TILE_METRES } from '../assets/village-kit';
import { APP_CONFIG } from '../config/app.config';
import {
  buildingAt, buildingStatus, checkMove, checkPlacement, cornerPath, costShare, depositAt, edgeTiles, housingCapacity, isRoad,
  autoRoadPath, capacityAt, isSettlementTile, isUnderConstruction, isWall, netRates, placeWallPath, wallAt, nextStage, pathEdges, placeRoadPath, roadAt, stageById, surveyCost, tileKey, annexCost, knownDeposits,
} from '../core/economy';
import { isForestMode, runningClearings } from '../core/frontier';
import { governmentLevel, governmentLevelOf, levelOf, levelRow } from '../core/levels';
import { placementAdvice, zoneTest } from '../core/placement-guide';
import type { BuildingDef, ContextCommand, EntityType, GameDefinitions, Tile, World } from '../core/types';
import { tileAtPoint } from '../core/world-gen';
import { BuildBar } from '../ui/build-bar';
import { ConfirmBar } from '../ui/confirm-bar';
import { createHud, renderCivic, renderClock, renderResources, toggleDockPanel } from '../ui/hud';
import { MinistriesPanel } from '../ui/ministries-panel';
import { Minimap } from '../ui/minimap';
import { RadialMenu, type RadialContent } from '../ui/radial-menu';
import { Toast } from '../ui/toast';
import { ToolDrawer } from '../ui/tool-drawer';
import { BuildingPanel } from '../ui/building-panel';
import { WorldLabels } from '../ui/world-labels';
import { formatDuration, formatNumber } from '../utils/format';
import { BuildingModels, partsFor } from '../world/building-models';
import type { DragPoint, GameScene } from '../world/game-scene';
import { GhostPreview } from '../world/ghost-preview';
import { GridLines } from '../world/grid-lines';
import { RoadNetwork } from '../world/road-network';
import { WallNetwork } from '../world/wall-network';
import { Animals } from '../world/animals';
import { createSettlementModel } from '../world/settlements';
import { Thumbnails } from '../world/thumbnails';
import { TileSetFill } from '../world/tile-set-fill';
import { TileSetOutline } from '../world/tile-set-outline';
import { Traffic } from '../world/traffic';
import { VillageWall } from '../world/village-wall';
import type { GameSession } from './game-session';

const TICK_MS = 250;
const HUD_MS = 500;
const AUTOSAVE_MS = 5000;
const CONFIRM_MS = 4000;
/** مدة ظهور أسماء المكامن بعد المسح / How long deposit names show after a survey */
const SURVEY_LABELS_MS = 10000;

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
  const professionName = (id: string) => defs.professions.find((p) => p.id === id)?.name ?? id;
  const tileAt = (x: number, z: number) => world.tiles[z * world.settings.tilesX + x];
  const mobile = window.matchMedia(APP_CONFIG.mobileLayoutQuery);
  const governmentName = defs.world.governmentName || defs.world.capitalName;

  const hud = createHud(root, defs, { rotate: (d) => game.camera.rotate(d), zoom: (d) => game.camera.zoom(d) });
  const toast = new Toast(hud.toast);
  const ministries = new MinistriesPanel(hud.ministries, () => ({ defs, world, state: session.state, now: Date.now() }));
  const minimap = new Minimap(hud.minimap, world, defs.terrain, (x, z) => game.camera.focus(x, z));
  const labels = new WorldLabels(hud.labels, (p) => game.project(p));
  const radial = new RadialMenu(hud.radial, (p) => game.project(p), () => mobile.matches);
  const borders = new TileSetOutline(game.scene, world, new Color3(0.9, 0.8, 0.5), 0.35);
  const allowed = new TileSetOutline(game.scene, world, new Color3(0.45, 0.95, 0.6), 0.45);
  // إطار ذهبي حول قطع الغابة الجاري / A gold outline around the forest being cleared
  const clearingOutline = new TileSetOutline(game.scene, world, new Color3(1, 0.82, 0.4), 0.5);
  const forest = isForestMode(defs);
  const firstRadius = defs.stages[0]?.territoryRadius ?? 0;
  let seenClearings = new Set<string>();
  let seenFound = session.state.foundDeposits?.length ?? 0;
  // المواقع المقترحة للمبنى ملوّنة بالذهبي داخل المسموح / The building's suggested spots tinted gold within the allowed ones
  const suggested = new TileSetFill(game.scene, world, new Color3(0.98, 0.8, 0.35), 0.22, 0.1);
  // شبكة خضراء تظهر عند البناء والرسم، أو دائمًا بزر الشبكة / A green grid shown while building and drawing, or always via the grid button
  const grid = new GridLines(game.scene, world, new Color3(0.62, 1, 0.55), 0.3, 0.12);
  const roadPreview = new GridLines(game.scene, world, new Color3(1, 0.85, 0.35), 1, 0.3);
  // الطريق الترابي ترسمه خامة الأرض حين تتوفر / The dirt road is painted by the ground texture when available
  const roads = new RoadNetwork(game.scene, world, byId, game.dayNight.lights, game.ground ? new Set(['road']) : new Set());
  const traffic = new Traffic(game.scene, world, game.library);
  const walls = new WallNetwork(game.scene, world, byId);
  const villageWall = new VillageWall(game.scene, world, byId, game.dayNight.lights, game.shadows);
  const animals = new Animals(game.scene, world, game.library, game.shadows);
  const models = new BuildingModels(
    game.scene, world, game.library, byId, game.shadows,
    (mesh, placed) => game.registerPickable(mesh, tileAt(placed.x, placed.z)),
    (mesh) => game.unregisterPickable(mesh),
  );
  const nature = game.nature;
  const ghost = new GhostPreview(game.scene, world, game.library);
  const confirm = new ConfirmBar(hud.confirm, (p) => game.project(p));
  /** عصر الدولة البصري من مرحلتها الحالية / The nation's visual era from its current stage */
  const stageEra = () => eraOf(stageById(defs, session.state.stage).order);
  /**
   * عصر شكل المبنى من طراز مستواه (خشبي أو حجري)، والمدينة حديثة دائمًا؛ وبلا مستويات (خادم أقدم) يتبع المرحلة
   * A building's era from its level's look (wood or stone), the city always modern; without levels (older server) it follows the stage
   */
  const levelEra = (level: number): Era => {
    const stage = stageEra();
    const style = levelRow(defs, level).style;
    return stage === 'modern' || !style ? stage : style === 'stone' ? 'transitional' : 'primitive';
  };
  /** المبنى الجديد يبدأ بالمستوى الأول / A new building starts at level 1 */
  const era = () => levelEra(1);
  const thumbnails = new Thumbnails(game.scene, game.library, world.settings.tileSize);
  const buildBar = new BuildBar(hud.buildBar, defs, (b) => pickBuilding(b), (style) => thumbnails.get(style, era()));
  // على الجوال: فتح فئة بناء يغلق لوحات الشريط السفلي، وفتح إحداها يطوي بطاقات البناء
  // On phones: opening a build category closes the dock panels, and opening one of them folds the build cards
  hud.buildBar.addEventListener('click', (e) => (e.target as HTMLElement).closest('[data-cat]') && toggleDockPanel(root, ''));
  root.addEventListener('click', (e) => (e.target as HTMLElement).closest('[data-action="dock"]') && buildBar.setOpen(false));
  // لوحة داخل المبنى وأوامرها / The inside-the-building panel and its commands
  const panel = new BuildingPanel(
    hud.buildingPanel,
    () => ({ defs, world, state: session.state, now: Date.now() }),
    (def) => thumbnails.get(styleOf(def), era()),
    {
      upgrade: () => {
        const result = session.upgrade(Date.now());
        if (result.ok) refresh(true);
        return result;
      },
      upgradeBuilding: (uid) => {
        const result = session.upgradeBuilding(uid, Date.now());
        if (result.ok) {
          refresh(true);
          toast.show('بدأت ترقية المبنى؛ يبقى يعمل بمستواه الحالي حتى تكتمل');
        }
        return result;
      },
      trade: (resourceId, amount, side) => {
        const result = session.trade(resourceId, amount, side, Date.now());
        if (result.ok) refresh(true);
        return result;
      },
      move: (uid) => {
        const def = byId.get(session.state.buildings.find((b) => b.uid === uid)?.buildingId ?? '');
        if (!def) return;
        const price = costText(costShare(def.cost, defs.world.moveCostPercent));
        setMode({ kind: 'move', uid });
        toast.show(`اختر موقعًا جديدًا لـ${def.name} من المربعات الخضراء${price ? ` · تكلفة النقل ${price}` : ''}`, 5000);
      },
      demolish: (uid) => {
        const def = byId.get(session.state.buildings.find((b) => b.uid === uid)?.buildingId ?? '');
        session.demolish(uid, Date.now());
        game.highlight(null);
        refresh(true);
        toast.show(`هُدم ${def?.name ?? ''} واسترددت ${formatNumber(defs.world.demolishRefundPercent)}٪ من تكلفته`);
      },
    },
    () => game.highlight(null),
  );
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
  // أسماء المكامن تظهر عند الحاجة فقط حتى تبقى الشاشة هادئة / Deposit names show only when needed, keeping the screen calm
  let depositsAlways = false;
  let depositsUntil = 0;
  const showDeposits = (now: number) => depositsAlways || now < depositsUntil || (mode.kind === 'place' && !!mode.building.requiresDeposit);
  grid.setVisible(false);
  let selected: Tile | null = null;

  const labelAbove = (x: number, z: number, lift: number) => {
    const p = game.tileAnchor({ x, z });
    p.y += world.settings.tileSize * lift;
    return p;
  };
  const costText = (cost: Record<string, number>) => Object.entries(cost).map(([id, n]) => `${formatNumber(n)} ${resourceName(id)}`).join('، ');

  // ===== مبنى الحكم: أول مبنى في القرية، يكبر مع كل مرحلة / Government building: the village's first building, growing each stage =====
  const settlementTile = tileAt(session.state.settlement.x, session.state.settlement.z);
  let settlement: { root: TransformNode; meshes: AbstractMesh[] } | null = null;
  let settlementKey = '';
  const compoundTiles = 2 * (session.state.settlement.radius ?? 0) + 1;
  function syncSettlement(): void {
    const { stage } = session.state;
    const level = governmentLevelOf(defs, session.state);
    const key = `${stage}|${level}`;
    if (key === settlementKey) return;
    const announce = settlementKey ? (settlementKey.split('|')[0] === stage ? 'level' : 'stage') : '';
    settlementKey = key;
    const look = compoundLook(level, levelEra(level) !== 'primitive', compoundTiles, stageById(defs, stage).order);
    void createSettlementModel(game.library, game.scene, game.tileAnchor(settlementTile), world.settings.tileSize, look, game.shadows).then((next) => {
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
    if (announce === 'stage') toast.show(`أصبحت ${defs.world.capitalName} ${stageById(defs, stage).name}! فُتحت مبانٍ جديدة وتوسعت الحدود`, 6000);
    else if (announce === 'level') {
      const row = governmentLevel(defs, session.state);
      toast.show(`ارتقى ${governmentName} إلى «${row.name}»؛ يمكن ترقية المباني حتى المستوى ${formatNumber(row.maxBuildingLevel)}`, 6000);
    }
  }

  // مربعات مجمع الحكم، وبلاطه وحدائقه على الأرض (بإحداثيات المربعات؛ المجمع مدار نصف دورة)
  // The compound's tiles, and its paving and gardens on the ground (in tile coordinates; the compound is turned half a turn)
  const compoundKeys: string[] = [];
  {
    const r = session.state.settlement.radius ?? 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) compoundKeys.push(tileKey(settlementTile.x + dx, settlementTile.z + dz));
  }
  const compoundGround = (() => {
    if (compoundTiles <= 1) return {};
    const cx = settlementTile.x + 0.5;
    const cz = settlementTile.z + 0.5;
    const half = compoundTiles / 2 - 0.06;
    const flip = (b: { x0: number; z0: number; x1: number; z1: number }) => ({
      x0: cx - b.x1 / TILE_METRES, x1: cx - b.x0 / TILE_METRES, z0: cz - b.z1 / TILE_METRES, z1: cz - b.z0 / TILE_METRES,
    });
    // ممر مرصوف من مدخل السور إلى الطريق الرئيسي / A paved path from the wall's entrance out to the main road
    const gate = cx - COMPOUND_ENTRANCE_X / TILE_METRES;
    return { paving: [flip(compoundPlaza((compoundTiles * TILE_METRES) / 2)), { x0: gate - 0.14, z0: cz - half - 0.12, x1: gate + 0.14, z1: cz - half }] };
  })();

  /** حدود الدولة في العالم مع هامش مربعين، لتبقى الكاميرا حولها / The nation's world bounds plus two tiles, keeping the camera around it */
  function territoryArea(territory: string[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const k of territory) {
      const [x, z] = k.split(',').map(Number);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const a = game.tileAnchor({ x: minX - 2, z: minZ - 2 });
    const b = game.tileAnchor({ x: maxX + 2, z: maxZ + 2 });
    return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
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

  /**
   * المربعات المسموحة للوضع الحالي بإطار أخضر، والمقترحة منها لمنطقة المبنى بلون ذهبي
   * Allowed tiles for the current mode in a green outline, and those suggested for the building's zone tinted gold
   */
  function refreshAllowed(): void {
    const now = Date.now();
    const state = session.state;
    const current = mode;
    if (current.kind !== 'place' && current.kind !== 'move') {
      suggested.clear();
      return allowed.clear();
    }
    const fits = (key: string): boolean => {
      const [x, z] = key.split(',').map(Number);
      const tile = tileAt(x, z);
      if (current.kind === 'move') return checkMove(defs, world, state, current.uid, tile, now).ok;
      const b = current.building;
      if (isSettlementTile(state, x, z) || buildingAt(state, x, z) || !b.allowedTerrain.includes(tile.terrainId)) return false;
      return !b.requiresDeposit || !!depositAt(world, state, x, z, b.requiresDeposit);
    };
    const fitting = state.territory.filter(fits);
    allowed.show(fitting);
    const def = current.kind === 'place' ? current.building : byId.get(state.buildings.find((b) => b.uid === current.uid)?.buildingId ?? '');
    const inZone = def ? zoneTest(defs, state, def, now) : null;
    suggested.show(inZone ? fitting.filter((k) => inZone(...(k.split(',').map(Number) as [number, number]))) : []);
  }

  /** اختيار بطاقة: طريق للرسم، أو مبنى يُعاين على المربع المحدد أو ينتظر مربعًا / Card pick: a road to draw, or a building */
  function pickBuilding(b: BuildingDef): void {
    if ((mode.kind === 'place' || mode.kind === 'road') && mode.building.id === b.id) return setMode({ kind: 'idle' });
    closeSelection();
    if (isRoad(b) || isWall(b)) {
      setMode({ kind: 'road', building: b });
      toast.show(`اسحب على خطوط الشبكة لتخطيط ${b.name} من حول ${governmentName} أو من طريق قائم، ثم أكّد بعلامة ✓`, 6000);
      return;
    }
    const target = selected;
    setMode({ kind: 'place', building: b });
    if (target && session.state.territory.includes(tileKey(target.x, target.z)) && !buildingAt(session.state, target.x, target.z)) return previewBuild(b, target);
    const hint = b.requiresDeposit ? ` على ${defs.deposits.find((d) => d.resourceId === b.requiresDeposit)?.name ?? 'مكمن'} مكتشف` : '';
    const zone = zoneTest(defs, session.state, b, Date.now()) ? '؛ المربعات الذهبية هي المقترحة' : '';
    toast.show(`اختر مربعًا أخضر${hint} لمعاينة ${b.name}${zone}، ثم أكّد بعلامة ✓`, zone ? 5000 : 3500);
  }

  /** معاينة المبنى على المربع مع شريط تأكيد / Preview the building on the tile with a confirmation bar */
  function previewBuild(b: BuildingDef, tile: Tile): void {
    const now = Date.now();
    // المبنى الذي يحتاج طريقًا يحصل على طريق تلقائي من أقرب نقطة في الشبكة / A road-dependent building gets an automatic road from the nearest network point
    const road = b.requiresRoad ? availableRoad() : undefined;
    const path = road ? autoRoadPath(defs, world, session.state, road, tile, now) : [];
    const planned = road && path?.length ? placeRoadPath(session.state, defs, world, road, path, now, () => 'preview') : null;
    const autoRoad = planned && !planned.stoppedBy ? path! : [];
    const roadCost = road ? Object.fromEntries(Object.entries(road.cost).map(([id, n]) => [id, n * (planned?.placed ?? 0)])) : {};
    const check = checkPlacement(defs, world, autoRoad.length ? planned!.state : session.state, b, tile, now);
    roadPreview.showEdges(autoRoad, new Color3(1, 0.85, 0.35));
    // موقع مسموح لكنه خارج المنطقة المقترحة: تنبيه يشرح السبب ويبقى البناء متاحًا
    // An allowed spot outside the suggested zone: a note explains why and building stays available
    const advice = check.ok ? placementAdvice(defs, session.state, b, tile, now, formatNumber) : null;
    ghost.show(partsFor(styleOf(b), `preview-${b.id}`, era()), tile, !check.ok ? 'bad' : advice ? 'warn' : 'ok');
    if (advice) toast.show(advice, 6000);
    const roadText = autoRoad.length ? ` · طريق تلقائي ${formatNumber(planned!.placed)} قطعة (${costText(roadCost)})` : '';
    const detail = check.ok ? `${formatDuration(b.buildSeconds)} · ${costText(b.cost)}${roadText}` : (planned?.stoppedBy ?? check.reason);
    confirm.show(labelAbove(tile.x, tile.z, 0.6), b.name, detail, check.ok, () => tryBuild(b, tile, autoRoad), clearPreview, '', advice ? 'موقع غير مقترح' : '');
  }

  function clearPreview(): void {
    ghost.hide();
    confirm.hide();
    roadPreview.clear();
  }

  function tryBuild(b: BuildingDef, tile: Tile, autoRoad: string[] = []): void {
    const now = Date.now();
    const road = availableRoad();
    if (autoRoad.length && road) session.placeRoad(road, autoRoad, now);
    const result = session.place(b, tile, now);
    if (!result.ok) return toast.show(result.reason);
    roadPreview.clear();
    const note = autoRoad.length ? ' مع طريقه؛ عدّله بأداة الطرق أو الجرافة متى شئت' : '';
    toast.show(`بدأ بناء ${b.name} · ${formatDuration(b.buildSeconds)}${note}`, autoRoad.length ? 6000 : 3500);
    setMode({ kind: 'idle' });
    refresh(true);
  }

  /**
   * السحب على خطوط الشبكة من زاوية إلى زاوية: يرسم طريقًا (road) أو يحدد طرقًا للهدم (null)، ثم ينتظر التأكيد
   * Drag along grid lines corner to corner: lays a road (road) or marks roads to remove (null), then waits for confirmation
   */
  function gridDrawing(road: BuildingDef | null) {
    let corners: { x: number; z: number }[] = [];
    // السور والبوابة يُرسمان بنفس الأداة لكن بقواعدهما / Walls and gates use the same tool with their own rules
    const wall = !!road && isWall(road);
    const edges = () => {
      const all = pathEdges(corners);
      return road ? all : all.filter((e) => roadAt(session.state, e) || wallAt(session.state, e));
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
        // السحب من أحد طرفي المسار المعروض يعدّله من ذلك الطرف، وإلا يبدأ مسارًا جديدًا
        // Dragging from either end of the shown path adjusts it from that end; otherwise a new path starts
        const at1 = (p?: { x: number; z: number }) => !!p && Math.abs(p.x - at.corner.x) + Math.abs(p.z - at.corner.z) <= 1;
        if (corners.length > 1 && at1(corners[0])) corners.reverse();
        else if (!(corners.length > 1 && at1(corners[corners.length - 1]))) corners = [at.corner];
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
        if (!corners.length) return;
        const hint = 'اسحب من طرف المسار لتعديله، أو ارسم مسارًا جديدًا';
        if (!road) {
          return confirm.show(null, 'هدم الطرق', list.length ? `${formatNumber(list.length)} قطعة طريق` : 'لا طرق في هذا المسار', list.length > 0, () => {
            const removed = session.demolishRoads(list, Date.now());
            toast.show(`أُزيلت ${formatNumber(removed)} قطعة طريق واسترددت ${formatNumber(defs.world.demolishRefundPercent)}٪ من تكلفتها`);
            reset();
            refresh(true);
          }, reset, hint);
        }
        const dry = wall
          ? placeWallPath(session.state, defs, world, road, list, Date.now(), () => 'preview')
          : placeRoadPath(session.state, defs, world, road, list, Date.now(), () => 'preview');
        const total = Object.fromEntries(Object.entries(road.cost).map(([id, n]) => [id, n * dry.placed]));
        const detail = dry.placed
          ? `${formatNumber(dry.placed)} قطعة · ${costText(total)}${dry.stoppedBy ? ` · يتوقف: ${dry.stoppedBy}` : ''}`
          : (dry.stoppedBy ?? 'لا قطع جديدة في هذا المسار');
        confirm.show(null, road.name, detail, dry.placed > 0, () => {
          const result = wall ? session.placeWall(road, list, Date.now()) : session.placeRoad(road, list, Date.now());
          if (result.placed) toast.show(`بدأ بناء ${formatNumber(result.placed)} قطعة ${road.name}`);
          else if (result.stoppedBy) toast.show(result.stoppedBy);
          reset();
          refresh(true);
        }, reset, hint);
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
    // الضغط على مبنى يدخل إليه: تقترب الكاميرا وتفتح لوحته؛ والمربع الفارغ يفتح القائمة الدائرية
    // Tapping a building enters it: the camera closes in and its panel opens; an empty tile opens the radial menu
    const placed = buildingAt(session.state, tile.x, tile.z);
    if (isSettlementTile(session.state, tile.x, tile.z) || placed) {
      radial.close();
      const at = game.tileAnchor(tile);
      game.camera.focus(at.x, at.z);
      game.camera.camera.radius = Math.min(game.camera.camera.radius, world.settings.tileSize * 9);
      panel.open(placed ? { kind: 'building', uid: placed.uid } : { kind: 'government' });
      return;
    }
    panel.close();
    radial.open(game.tileAnchor(tile), describe(tile), (cmd) => runCommand(cmd, tile));
  });

  /** معاينة نقل المبنى إلى مربع جديد مع تكلفة النقل / Preview moving a building to a new tile with its cost */
  function previewMove(uid: string, tile: Tile): void {
    const placed = session.state.buildings.find((b) => b.uid === uid);
    const def = placed && byId.get(placed.buildingId);
    if (!placed || !def) return setMode({ kind: 'idle' });
    const check = checkMove(defs, world, session.state, uid, tile, Date.now());
    const advice = check.ok ? placementAdvice(defs, session.state, def, tile, Date.now(), formatNumber) : null;
    ghost.show(partsFor(styleOf(def), uid, levelEra(levelOf(placed, Date.now()))), tile, !check.ok ? 'bad' : advice ? 'warn' : 'ok');
    if (advice) toast.show(advice, 6000);
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
    panel.close();
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
    const state = session.state;
    const terrain = terrainById.get(tile.terrainId);
    const coords = `المربع ${formatNumber(tile.x + 1)}، ${formatNumber(tile.z + 1)}`;
    const owned = state.territory.includes(tileKey(tile.x, tile.z));
    const deposit = depositAt(world, state, tile.x, tile.z);
    // القائمة الدائرية للمربعات الفارغة فقط؛ المباني تفتح لوحتها / The radial menu is for empty tiles only; buildings open their panel
    const entity: EntityType | null = terrain?.isWater ? null : 'empty_tile';
    const title = deposit ? (depositTypeById.get(deposit.typeId)?.name ?? '') : (terrain?.name ?? '');
    const subtitle = `${coords} · ${owned ? 'داخل الدولة' : 'خارج الدولة'}`;
    const commands = entity ? (defs.contextMenus.find((m) => m.entityType === entity)?.commands ?? []) : [];
    return { title, subtitle, commands };
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
    switch (cmd.id) {
      case 'build': {
        if (isSettlementTile(state, tile.x, tile.z) || placed || !state.territory.includes(tileKey(tile.x, tile.z))) {
          return toast.show('اختر مربعًا فارغًا داخل حدود الدولة للبناء عليه');
        }
        toggleDockPanel(root, '');
        buildBar.setOpen(true);
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
        depositsUntil = now + SURVEY_LABELS_MS;
        const names = [...new Set(result.found.map((d) => depositTypeById.get(d.typeId)?.name ?? d.typeId))].join('، ');
        refresh(true);
        return toast.show(names ? `اكتشف المسح: ${names}` : `لم يجد المسح مكامن جديدة حول هذا المربع · ${costText(surveyCost(defs))}`, 6000);
      }
      case 'annex': {
        if (forest) {
          const cut = session.clear(tile, now);
          toast.show(cut.ok
            ? `بدأ قطع الغابة · ${formatDuration(defs.world.clearingSeconds)} · ${costText(annexCost(defs))}؛ تنضم القطعة مع ${formatNumber(defs.world.clearingWood)} خشب وقد تكشف موردًا`
            : cut.reason, 6000);
          if (cut.ok) refresh(true);
          return;
        }
        const result = session.annex(tile, now);
        toast.show(result.ok ? `انضمت قطعة أرض جديدة إلى الدولة مقابل ${formatNumber(defs.world.annexCost)} ${resourceName(defs.world.annexResource)}` : result.reason);
        if (result.ok) {
          refresh(true);
          radial.open(game.tileAnchor(tile), describe(tile), (c) => runCommand(c, tile));
        }
        return;
      }
      case 'info': {
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
      root.querySelector('[data-action="toggle-grid"]')?.setAttribute('aria-pressed', String(gridAlways));
      grid.setVisible(gridAlways || mode.kind !== 'idle');
      toast.show(gridAlways ? 'شبكة المربعات ظاهرة دائمًا' : 'الشبكة تظهر عند البناء ورسم الطرق فقط');
    } else if (action === 'toggle-deposits') {
      depositsAlways = !depositsAlways;
      root.querySelector('[data-action="toggle-deposits"]')?.setAttribute('aria-pressed', String(depositsAlways));
      toast.show(depositsAlways ? 'أسماء المكامن ظاهرة دائمًا' : 'أسماء المكامن تظهر عند البناء عليها أو بعد المسح فقط');
      refresh(true);
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
    const built = [...compoundKeys, ...state.buildings.map((b) => tileKey(b.x, b.z))];
    game.surface.level(built);
    const cleared = new Set(built);
    for (const r of state.roads) for (const [x, z] of edgeTiles(r.edge)) cleared.add(tileKey(x, z));
    // ما قُطع من الغابة المحيطة يصبح أرضًا مفتوحة / What was cleared of the surrounding forest becomes open land
    if (forest) {
      for (const k of state.territory) {
        const [x, z] = k.split(',').map(Number);
        if (Math.max(Math.abs(x - settlementTile.x), Math.abs(z - settlementTile.z)) > firstRadius) cleared.add(k);
      }
    }
    nature.hide(cleared);
    // تراب تحت الطرق والمباني، وتربة محروثة تحت الحقول / Dirt under roads and buildings, tilled soil under fields
    const isField = (id: string) => byId.get(id)?.model === 'field';
    game.ground?.paint({
      dirt: [...(compoundTiles > 1 ? [] : [state.settlement]), ...state.buildings.filter((b) => !isField(b.buildingId)).map((b) => ({ x: b.x, z: b.z }))],
      soil: state.buildings.filter((b) => isField(b.buildingId)).map((b) => ({ x: b.x, z: b.z })),
      roads: state.roads.map((r) => r.edge),
      ...compoundGround,
    });
    syncSettlement();
    models.sync(state, now, (placed) => levelEra(levelOf(placed, now)));
    villageWall.sync(state, now, governmentLevel(defs, state).wallStyle);
    roads.sync(state);
    walls.sync(state, now);
    animals.sync(state, defs, now);
    traffic.sync(roads.edgesByStyle(state).get('paved-road') ?? new Set(), state.population);
    borders.show(state.territory);
    game.camera.setArea(territoryArea(state.territory));
    grid.showTiles(state.territory);

    // لافتات: مبنى الحكم، والمكامن المكتشفة، وعدّاد ما يُبنى، وتحذير المتوقف
    // Labels: the government building, discovered deposits, construction timers, stopped warnings
    const keep = new Set<string>(['settlement']);
    labels.set('settlement', `${governmentName} · ${governmentLevel(defs, state).name}`, labelAbove(settlementTile.x, settlementTile.z, compoundTiles > 1 ? 2.2 : 1.5));
    for (const d of knownDeposits(world, state)) {
      if (!showDeposits(now)) continue;
      keep.add(`d-${d.id}`);
      const rich = d.richness && d.richness !== 1 ? ` · غنى ${formatNumber(d.richness)}` : '';
      labels.set(`d-${d.id}`, `${depositTypeById.get(d.typeId)?.name ?? d.typeId}${rich}`, labelAbove(d.x, d.z, 1.4), 'pin-deposit');
    }
    // قطع الغابة الجاري: إطار وعدّاد، وإشعار عند اكتماله بما كشفه / Running clearings: an outline and a timer, and a notice of what each revealed
    const running = runningClearings(state, now);
    clearingOutline.show(running.flatMap((c) => c.tiles));
    for (const c of running) {
      keep.add(`cut-${c.uid}`);
      const [x, z] = c.tiles[Math.floor(c.tiles.length / 2)].split(',').map(Number);
      labels.set(`cut-${c.uid}`, `قطع الغابة · ${formatDuration(Math.ceil((c.completesAt - now) / 1000))}`, labelAbove(x, z, 1.2), 'pin-build');
    }
    const ids = new Set(running.map((c) => c.uid));
    const finished = [...seenClearings].filter((id) => !ids.has(id)).length;
    seenClearings = ids;
    const found = state.foundDeposits ?? [];
    if (found.length > seenFound) {
      const fresh = found.slice(seenFound).map((d) => `${depositTypeById.get(d.typeId)?.name ?? d.typeId} (غنى ${formatNumber(d.richness ?? 1)})`).join('، ');
      depositsUntil = now + SURVEY_LABELS_MS;
      toast.show(`اكتمل قطع الغابة وكشف: ${fresh}`, 7000);
    } else if (finished) {
      toast.show(`اكتمل قطع الغابة وانضمت القطعة مع ${formatNumber(defs.world.clearingWood)} خشب؛ أرض بلا موارد`, 5000);
    }
    seenFound = found.length;
    for (const b of state.buildings) {
      const def = byId.get(b.buildingId);
      const status = buildingStatus(b, state, defs, now);
      if (status.kind === 'constructing') {
        keep.add(`c-${b.uid}`);
        labels.set(`c-${b.uid}`, `${def?.name ?? ''} · ${formatDuration(Math.ceil((b.completesAt - now) / 1000))}`, labelAbove(b.x, b.z, 1.2), 'pin-build');
      } else if (status.kind === 'stopped' || status.kind === 'disconnected' || status.kind === 'understaffed') {
        keep.add(`s-${b.uid}`);
        const warning = status.kind === 'disconnected' ? 'بلا طريق' : status.kind === 'understaffed' ? `ينقصه ${professionName(status.profession)}` : `ينقصه ${status.missing.map(resourceName).join('، ')}`;
        labels.set(`s-${b.uid}`, warning, labelAbove(b.x, b.z, 1.1), 'pin-warn');
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
      renderResources(root, defs, state, netRates(state, defs, now), capacityAt(state, defs, now));
      renderCivic(root, stageById(defs, state.stage).name, state.population, housingCapacity(state, defs, now), nextStage(defs, state.stage));
      renderClock(root, game.dayNight.dayFraction);
      buildBar.update(state, now);
      ministries.refresh();
      tools.refresh();
      panel.refresh();
      // الناس قرب ما تنظر إليه الكاميرا / People near what the camera looks at
      const look = game.camera.camera.target;
      const focus = tileAtPoint(world, look.x, look.z) ?? settlementTile;
      // الغابة المحيطة خارج الحدود يقصدها الحطابون / The surrounding forest past the border is where woodcutters go
      const owned = new Set(state.territory);
      const inner = firstRadius + defs.world.frontierGap;
      const woods = (x: number, z: number) => {
        const d = Math.max(Math.abs(x - settlementTile.x), Math.abs(z - settlementTile.z));
        return forest && !owned.has(tileKey(x, z)) && d > inner && d <= inner + defs.world.frontierDepth;
      };
      game.people.sync(state, defs, now, focus, woods);
      const deposits = knownDeposits(world, state).map((d) => ({ x: d.x, z: d.z, emphasis: false }));
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
  // زاوية الرؤية رأسية، فالشاشة العريضة القصيرة تحتاج كاميرا أقرب / The field of view is vertical, so a wide, short screen needs a closer camera
  const mobileTiles = APP_CONFIG.camera.startRadiusTiles;
  const landscape = window.matchMedia('(orientation: landscape)');
  game.camera.camera.radius = (mobile.matches ? mobileTiles[landscape.matches ? 'landscape' : 'portrait'] : mobileTiles.desktop) * world.settings.tileSize;
  // عند تدوير الجوال تتكيّف المسافة بنفس النسبة فيبقى التقريب الذي اختاره اللاعب / On rotating a phone the distance scales by the same ratio, keeping the player's zoom
  landscape.addEventListener('change', () => {
    if (!mobile.matches) return;
    const ratio = landscape.matches ? mobileTiles.landscape / mobileTiles.portrait : mobileTiles.portrait / mobileTiles.landscape;
    const cam = game.camera.camera;
    cam.radius = Math.min(cam.upperRadiusLimit ?? Infinity, Math.max(cam.lowerRadiusLimit ?? 0, cam.radius * ratio));
  });
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
