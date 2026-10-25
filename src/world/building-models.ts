// مسؤولية الملف: مجسمات المباني الموضوعة حسب عمود "النموذج" — سقالة ترتفع أثناء الإنشاء ثم المبنى المكتمل
// File responsibility: placed building models by the "model" column — a rising scaffold during construction, then the finished building
//
// المجسمات إجرائية مؤقتًا حتى تُضاف نماذج glTF. الطرق تُرسم في road-network وليس هنا.
// Procedural until glTF models are added. Roads are drawn by road-network, not here.

import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, type Material, type ShadowGenerator } from '@babylonjs/core';
import { isRoad, isUnderConstruction } from '../core/economy';
import type { BuildingDef, GameState, PlacedBuilding, World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';
import type { NightLights } from './day-night';
import { WINDOW_LIGHT } from './settlements';

interface Model {
  root: TransformNode;
  mesh: Mesh;
  finished: Material | null;
  done: boolean;
}

/** جزء مجسم؛ lit يعني أن نوافذه تضيء ليلًا / A mesh part; lit means its windows glow at night */
type Part = { mesh: Mesh; color: string; lit?: boolean };

export class BuildingModels {
  private readonly models = new Map<string, Model>();
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly scaffold: StandardMaterial;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly defs: Map<string, BuildingDef>,
    private readonly shadows: ShadowGenerator | null,
    private readonly onCreate: (mesh: Mesh, placed: PlacedBuilding) => void,
    private readonly onRemove: (mesh: Mesh) => void,
    private readonly lights: NightLights,
  ) {
    this.scaffold = new StandardMaterial('scaffold', scene);
    this.scaffold.diffuseColor = new Color3(0.86, 0.68, 0.36);
    this.scaffold.emissiveColor = new Color3(0.2, 0.13, 0.04);
    this.scaffold.wireframe = true;
  }

  /** مطابقة المجسمات مع الحالة وتحديث تقدم الإنشاء / Match models to state and update construction progress */
  sync(state: GameState, now: number): void {
    const alive = new Set<string>();
    for (const placed of state.buildings) {
      const def = this.defs.get(placed.buildingId);
      if (!def || isRoad(def)) continue;
      alive.add(placed.uid);
      const model = this.models.get(placed.uid) ?? this.create(placed, def);
      const building = isUnderConstruction(placed, now);
      const progress = building ? (now - placed.startedAt) / Math.max(1, placed.completesAt - placed.startedAt) : 1;
      model.root.scaling.y = 0.12 + 0.88 * Math.min(1, Math.max(0, progress));
      if (!building && !model.done) {
        model.done = true;
        model.mesh.material = model.finished;
        this.shadows?.addShadowCaster(model.mesh);
      }
    }
    for (const [uid, model] of this.models) {
      if (alive.has(uid)) continue;
      this.onRemove(model.mesh);
      model.root.dispose();
      this.models.delete(uid);
    }
  }

  private create(placed: PlacedBuilding, def: BuildingDef): Model {
    const s = this.world.settings.tileSize;
    const c = tileCenter(this.world, placed.x, placed.z);
    const root = new TransformNode(`b-${placed.uid}`, this.scene);
    root.position.set(c.x, Math.max(0, sampleHeight(this.world, c.x, c.z)), c.z);

    const tint = Color3.FromHSV(hash(def.category) % 360, 0.25, 0.85).toHexString();
    const parts = this.shape(def.model, s, tint);
    const mesh = Mesh.MergeMeshes(parts.map((p) => { p.mesh.material = this.material(p.color, !!p.lit); return p.mesh; }), true, true, undefined, false, true)!;
    mesh.name = `b-mesh-${placed.uid}`;
    mesh.parent = root;
    const finished = mesh.material;
    mesh.material = this.scaffold;
    this.onCreate(mesh, placed);

    const model = { root, mesh, finished, done: false };
    this.models.set(placed.uid, model);
    return model;
  }

  /** أجزاء المجسم لكل نمط / Mesh parts for each style */
  private shape(style: string, s: number, tint: string): Part[] {
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, lit = false): Part => {
      const m = MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, this.scene);
      m.position.set(x, y + h / 2, z);
      return { mesh: m, color, lit };
    };
    const roof = (w: number, h: number, y: number, color: string, x = 0, z = 0): Part => {
      const m = MeshBuilder.CreateCylinder('p', { diameterTop: 0, diameterBottom: w * 1.4, height: h, tessellation: 4 }, this.scene);
      m.rotation.y = Math.PI / 4;
      m.position.set(x, y + h / 2, z);
      return { mesh: m, color };
    };
    const cylinder = (d: number, h: number, x: number, y: number, z: number, color: string): Part => {
      const m = MeshBuilder.CreateCylinder('p', { diameter: d, height: h, tessellation: 12 }, this.scene);
      m.position.set(x, y + h / 2, z);
      return { mesh: m, color };
    };
    const dome = (d: number, y: number, color: string): Part => {
      const m = MeshBuilder.CreateSphere('p', { diameter: d, segments: 10, slice: 0.5 }, this.scene);
      m.position.y = y;
      return { mesh: m, color };
    };

    switch (style) {
      case 'house':
        return [box(s * 0.32, s * 0.22, s * 0.28, -s * 0.16, 0, 0, '#e8dcc4', true), roof(s * 0.32, s * 0.16, s * 0.22, '#9a5a3c', -s * 0.16),
          box(s * 0.26, s * 0.18, s * 0.24, s * 0.2, 0, s * 0.12, '#e2d6bd', true), roof(s * 0.26, s * 0.13, s * 0.18, '#8d5034', s * 0.2, s * 0.12)];
      case 'tower':
        return [box(s * 0.5, s * 0.95, s * 0.5, 0, 0, 0, tint, true), box(s * 0.54, s * 0.05, s * 0.54, 0, s * 0.95, 0, '#5d6a6f')];
      case 'field':
        return [box(s * 0.86, s * 0.03, s * 0.86, 0, 0, 0, '#8a6b3f'),
          ...[-0.3, -0.1, 0.1, 0.3].map((z) => box(s * 0.8, s * 0.06, s * 0.1, 0, s * 0.03, s * z, '#b9c95a'))];
      case 'barn':
        return [box(s * 0.62, s * 0.26, s * 0.36, 0, 0, -s * 0.12, '#9c3d2e'), roof(s * 0.5, s * 0.16, s * 0.26, '#5b3a2a', 0, -s * 0.12),
          box(s * 0.8, s * 0.06, s * 0.03, 0, 0, s * 0.3, '#d8c39a')];
      case 'utility':
        return [cylinder(s * 0.3, s * 0.34, -s * 0.18, 0, 0, '#c9d3d6'), cylinder(s * 0.3, s * 0.34, s * 0.18, 0, 0, '#c9d3d6'),
          box(s * 0.3, s * 0.18, s * 0.22, 0, 0, s * 0.28, tint)];
      case 'industry':
        return [box(s * 0.7, s * 0.3, s * 0.5, 0, 0, 0, tint, true), cylinder(s * 0.1, s * 0.7, s * 0.24, 0, -s * 0.14, '#6b6560')];
      case 'park':
        return [box(s * 0.86, s * 0.03, s * 0.86, 0, 0, 0, '#5f9445'),
          ...[[-0.25, -0.2], [0.22, -0.18], [0, 0.22]].map(([x, z]) => cylinder(s * 0.22, s * 0.28, s * x, s * 0.03, s * z, '#3f7a35'))];
      case 'palace':
        return [box(s * 0.78, s * 0.34, s * 0.6, 0, 0, 0, '#efe6d2', true), dome(s * 0.36, s * 0.34, '#c9a961'),
          ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => cylinder(s * 0.1, s * 0.5, s * 0.36 * x, 0, s * 0.27 * z, '#e4d9c0'))];
      default: // civic
        return [box(s * 0.62, s * 0.32, s * 0.5, 0, 0, 0, '#e6e0d4', true), box(s * 0.66, s * 0.04, s * 0.54, 0, s * 0.32, 0, tint), dome(s * 0.26, s * 0.36, tint)];
    }
  }

  /** مادة مشتركة لكل لون؛ الجدران المضاءة تُسجَّل في أضواء الليل / One shared material per colour; lit walls join the night lights */
  private material(hex: string, lit: boolean): StandardMaterial {
    const key = `${hex}${lit ? ':lit' : ''}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new StandardMaterial(`m-${key}`, this.scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = new Color3(0.05, 0.05, 0.05);
      if (lit) this.lights.add(m, WINDOW_LIGHT);
      this.materials.set(key, m);
    }
    return m;
  }
}

/** رقم ثابت من نص / Stable number from text */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
