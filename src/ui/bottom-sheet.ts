// مسؤولية الملف: سلوك اللوحة السفلية في تخطيط الجوال — السحب والتثبيت على ثلاث ارتفاعات
// File responsibility: mobile bottom-sheet behaviour — drag and snap to three heights

/** نقاط التثبيت كنسبة من ارتفاع الشاشة / Snap points as fractions of viewport height */
const SNAPS = [0.14, 0.42, 0.78];

export class BottomSheet {
  private snap = 1;

  constructor(private readonly sheet: HTMLElement, handle: HTMLElement) {
    let startY = 0;
    let startH = 0;
    let dragging = false;

    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      startY = e.clientY;
      startH = sheet.getBoundingClientRect().height;
      handle.setPointerCapture(e.pointerId);
      sheet.classList.add('dragging');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const h = Math.min(window.innerHeight * SNAPS[2], Math.max(window.innerHeight * SNAPS[0], startH + startY - e.clientY));
      sheet.style.setProperty('--sheet-h', `${h}px`);
    });
    const end = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('dragging');
      const moved = Math.abs(e.clientY - startY);
      if (moved < 6) {
        // نقرة على المقبض تبدّل بين المصغّر والمتوسط / Tap on the handle toggles collapsed/half
        this.setSnap(this.snap === 0 ? 1 : 0);
        return;
      }
      const frac = sheet.getBoundingClientRect().height / window.innerHeight;
      let nearest = 0;
      SNAPS.forEach((s, i) => Math.abs(s - frac) < Math.abs(SNAPS[nearest] - frac) && (nearest = i));
      this.setSnap(nearest);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    this.setSnap(this.snap);
  }

  /** فتح اللوحة على الارتفاع المتوسط إن كانت مصغّرة / Expand to half height if collapsed */
  reveal(): void {
    if (this.snap === 0) this.setSnap(1);
  }

  private setSnap(i: number): void {
    this.snap = i;
    this.sheet.style.setProperty('--sheet-h', `${SNAPS[i] * 100}dvh`);
  }
}
