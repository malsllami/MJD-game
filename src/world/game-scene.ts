// مسؤولية الملف: تجميع المشهد ثلاثي الأبعاد كاملًا وتوفير واجهة واحدة للتعامل معه
// File responsibility: assembles the full 3D scene and exposes one API to work with it

import { Engine, Matrix, PointerEventTypes, Scene, Vector3, type AbstractMesh, type ShadowGenerator } from '@babylonjs/core';
import { APP_CONFIG, type QualityPreset } from '../config/app.config';
import type { GameDefinitions, Tile, World } from '../core/types';
import { sampleHeight, tileAtPoint, tileCenter, worldHalfExtents } from '../core/world-gen';
import { ModelLibrary } from '../assets/model-library';
import { DayNight } from './day-night';
import { Nature } from './nature';
import { People } from './people';
import { GroundPainter } from './ground-material';
import { TerrainSurface } from './terrain-surface';
import { createEnvironment } from './environment';
import { StrategyCamera } from './strategy-camera';
import { createTerrainMesh } from './terrain-mesh';
import { TileHighlight } from './tile-highlight';
import { createWater } from './water';

/** نقطة على الشاشة بإحداثيات CSS / Screen point in CSS pixels */
export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

/** موضع السحب: المربع تحت المؤشر وأقرب زاوية شبكة إليه / Drag position: the tile under the pointer and the nearest grid corner */
export interface DragPoint {
  tile: Tile;
  corner: { x: number; z: number };
}

/** مستقبل أحداث السحب / Receiver of drag events */
export interface TileDragHandler {
  start(at: DragPoint): void;
  move(at: DragPoint): void;
  end(): void;
}

export interface GameScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: StrategyCamera;
  readonly shadows: ShadowGenerator | null;
  readonly dayNight: DayNight;
  /** تسوية الأرض تحت المنشآت / Ground levelling under structures */
  readonly surface: TerrainSurface;
  /** محمّل النماذج ثلاثية الأبعاد / 3D model loader */
  readonly library: ModelLibrary;
  /** الأشجار والصخور / Trees and rocks */
  readonly nature: Nature;
  /** العمال والمارة المتحركون / Moving workers and passers-by */
  readonly people: People;
  /** رسم التراب والتربة على الأرض (العالم المستوي فقط) / Painting dirt and soil on the ground (flat world only) */
  readonly ground: GroundPainter | null;
  /** ربط مجسم بمربعه حتى يحدد النقر عليه ذلك المربع / Bind a mesh to its tile so clicking it selects that tile */
  registerPickable(mesh: AbstractMesh, tile: Tile): void;
  unregisterPickable(mesh: AbstractMesh): void;
  /** يُستدعى عند النقر على مربع (وليس عند السحب) / Fires on a tile click (not a drag) */
  onTileClick(handler: (tile: Tile) => void): void;
  /**
   * وضع السحب: السحب يرسم مسارًا على المربعات بدل تدوير الكاميرا؛ null يعيد الكاميرا
   * Drag mode: dragging traces tiles instead of rotating the camera; null restores the camera
   */
  setTileDrag(handler: TileDragHandler | null): void;
  highlight(tile: Tile | null): void;
  /** موقع مركز المربع على سطح الأرض / Tile centre on the ground surface */
  tileAnchor(tile: { x: number; z: number }): Vector3;
  project(point: Vector3): ScreenPoint;
}

/**
 * ينشئ المحرك والمشهد: البيئة، التضاريس، البحر، الكاميرا، والتحديد
 * Creates engine and scene: environment, terrain, sea, camera and selection
 */
export function createGameScene(canvas: HTMLCanvasElement, world: World, defs: GameDefinitions, preset: QualityPreset): GameScene {
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, false);
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, preset.maxDevicePixelRatio));
  const scene = new Scene(engine);

  const { halfX, halfZ } = worldHalfExtents(world);
  const span = Math.max(halfX, halfZ) * 2;
  const env = createEnvironment(scene, span, preset);
  // العالم المستوي بخامات واقعية، والقاري بألوان أنواع الأرض / The flat world uses realistic textures; the continent its terrain colours
  const textured = world.settings.worldMode === 'flat';
  const terrain = createTerrainMesh(scene, world, defs.terrain, textured);
  const ground = textured ? new GroundPainter(scene, terrain, world, preset.groundResolution) : null;
  const water = createWater(scene, span, preset.waterReflections, [terrain, env.skybox]);
  const dayNight = new DayNight(scene, env, defs.world.dayLengthMinutes, span, water);
  const surface = new TerrainSurface(terrain, world);
  const library = new ModelLibrary(scene);
  // الطبيعة جزء من العالم نفسه، فتظهر من شاشة اختيار الموقع / Nature belongs to the world, so it shows from the start-site screen
  const nature = new Nature(library, world, preset.natureDensity);
  void nature.build(env.shadows);
  const people = new People(scene, world, preset.maxPeople, env.shadows);

  const heightAt = (x: number, z: number): number => sampleHeight(world, x, z);
  const tileAnchor = (t: { x: number; z: number }): Vector3 => {
    const c = tileCenter(world, t.x, t.z);
    return new Vector3(c.x, Math.max(0, heightAt(c.x, c.z)), c.z);
  };

  // كل مجسم قابل للنقر يحمل مربعه، فالنقر على مبنى يحدد مربعه لا الأرض خلفه
  // Each pickable model carries its tile, so clicking a building selects its tile, not the ground behind
  const tileOfMesh = new Map<AbstractMesh, Tile>();
  const camera = new StrategyCamera(scene, canvas, { halfX, halfZ }, { x: 0, z: 0 });
  // تفاصيل الطبيعة تتبع الكاميرا / Nature detail follows the camera
  scene.onBeforeRenderObservable.add(() => {
    const { target, radius } = camera.camera;
    nature.updateDetail(target.x, target.z, radius);
    dayNight.setFocus(target.x, target.z, radius);
  });
  const highlighter = new TileHighlight(scene, world);

  /** المربع تحت المؤشر؛ النقر على مبنى يحدد مربعه / Tile under the pointer; clicking a building selects its tile */
  const pickTile = (): Tile | null => {
    const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === terrain || tileOfMesh.has(m));
    if (!pick?.hit || !pick.pickedMesh) return null;
    return tileOfMesh.get(pick.pickedMesh) || (pick.pickedPoint ? tileAtPoint(world, pick.pickedPoint.x, pick.pickedPoint.z) : null);
  };

  /** المربع وأقرب زاوية شبكة تحت المؤشر / Tile and nearest grid corner under the pointer */
  const pickDrag = (): DragPoint | null => {
    const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === terrain);
    if (!pick?.hit || !pick.pickedPoint) return null;
    const tile = tileAtPoint(world, pick.pickedPoint.x, pick.pickedPoint.z);
    if (!tile) return null;
    const { tileSize, tilesX, tilesZ } = world.settings;
    const corner = {
      x: Math.min(tilesX, Math.max(0, Math.round((pick.pickedPoint.x + halfX) / tileSize))),
      z: Math.min(tilesZ, Math.max(0, Math.round((pick.pickedPoint.z + halfZ) / tileSize))),
    };
    return { tile, corner };
  };

  // تمييز النقر عن السحب: النقر فقط يحدد المربع، والسحب يرسم في وضع السحب
  // Tell clicks from drags: a click selects; in drag mode a drag traces the grid
  const clickHandlers: ((tile: Tile) => void)[] = [];
  let drag: TileDragHandler | null = null;
  let dragging = false;
  let lastDragKey = '';
  let down: { x: number; y: number } | null = null;
  scene.onPointerObservable.add((info) => {
    const e = info.event as PointerEvent;
    if (info.type === PointerEventTypes.POINTERDOWN && e.button === 0) {
      down = { x: e.clientX, y: e.clientY };
      const at = drag && pickDrag();
      if (drag && at) {
        dragging = true;
        lastDragKey = `${at.corner.x},${at.corner.z}`;
        drag.start(at);
      }
    } else if (info.type === PointerEventTypes.POINTERMOVE && dragging && drag) {
      const at = pickDrag();
      if (at && `${at.corner.x},${at.corner.z}` !== lastDragKey) {
        lastDragKey = `${at.corner.x},${at.corner.z}`;
        drag.move(at);
      }
    } else if (info.type === PointerEventTypes.POINTERUP && down) {
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (dragging) {
        dragging = false;
        drag?.end();
        return;
      }
      if (moved > APP_CONFIG.selection.clickTolerancePx) return;
      const tile = pickTile();
      if (tile) for (const h of clickHandlers) h(tile);
    }
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  return {
    engine,
    scene,
    camera,
    shadows: env.shadows,
    dayNight,
    surface,
    library,
    nature,
    ground,
    people,
    registerPickable: (mesh, tile) => tileOfMesh.set(mesh, tile),
    unregisterPickable: (mesh) => tileOfMesh.delete(mesh),
    onTileClick: (handler) => clickHandlers.push(handler),
    setTileDrag(handler) {
      // في وضع السحب يتوقف تدوير الكاميرا بالمؤشر فقط؛ العجلة والمفاتيح تبقى / Only pointer rotation pauses; wheel and keys stay
      const pointers = camera.camera.inputs.attached['pointers'];
      if (handler && !drag) pointers?.detachControl();
      if (!handler && drag) pointers?.attachControl(true);
      if (!handler && dragging) drag?.end();
      dragging = false;
      drag = handler;
    },
    highlight: (tile) => (tile ? highlighter.show(tile.x, tile.z) : highlighter.hide()),
    tileAnchor,
    project(point) {
      const w = engine.getRenderWidth();
      const h = engine.getRenderHeight();
      const p = Vector3.Project(point, Matrix.IdentityReadOnly, scene.getTransformMatrix(), camera.camera.viewport.toGlobal(w, h));
      return {
        x: (p.x * canvas.clientWidth) / w,
        y: (p.y * canvas.clientHeight) / h,
        visible: p.z > 0 && p.z < 1,
      };
    },
  };
}
