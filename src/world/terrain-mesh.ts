// مسؤولية الملف: بناء مجسم التضاريس من خريطة الارتفاعات وتلوينه حسب أنواع المربعات
// File responsibility: builds the terrain mesh from the heightmap and colours it by tile type

import { Color3, Mesh, Scene, StandardMaterial, VertexData } from '@babylonjs/core';
import { createNoise } from '../core/noise';
import type { TerrainType, World } from '../core/types';
import { worldHalfExtents } from '../core/world-gen';

/**
 * ينشئ مجسم التضاريس بألوان رؤوس ممزوجة بين المربعات المتجاورة
 * Creates the terrain mesh with vertex colours blended across neighbouring tiles
 */
export function createTerrainMesh(scene: Scene, world: World, terrain: TerrainType[]): Mesh {
  const { vertsX, vertsZ, heights } = world;
  const { tileSize, vertsPerTile, tilesX, tilesZ } = world.settings;
  const { halfX, halfZ } = worldHalfExtents(world);
  const step = tileSize / vertsPerTile;

  const positions = new Float32Array(vertsX * vertsZ * 3);
  for (let iz = 0; iz < vertsZ; iz++) {
    for (let ix = 0; ix < vertsX; ix++) {
      const i = (iz * vertsX + ix) * 3;
      positions[i] = ix * step - halfX;
      positions[i + 1] = heights[iz * vertsX + ix];
      positions[i + 2] = iz * step - halfZ;
    }
  }

  const indices: number[] = [];
  const idx = (x: number, z: number): number => z * vertsX + x;
  for (let iz = 0; iz < vertsZ - 1; iz++) {
    for (let ix = 0; ix < vertsX - 1; ix++) {
      indices.push(idx(ix + 1, iz), idx(ix + 1, iz + 1), idx(ix, iz + 1));
      indices.push(idx(ix, iz), idx(ix + 1, iz), idx(ix, iz + 1));
    }
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  // ضمان اتجاه الوجوه للأعلى مهما كان نظام الإحداثيات / Guarantee upward-facing triangles
  if (normals[1] + normals[normals.length - 2] < 0) {
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    normals.length = 0;
    VertexData.ComputeNormals(positions, indices, normals);
  }

  const palette = new Map(terrain.map((t) => [t.id, Color3.FromHexString(t.color)]));
  const rock = new Color3(0.42, 0.39, 0.35);
  const variation = createNoise(world.settings.seed + 31, 3);
  const colors = new Float32Array(vertsX * vertsZ * 4);
  const tmp = new Color3();

  const fallback = Color3.Gray();
  const tileColor = (tx: number, tz: number): Color3 => {
    const x = Math.min(tilesX - 1, Math.max(0, tx));
    const z = Math.min(tilesZ - 1, Math.max(0, tz));
    return palette.get(world.tiles[z * tilesX + x].terrainId) ?? fallback;
  };

  for (let iz = 0; iz < vertsZ; iz++) {
    for (let ix = 0; ix < vertsX; ix++) {
      // مزج ثنائي الخطية بين مراكز المربعات مع إزاحة ضوضائية تكسر الخطوط المستقيمة
      // Bilinear blend between tile centres, with a noise offset that breaks straight edges
      const gx = ix / vertsPerTile - 0.5 + (variation(ix * 0.21, iz * 0.21) - 0.5) * 0.9;
      const gz = iz / vertsPerTile - 0.5 + (variation(iz * 0.21 + 40, ix * 0.21) - 0.5) * 0.9;
      const tx = Math.floor(gx);
      const tz = Math.floor(gz);
      const fx = gx - tx;
      const fz = gz - tz;
      const top = Color3.Lerp(tileColor(tx, tz), tileColor(tx + 1, tz), fx);
      const bottom = Color3.Lerp(tileColor(tx, tz + 1), tileColor(tx + 1, tz + 1), fx);
      Color3.LerpToRef(top, bottom, fz, tmp);

      // المنحدرات الحادة صخرية، مع تفاوت خفيف يكسر التكرار / Steep slopes turn rocky; slight variation breaks repetition
      const v = iz * vertsX + ix;
      const slope = 1 - normals[v * 3 + 1];
      const rockiness = Math.min(1, Math.max(0, (slope - 0.18) * 3)) * (heights[v] > 0.5 ? 1 : 0);
      const c = Color3.Lerp(tmp, rock, rockiness);
      const shade = 0.92 + variation(ix * 0.15, iz * 0.15) * 0.16;
      colors[v * 4] = c.r * shade;
      colors[v * 4 + 1] = c.g * shade;
      colors[v * 4 + 2] = c.b * shade;
      colors[v * 4 + 3] = 1;
    }
  }

  const mesh = new Mesh('terrain', scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.colors = colors;
  data.applyToMesh(mesh);

  const material = new StandardMaterial('terrain-mat', scene);
  material.diffuseColor = Color3.White();
  material.specularColor = new Color3(0.04, 0.04, 0.04);
  mesh.material = material;
  mesh.receiveShadows = true;
  mesh.freezeWorldMatrix();
  return mesh;
}
