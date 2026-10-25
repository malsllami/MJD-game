// مسؤولية الملف: تجميع المشهد ثلاثي الأبعاد كاملًا وتوفير واجهة واحدة للتعامل معه
// File responsibility: assembles the full 3D scene and exposes one API to work with it

import { Engine, Matrix, PointerEventTypes, Scene, Vector3, type AbstractMesh, type ShadowGenerator } from '@babylonjs/core';
import { APP_CONFIG, type QualityPreset } from '../config/app.config';
import type { GameDefinitions, Tile, World } from '../core/types';
import { sampleHeight, tileAtPoint, tileCenter, worldHalfExtents } from '../core/world-gen';
import { ModelLibrary } from '../assets/model-library';
import { DayNight } from './day-night';
import { Nature } from './nature';
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

/** مستقبل أحداث السحب على المربعات / Receiver of tile-drag events */
export interface TileDragHandler {
  start(tile: Tile): void;
  move(tile: Tile): void;
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
  const terrain = createTerrainMesh(scene, world, defs.terrain);
  const water = createWater(scene, span, preset.waterReflections, [terrain, env.skybox]);
  const dayNight = new DayNight(scene, env, defs.world.dayLengthMinutes, span, water);
  const surface = new TerrainSurface(terrain, world);
  const library = new ModelLibrary(scene);
  // الطبيعة جزء من العالم نفسه، فتظهر من شاشة اختيار الموقع / Nature belongs to the world, so it shows from the start-site screen
  const nature = new Nature(library, world, preset.natureDensity);
  void nature.build(env.shadows);

  const heightAt = (x: number, z: number): number => sampleHeight(world, x, z);
  const tileAnchor = (t: { x: number; z: number }): Vector3 => {
    const c = tileCenter(world, t.x, t.z);
    return new Vector3(c.x, Math.max(0, heightAt(c.x, c.z)), c.z);
  };

  // كل مجسم قابل للنقر يحمل مربعه، فالنقر على مبنى يحدد مربعه لا الأرض خلفه
  // Each pickable model carries its tile, so clicking a building selects its tile, not the ground behind
  const tileOfMesh = new Map<AbstractMesh, Tile>();
  const camera = new StrategyCamera(scene, canvas, { halfX, halfZ }, { x: 0, z: 0 });
  const highlighter = new TileHighlight(scene, world);

  /** المربع تحت المؤشر / Tile under the pointer */
  const pickTile = (onlyGround: boolean): Tile | null => {
    const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === terrain || (!onlyGround && tileOfMesh.has(m)));
    if (!pick?.hit || !pick.pickedMesh) return null;
    return (!onlyGround && tileOfMesh.get(pick.pickedMesh)) || (pick.pickedPoint ? tileAtPoint(world, pick.pickedPoint.x, pick.pickedPoint.z) : null);
  };

  // تمييز النقر عن السحب: النقر فقط يحدد المربع، والسحب يرسم في وضع السحب
  // Tell clicks from drags: a click selects; in drag mode a drag traces tiles
  const clickHandlers: ((tile: Tile) => void)[] = [];
  let drag: TileDragHandler | null = null;
  let dragging = false;
  let lastDragKey = '';
  let down: { x: number; y: number } | null = null;
  scene.onPointerObservable.add((info) => {
    const e = info.event as PointerEvent;
    if (info.type === PointerEventTypes.POINTERDOWN && e.button === 0) {
      down = { x: e.clientX, y: e.clientY };
      const tile = drag && pickTile(true);
      if (drag && tile) {
        dragging = true;
        lastDragKey = `${tile.x},${tile.z}`;
        drag.start(tile);
      }
    } else if (info.type === PointerEventTypes.POINTERMOVE && dragging && drag) {
      const tile = pickTile(true);
      if (tile && `${tile.x},${tile.z}` !== lastDragKey) {
        lastDragKey = `${tile.x},${tile.z}`;
        drag.move(tile);
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
      const tile = pickTile(false);
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
