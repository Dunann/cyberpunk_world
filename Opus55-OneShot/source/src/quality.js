// Quality presets and adaptive resolution.
// Modules read ctx.quality.level (0 low, 1 medium, 2 high) and ctx.quality.drawDistance at init/update.
// Adaptive mode lowers the render scale first (in 0.1 steps, min 0.6) when frames are slow, and raises it again
// when there is headroom. TAA keeps the image stable at reduced scale.

const PRESETS = {
  high: { level: 2, scale: 1.0, drawDistance: 1.0 },
  medium: { level: 1, scale: 0.85, drawDistance: 0.8 },
  low: { level: 0, scale: 0.67, drawDistance: 0.6 },
};

export class Quality {
  constructor(ctx, requested, adaptive) {
    let name = requested && PRESETS[requested] ? requested : 'high';
    if (!requested) {
      const v = (ctx.gpu.vendor || '').toLowerCase();
      const desc = (ctx.gpu.adapterName || '').toLowerCase();
      if (/intel|qualcomm|arm|apple/.test(v) && !/arc a[0-9]/.test(desc)) name = 'medium';
      if (/mobile|android|iphone/i.test(navigator.userAgent)) name = 'low';
    }
    this.name = name;
    const p = PRESETS[name];
    this.level = p.level;
    this.baseScale = p.scale;
    this.scale = p.scale;
    this.drawDistance = p.drawDistance;
    this.adaptive = adaptive;
    this.avg = 1 / 60;
    this.slowTime = 0;
    this.fastTime = 0;
  }

  update(dt) {
    if (!this.adaptive || dt <= 0) return;
    this.avg += (dt - this.avg) * 0.05;
    if (this.avg > 1 / 52) { this.slowTime += dt; this.fastTime = 0; }
    else if (this.avg < 1 / 75) { this.fastTime += dt; this.slowTime = 0; }
    else { this.slowTime = 0; this.fastTime = 0; }
    if (this.slowTime > 1.5 && this.scale > 0.6) { this.scale = Math.max(0.6, this.scale - 0.1); this.slowTime = 0; this.avg = 1 / 60; }
    if (this.fastTime > 6 && this.scale < this.baseScale) { this.scale = Math.min(this.baseScale, this.scale + 0.1); this.fastTime = 0; }
  }
}
