// مسؤولية الملف: ضوضاء قيمية ببذرة ثابتة لتوليد التضاريس بشكل قابل للتكرار
// File responsibility: seeded value noise for reproducible terrain generation

/** دالة ضوضاء ثنائية الأبعاد تعيد قيمة بين 0 و 1 / 2D noise function returning 0..1 */
export type Noise2D = (x: number, y: number) => number;

/**
 * ينشئ ضوضاء كسرية (fBm) من خمس طبقات ببذرة محددة
 * Creates 5-octave fractal value noise for the given seed
 */
export function createNoise(seed: number, octaves = 5): Noise2D {
  const hash = (x: number, y: number): number => {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 144665)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);

  const value = (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const w = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };

  return (x, y) => {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let total = 0;
    for (let o = 0; o < octaves; o++) {
      sum += value(x * freq, y * freq) * amp;
      total += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / total;
  };
}
