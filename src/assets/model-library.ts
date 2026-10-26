// مسؤولية الملف: تحميل نماذج glTF/GLB مرة واحدة وإنشاء نسخ منها بحجم مضبوط على مساحة المربع
// File responsibility: loads glTF/GLB models once and spawns copies scaled to fit a tile footprint

import '@babylonjs/loaders/glTF';
import { LEAF_ALPHA_CUTOFF, MATERIAL_COLORS } from './catalog';
import { LoadAssetContainerAsync, PBRMaterial, TransformNode, Vector3, type AbstractMesh, type AssetContainer, type Scene } from '@babylonjs/core';

/** مسار مجلد النماذج المنشور مع اللعبة / Published models folder */
const MODELS_URL = `${import.meta.env.BASE_URL}models/`;

/** طريقة ملاءمة النموذج / How a model is fitted */
export interface FitOptions {
  /** أكبر بعد أفقي للنموذج بوحدات العالم؛ إن غاب يبقى النموذج بمقاسه وأصله الأصليين / Largest horizontal extent; absent keeps native size and origin */
  footprint?: number;
  /** دوران حول المحور الرأسي بالراديان / Yaw in radians */
  yaw?: number;
}

export class ModelLibrary {
  private readonly containers = new Map<string, Promise<AssetContainer>>();
  /** أبعاد النموذج الأصلية / Native model bounds */
  private readonly bounds = new Map<string, { min: Vector3; max: Vector3 }>();

  constructor(private readonly scene: Scene) {}

  /** تحميل نموذج (مرة واحدة لكل مسار) / Load a model (once per path) */
  load(path: string): Promise<AssetContainer> {
    let pending = this.containers.get(path);
    if (!pending) {
      pending = LoadAssetContainerAsync(MODELS_URL + path, this.scene).then((c) => {
        // glTF يعتبر المادة معدنية إن لم تحدد ذلك، فتبدو داكنة باهتة بلا بيئة عاكسة؛ نماذج Kenney غير معدنية
        // glTF defaults to metallic when unspecified, looking dull without an environment; Kenney models are not metal
        for (const m of c.materials) {
          if (m instanceof PBRMaterial) {
            m.metallic = 0;
            m.roughness = 0.9;
            const color = MATERIAL_COLORS[m.name];
            if (color) m.albedoColor.set(...color);
            if (m.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHATEST) m.alphaCutOff = Math.min(m.alphaCutOff, LEAF_ALPHA_CUTOFF);
          }
        }
        // الأبعاد من نسخة مؤقتة، ثم تُحذف / Bounds from a temporary copy, then discarded
        const probe = c.instantiateModelsToScene(undefined, false, { doNotInstantiate: true });
        const root = probe.rootNodes[0] as TransformNode;
        root.computeWorldMatrix(true);
        const { min, max } = root.getHierarchyBoundingVectors(true);
        this.bounds.set(path, { min: min.clone(), max: max.clone() });
        probe.dispose();
        return c;
      });
      this.containers.set(path, pending);
    }
    return pending;
  }

  /**
   * نسخة من النموذج: أسفله على الأرض، ومركزه في نقطة الأصل، وأكبر بعد أفقي = footprint
   * A copy of the model: bottom on the ground, centred on the origin, largest horizontal extent = footprint
   */
  async spawn(path: string, fit: FitOptions): Promise<{ root: TransformNode; meshes: AbstractMesh[] }> {
    const container = await this.load(path);
    const b = this.bounds.get(path)!;
    // نسخ تشارك الشكل الهندسي لكن يمكن تغيير مادتها (للسقالة والمعاينة) / Clones share geometry but can swap materials (scaffold, preview)
    const entries = container.instantiateModelsToScene(undefined, false, { doNotInstantiate: true });
    const inner = entries.rootNodes[0] as TransformNode;
    const size = b.max.subtract(b.min);
    const holder = new TransformNode(`model-${path}`, this.scene);
    inner.parent = holder;
    if (fit.footprint !== undefined) {
      const scale = fit.footprint / Math.max(size.x, size.z, 1e-3);
      inner.position.set(-(b.min.x + size.x / 2) * scale, -b.min.y * scale, -(b.min.z + size.z / 2) * scale);
      inner.scaling.scaleInPlace(scale);
    }
    holder.rotation.y = fit.yaw ?? 0;
    const meshes = inner.getChildMeshes(false);
    for (const m of meshes) m.isPickable = false;
    return { root: holder, meshes };
  }

  /** ارتفاع النموذج بعد ملاءمته / Model height once fitted */
  heightFor(path: string, footprint: number): number {
    const b = this.bounds.get(path);
    if (!b) return 0;
    const size = b.max.subtract(b.min);
    return size.y * (footprint / Math.max(size.x, size.z, 1e-3));
  }
}
