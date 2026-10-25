// مسؤولية الملف: حركة السيارات المرئية على الطرق المعبدة — عددها يزيد مع السكان، ولا تؤثر على الاقتصاد
// File responsibility: visible car traffic on paved roads — grows with population, no economic effect

import { Color3, MeshBuilder, Scene, StandardMaterial, Vector3, type InstancedMesh, type Mesh } from '@babylonjs/core';
import { tileKey } from '../core/economy';
import type { World } from '../core/types';
import { sampleHeight, tileCenter } from '../core/world-gen';

/** سكان لكل سيارة، وأقصى عدد، وسرعة بالمربعات في الثانية / Residents per car, max cars, speed in tiles per second */
const RESIDENTS_PER_CAR = 25;
const MAX_CARS = 40;
const SPEED = 0.7;
const COLORS = ['#d9d4c7', '#b23a2f', '#2f5d8a', '#e0b13a', '#3c3f44', '#6f8f5a'];

interface Car {
  mesh: InstancedMesh;
  from: string;
  to: string;
  t: number;
}

export class Traffic {
  private readonly bases: Mesh[];
  private readonly cars: Car[] = [];
  private roads = new Set<string>();

  constructor(scene: Scene, private readonly world: World) {
    const s = world.settings.tileSize;
    this.bases = COLORS.map((hex, i) => {
      const m = MeshBuilder.CreateBox(`car-${i}`, { width: s * 0.1, height: s * 0.07, depth: s * 0.18 }, scene);
      const mat = new StandardMaterial(`car-mat-${i}`, scene);
      mat.diffuseColor = Color3.FromHexString(hex);
      mat.specularColor = new Color3(0.3, 0.3, 0.3);
      m.material = mat;
      m.isPickable = false;
      m.isVisible = false;
      return m;
    });
    scene.onBeforeRenderObservable.add(() => this.move(scene.getEngine().getDeltaTime() / 1000));
  }

  /** ضبط شبكة الطرق المعبدة وعدد السيارات / Set the paved network and car count */
  sync(paved: Set<string>, population: number): void {
    this.roads = paved;
    // السيارة على طريق أُزيل تختفي / A car on a removed road disappears
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (!paved.has(this.cars[i].from)) this.cars.splice(i, 1)[0].mesh.dispose();
    }
    const connected = [...paved].filter((k) => this.neighbours(k).length);
    const target = connected.length ? Math.min(MAX_CARS, Math.floor(population / RESIDENTS_PER_CAR), connected.length * 2) : 0;
    while (this.cars.length > target) this.cars.pop()!.mesh.dispose();
    while (this.cars.length < target) {
      const from = connected[Math.floor(Math.random() * connected.length)];
      const base = this.bases[this.cars.length % this.bases.length];
      const mesh = base.createInstance(`car-${this.cars.length}`);
      mesh.isPickable = false;
      this.cars.push({ mesh, from, to: this.pick(from, null), t: Math.random() });
    }
  }

  private neighbours(key: string): string[] {
    const [x, z] = key.split(',').map(Number);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => tileKey(x + dx, z + dz)).filter((k) => this.roads.has(k));
  }

  /** الطريق التالي، مع تجنب الرجوع إلا عند نهاية الطريق / Next road, avoiding U-turns except at dead ends */
  private pick(from: string, previous: string | null): string {
    const options = this.neighbours(from);
    const forward = options.filter((k) => k !== previous);
    const list = forward.length ? forward : options;
    return list.length ? list[Math.floor(Math.random() * list.length)] : from;
  }

  private move(dt: number): void {
    for (const car of this.cars) {
      car.t += dt * SPEED;
      while (car.t >= 1) {
        car.t -= 1;
        const previous = car.from;
        car.from = car.to;
        car.to = this.pick(car.from, previous);
      }
      const a = this.center(car.from);
      const b = this.center(car.to);
      const p = Vector3.Lerp(a, b, car.t);
      // كل سيارة تسير على يمين الطريق / Every car keeps to the right of the road
      const dir = b.subtract(a);
      const side = new Vector3(dir.z, 0, -dir.x).normalize().scale(this.world.settings.tileSize * 0.07);
      p.addInPlace(side);
      p.y = Math.max(0, sampleHeight(this.world, p.x, p.z)) + this.world.settings.tileSize * 0.06;
      car.mesh.position.copyFrom(p);
      if (dir.lengthSquared() > 0) car.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    }
  }

  private center(key: string): Vector3 {
    const [x, z] = key.split(',').map(Number);
    const c = tileCenter(this.world, x, z);
    return new Vector3(c.x, 0, c.z);
  }
}
