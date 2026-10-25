// مسؤولية الملف: حركة السيارات المرئية بنماذج Kenney على الطرق المعبدة (على حدود المربعات) — عددها يزيد مع السكان
// File responsibility: visible Kenney car traffic on paved roads (on tile edges) — grows with population, no economic effect

import { Vector3, type Scene, type TransformNode } from '@babylonjs/core';
import { CAR_MODELS } from '../assets/catalog';
import type { ModelLibrary } from '../assets/model-library';
import { edgeCorners, tileKey } from '../core/economy';
import type { World } from '../core/types';
import { sampleHeight, worldHalfExtents } from '../core/world-gen';

/** سكان لكل سيارة، وأقصى عدد، وسرعة بالمربعات في الثانية / Residents per car, max cars, speed in tiles per second */
const RESIDENTS_PER_CAR = 25;
const MAX_CARS = 40;
const SPEED = 0.6;

interface Car {
  node: TransformNode | null;
  from: string;
  to: string;
  t: number;
}

export class Traffic {
  private readonly cars: Car[] = [];
  /** الزوايا المتصلة بكل زاوية عبر الطرق المعبدة / Corners linked to each corner by paved roads */
  private links = new Map<string, string[]>();

  constructor(scene: Scene, private readonly world: World, private readonly library: ModelLibrary) {
    scene.onBeforeRenderObservable.add(() => this.move(scene.getEngine().getDeltaTime() / 1000));
  }

  /** ضبط شبكة الطرق المعبدة وعدد السيارات / Set the paved network and car count */
  sync(paved: Set<string>, population: number): void {
    const links = new Map<string, string[]>();
    for (const edge of paved) {
      const [a, b] = edgeCorners(edge).map(([x, z]) => tileKey(x, z));
      links.set(a, [...(links.get(a) ?? []), b]);
      links.set(b, [...(links.get(b) ?? []), a]);
    }
    this.links = links;
    // السيارة على طريق أُزيل تختفي / A car on a removed road disappears
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (!links.has(this.cars[i].from)) this.cars.splice(i, 1)[0].node?.dispose();
    }
    const corners = [...links.keys()];
    const target = corners.length ? Math.min(MAX_CARS, Math.floor(population / RESIDENTS_PER_CAR), paved.size * 2) : 0;
    while (this.cars.length > target) this.cars.pop()!.node?.dispose();
    while (this.cars.length < target) {
      const from = corners[Math.floor(Math.random() * corners.length)];
      const car: Car = { node: null, from, to: this.pick(from, null), t: Math.random() };
      this.cars.push(car);
      const path = CAR_MODELS[this.cars.length % CAR_MODELS.length];
      void this.library.spawn(path, { footprint: this.world.settings.tileSize * 0.1 }).then(({ root }) => {
        if (this.cars.includes(car)) car.node = root;
        else root.dispose();
      });
    }
  }

  /** الزاوية التالية، مع تجنب الرجوع إلا عند نهاية الطريق / Next corner, avoiding U-turns except at dead ends */
  private pick(from: string, previous: string | null): string {
    const options = this.links.get(from) ?? [];
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
      if (!car.node) continue;
      const a = this.corner(car.from);
      const b = this.corner(car.to);
      const p = Vector3.Lerp(a, b, car.t);
      // كل سيارة تسير على يمين الطريق / Every car keeps to the right of the road
      const dir = b.subtract(a);
      if (dir.lengthSquared() > 0) {
        p.addInPlace(new Vector3(dir.z, 0, -dir.x).normalize().scale(this.world.settings.tileSize * 0.05));
        car.node.rotation.y = Math.atan2(dir.x, dir.z);
      }
      p.y = Math.max(0, sampleHeight(this.world, p.x, p.z)) + 0.1;
      car.node.position.copyFrom(p);
    }
  }

  private corner(key: string): Vector3 {
    const [x, z] = key.split(',').map(Number);
    const { halfX, halfZ } = worldHalfExtents(this.world);
    const s = this.world.settings.tileSize;
    return new Vector3(x * s - halfX, 0, z * s - halfZ);
  }
}
