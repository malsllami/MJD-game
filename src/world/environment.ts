// مسؤولية الملف: البيئة المحيطة — السماء والإضاءة والظلال والضباب
// File responsibility: environment — sky, lighting, shadows and fog

import { Color3, DirectionalLight, GlowLayer, HemisphericLight, MeshBuilder, Scene, ShadowGenerator, Vector3, type Mesh } from '@babylonjs/core';
import { SkyMaterial } from '@babylonjs/materials';
import type { QualityPreset } from '../config/app.config';

/** لون الأفق، يُستخدم للضباب حتى يذوب العالم في السماء / Horizon colour shared by fog and sky */
export const HORIZON = new Color3(0.72, 0.79, 0.82);

export interface Environment {
  skybox: Mesh;
  sky: SkyMaterial;
  sun: DirectionalLight;
  /** ضوء القمر: اتجاهي حتى تبقى المنحدرات والقمم مقروءة ليلًا / Moonlight: directional so slopes and ridges stay readable at night */
  moon: DirectionalLight;
  ambient: HemisphericLight;
  /** كثافة الضباب الأساسية في النهار / Base daytime fog density */
  fogDensity: number;
  shadows: ShadowGenerator | null;
  /** توهج الأضواء ليلًا (غير متاح في الجودة المنخفضة) / Night light glow (absent on low quality) */
  glow: GlowLayer | null;
}

/**
 * ينشئ السماء الفيزيائية وضوء الشمس والضوء المحيط والضباب
 * Creates the physical sky, sun, ambient light and fog
 */
export function createEnvironment(scene: Scene, worldSpan: number, preset: QualityPreset): Environment {
  scene.clearColor = HORIZON.toColor4(1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = preset.fogDensity;
  scene.fogColor = HORIZON;

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.42;
  ambient.diffuse = new Color3(0.86, 0.9, 1);
  ambient.groundColor = new Color3(0.32, 0.3, 0.26);

  const sunDirection = new Vector3(-0.55, -0.9, 0.4).normalize();
  const sun = new DirectionalLight('sun', sunDirection, scene);
  sun.intensity = 0.95;
  sun.diffuse = new Color3(1, 0.95, 0.85);
  sun.position = sunDirection.scale(-worldSpan);

  const moon = new DirectionalLight('moon', new Vector3(0.5, -0.8, -0.3).normalize(), scene);
  moon.diffuse = new Color3(0.62, 0.72, 1);
  moon.specular = new Color3(0.35, 0.42, 0.6);
  moon.intensity = 0;

  let shadows: ShadowGenerator | null = null;
  if (preset.shadowMapSize > 0) {
    shadows = new ShadowGenerator(preset.shadowMapSize, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.002;
    shadows.normalBias = 0.015;
  }

  const skybox = MeshBuilder.CreateBox('skybox', { size: worldSpan * 8 }, scene);
  const sky = new SkyMaterial('sky', scene);
  sky.backFaceCulling = false;
  sky.useSunPosition = true;
  sky.sunPosition = sunDirection.scale(-100);
  sky.turbidity = 6;
  sky.rayleigh = 1.6;
  sky.luminance = 1;
  sky.mieDirectionalG = 0.85;
  skybox.material = sky;
  skybox.infiniteDistance = true;
  skybox.applyFog = false;
  skybox.isPickable = false;

  let glow: GlowLayer | null = null;
  if (preset.glow) {
    glow = new GlowLayer('night-glow', scene, { mainTextureSamples: 2 });
    glow.intensity = 0;
  }

  return { skybox, sky, sun, moon, ambient, fogDensity: preset.fogDensity, shadows, glow };
}
