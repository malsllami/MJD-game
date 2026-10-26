// مسؤولية الملف: دورة الليل والنهار — حركة الشمس، تدرج الشروق والغروب، ألوان السماء والضباب، وتشغيل الإنارة تلقائيًا ليلًا
// File responsibility: day-night cycle — sun path, gradual sunrise and sunset, sky and fog colours, and lights that switch on at night

import { Color3, Vector3, type Mesh, type Scene } from '@babylonjs/core';
import { HORIZON, type Environment } from './environment';
import { applyWaterNight } from './water';

const NIGHT_SKY = new Color3(0.07, 0.1, 0.17);
const DUSK_SKY = new Color3(0.86, 0.56, 0.4);
const NOON_SUN = new Color3(1, 0.96, 0.88);
const LOW_SUN = new Color3(1, 0.6, 0.32);
const DAY_AMBIENT = new Color3(0.86, 0.9, 1);
/** ضوء القمر: أزرق خافت يكشف شكل الأرض ليلًا / Moonlight: a faint blue that keeps the land readable at night */
const NIGHT_AMBIENT = new Color3(0.42, 0.52, 0.8);
const DUSK_AMBIENT = new Color3(1, 0.72, 0.52);
/** لون الضوء المرتد من الأرض نهارًا وليلًا / Ground-bounce light by day and by night */
const DAY_GROUND = new Color3(0.32, 0.3, 0.26);
const NIGHT_GROUND = new Color3(0.1, 0.12, 0.2);

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** لون إضاءة النوافذ ليلًا / Night window light colour */
export const WINDOW_LIGHT = new Color3(0.42, 0.3, 0.14);

/** أي مادة لها لون إشعاع (العادية ومواد نماذج glTF) / Any material with an emissive colour (standard and glTF PBR) */
export interface Glowing {
  emissiveColor: Color3;
}

/** أضواء تعمل ليلًا: مواد تتوهج بقدر الظلام / Night lights: materials that glow as it gets dark */
export class NightLights {
  private readonly lights: { material: Glowing; color: Color3 }[] = [];
  private level = 0;

  add(material: Glowing, color: Color3): void {
    this.lights.push({ material, color });
    material.emissiveColor = color.scale(this.level);
  }

  remove(material: Glowing): void {
    const i = this.lights.findIndex((l) => l.material === material);
    if (i >= 0) this.lights.splice(i, 1);
  }

  /** 0 نهار، 1 ليل كامل / 0 is day, 1 is full night */
  apply(level: number): void {
    if (Math.abs(level - this.level) < 0.005) return;
    this.level = level;
    for (const l of this.lights) l.material.emissiveColor = l.color.scale(level);
  }
}

/** نصف ضلع منطقة الظلال حول الكاميرا بالنسبة لنصف قطرها، وحدودها / Shadow area half-side relative to camera radius, and its limits */
const SHADOW_SPAN = 0.9;
const SHADOW_MIN = 24;
const SHADOW_MAX = 140;

export class DayNight {
  readonly lights = new NightLights();
  private fraction = 0.3;
  /** مركز الظلال (مركز نظر الكاميرا) ونصف ضلعها / Shadow centre (the camera look-at point) and half-side */
  private focus = new Vector3(0, 0, 0);
  private shadowHalf = 60;

  constructor(
    scene: Scene,
    private readonly env: Environment,
    private readonly dayLengthMinutes: number,
    private readonly worldSpan: number,
    private readonly water: Mesh | null,
  ) {
    scene.onBeforeRenderObservable.add(() => this.update(new Date()));
  }

  /**
   * الظلال تتبع الكاميرا في منطقة محدودة بدل العالم كله، فتبقى حادة ولا تظهر خطوط على الأرض المستوية
   * Shadows follow the camera over a limited area instead of the whole world, staying sharp with no stripes on flat ground
   */
  setFocus(x: number, z: number, cameraRadius: number): void {
    this.focus.set(x, 0, z);
    this.shadowHalf = Math.min(SHADOW_MAX, Math.max(SHADOW_MIN, cameraRadius * SHADOW_SPAN));
  }

  /** جزء اليوم الحالي: 0 منتصف الليل، 0.25 الشروق، 0.5 الظهر، 0.75 الغروب / Day fraction: 0 midnight, .25 sunrise, .5 noon, .75 sunset */
  get dayFraction(): number {
    return this.fraction;
  }

  /** حساب جزء اليوم من ساعة الجهاز أو من مدة اليوم في اللعبة / Day fraction from the device clock or the game day length */
  private fractionAt(now: Date): number {
    if (this.dayLengthMinutes <= 0) return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
    return (now.getTime() / (this.dayLengthMinutes * 60_000)) % 1;
  }

  private update(now: Date): void {
    this.fraction = this.fractionAt(now);
    const angle = (this.fraction - 0.25) * Math.PI * 2;
    const elevation = Math.sin(angle);
    const position = new Vector3(Math.cos(angle), elevation, -0.45).normalize();

    // الشمس: ترتفع وتنخفض، وتصفرّ ثم تبرتقل قرب الأفق / The sun rises and sets, turning orange near the horizon
    // الشفق ممتد حول الأفق كما في الواقع، فيبقى ضوء دافئ بعد الغروب بقليل / Twilight spans the horizon, leaving warm light just after sunset
    const daylight = smoothstep(-0.2, 0.25, elevation);
    const sunUp = smoothstep(-0.05, 0.12, elevation);
    const dusk = Math.max(0, 1 - Math.abs(elevation) / 0.25) * smoothstep(-0.22, 0, elevation);
    const { sun, ambient, sky, glow } = this.env;
    sun.direction = position.scale(-1);
    const reach = Math.min(this.worldSpan, this.shadowHalf * 4);
    sun.position = this.focus.add(position.scale(reach));
    sun.autoUpdateExtends = false;
    sun.orthoLeft = -this.shadowHalf;
    sun.orthoRight = this.shadowHalf;
    sun.orthoTop = this.shadowHalf;
    sun.orthoBottom = -this.shadowHalf;
    sun.shadowMinZ = 1;
    sun.shadowMaxZ = reach * 2;
    sun.intensity = 0.95 * sunUp;
    sun.diffuse = Color3.Lerp(LOW_SUN, NOON_SUN, smoothstep(0.05, 0.45, elevation));
    sun.setEnabled(sunUp > 0.001);

    // القمر: ضوء اتجاهي مائل يقابل الشمس، فتضيء وجوه الجبال المقابلة له وتظلم الأخرى؛ والإضاءة المحيطة تبقى خافتة
    // Moon: a low directional light opposite the sun, lighting the slopes that face it; ambient stays dim for a night mood
    const night = 1 - smoothstep(-0.08, 0.1, elevation);
    const { moon } = this.env;
    moon.direction = new Vector3(Math.cos(angle) * 0.9, -Math.max(0.45, -elevation), 0.55).normalize();
    moon.intensity = 0.62 * night;
    moon.setEnabled(night > 0.001);
    ambient.intensity = 0.2 + 0.24 * daylight;
    ambient.diffuse = Color3.Lerp(Color3.Lerp(NIGHT_AMBIENT, DAY_AMBIENT, daylight), DUSK_AMBIENT, dusk * 0.5);
    ambient.groundColor = Color3.Lerp(NIGHT_GROUND, DAY_GROUND, daylight);

    // السماء والضباب: نهار ← لون الغروب قرب الأفق ← ليل / Sky and fog: day → dusk tint near the horizon → night
    sky.sunPosition = position.scale(100);
    sky.luminance = 0.15 + 0.85 * daylight;
    const horizon = Color3.Lerp(Color3.Lerp(NIGHT_SKY, HORIZON, daylight), DUSK_SKY, dusk * 0.55);
    const scene = sun.getScene();
    scene.fogColor = horizon;
    scene.clearColor = horizon.toColor4(1);
    // ضباب أخف ليلًا حتى لا تذوب اليابسة البعيدة في البحر / Lighter fog at night so distant land does not melt into the sea
    scene.fogDensity = this.env.fogDensity * (1 - 0.45 * night);
    if (this.water) applyWaterNight(this.water, night);

    // الإنارة تعمل تلقائيًا مع حلول الظلام وتنطفئ مع الشروق / Lights switch on with dusk and off at sunrise
    this.lights.apply(night);
    if (glow) glow.intensity = 0.9 * night;
  }
}
