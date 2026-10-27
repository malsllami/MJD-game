// مسؤولية الملف: الكاميرا الاستراتيجية — تحريك وتدوير وتقريب، بالفأرة واللمس ولوحة المفاتيح
// File responsibility: strategy camera — pan, rotate and zoom via mouse, touch and keyboard

import { ArcRotateCamera, Scene, Vector3 } from '@babylonjs/core';
import { APP_CONFIG } from '../config/app.config';

type CameraConfig = typeof APP_CONFIG.camera;

/** مفاتيح التحريك: WASD والأسهم / Pan keys: WASD and arrows */
const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/**
 * كاميرا تدور حول نقطة على الأرض وتبقى داخل حدود العالم
 * Orbit camera around a ground target, clamped to world bounds
 *
 * الفأرة: سحب أيسر للتدوير، سحب أيمن للتحريك، العجلة للتقريب
 * Mouse: left-drag rotates, right-drag pans, wheel zooms
 * اللمس: إصبع للتدوير، إصبعان للتحريك والتقريب / Touch: one finger rotates, two fingers pan & pinch
 * المفاتيح: WASD/الأسهم للتحريك، Q/E للتدوير / Keys: WASD/arrows pan, Q/E rotate
 */
export class StrategyCamera {
  readonly camera: ArcRotateCamera;
  private readonly keys = new Set<string>();

  constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    private readonly bounds: { halfX: number; halfZ: number },
    start: { x: number; z: number },
    private readonly cfg: CameraConfig = APP_CONFIG.camera,
  ) {
    const cam = new ArcRotateCamera('camera', -Math.PI / 2, cfg.startBeta, cfg.startRadius, new Vector3(start.x, 0, start.z), scene);
    cam.lowerRadiusLimit = cfg.minRadius;
    cam.upperRadiusLimit = Math.min(Math.max(bounds.halfX, bounds.halfZ) * 2 * cfg.maxRadiusFactor, cfg.fogClearance / Math.max(1e-4, scene.fogDensity));
    cam.lowerBetaLimit = cfg.minBeta;
    cam.upperBetaLimit = cfg.maxBeta;
    cam.wheelDeltaPercentage = 0.01;
    cam.pinchDeltaPercentage = 0.004;
    cam.panningSensibility = 40;
    cam.mapPanning = true;
    cam.angularSensibilityX = 1600;
    cam.angularSensibilityY = 1600;
    cam.minZ = 0.5;
    // مدى الرؤية أبعد من حافة البحر حتى لا يُقطع البحر البعيد / View distance beyond the sea's edge so the far sea is never clipped
    cam.maxZ = Math.max(bounds.halfX, bounds.halfZ) * 24;
    cam.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    cam.attachControl(canvas, true);
    this.camera = cam;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    scene.onBeforeRenderObservable.add(() => this.update(scene.getEngine().getDeltaTime() / 1000));
  }

  /** تدوير أفقي بخطوة ثابتة: 1 أو -1 / Rotate horizontally by one step */
  rotate(direction: 1 | -1): void {
    this.camera.alpha += direction * this.cfg.rotateStep;
  }

  /** تقريب (1) أو إبعاد (-1) بنسبة ثابتة / Zoom in (1) or out (-1) by a fixed ratio */
  zoom(direction: 1 | -1): void {
    this.camera.radius *= 1 - direction * this.cfg.zoomStep;
  }

  /** نقل مركز النظر إلى نقطة على الخريطة / Move the look-at point to a map position */
  focus(x: number, z: number): void {
    this.camera.target.x = x;
    this.camera.target.z = z;
    this.clamp();
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (down && e.code === 'KeyQ') this.rotate(-1);
    else if (down && e.code === 'KeyE') this.rotate(1);
    else if (PAN_KEYS[e.code]) down ? this.keys.add(e.code) : this.keys.delete(e.code);
  }

  /** تحريك بالمفاتيح نسبةً لاتجاه الكاميرا، ثم إبقاؤها داخل الحدود / Camera-relative key panning, then clamp */
  private update(dt: number): void {
    if (this.keys.size) {
      let fx = 0;
      let fz = 0;
      for (const k of this.keys) {
        fx += PAN_KEYS[k][0];
        fz += PAN_KEYS[k][1];
      }
      const forward = this.camera.target.subtract(this.camera.position);
      forward.y = 0;
      forward.normalize();
      const right = new Vector3(forward.z, 0, -forward.x);
      const speed = this.camera.radius * this.cfg.keyPanSpeed * dt;
      this.camera.target.addInPlace(forward.scale(fz * speed)).addInPlace(right.scale(fx * speed));
    }
    this.clamp();
  }

  private clamp(): void {
    const t = this.camera.target;
    t.x = Math.min(this.bounds.halfX, Math.max(-this.bounds.halfX, t.x));
    t.z = Math.min(this.bounds.halfZ, Math.max(-this.bounds.halfZ, t.z));
    t.y = 0;
  }
}
