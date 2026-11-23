// Traffic module: transit (monorail, metro, cableway), road traffic light streams, air traffic and the drone show.
// Each part is a sub-system with the usual hooks. ?trafficParts=transit,cars,air limits the active parts (profiling).

import { Transit } from './transit.js';
import { Cars } from './trafficCars.js';
import { Air } from './air.js';

const parts = [];

export default {
  name: 'traffic',
  parts,
  async init(ctx) {
    const want = (ctx.params.get('trafficParts') || 'transit,cars,air').split(',');
    if (want.includes('transit')) parts.push(new Transit());
    if (want.includes('cars')) parts.push(new Cars());
    if (want.includes('air')) parts.push(new Air());
    for (const p of parts) await p.init(ctx);
  },
  update(ctx) { for (let i = 0; i < parts.length; i++) if (parts[i].update) parts[i].update(ctx); },
  compute(ctx, enc) { for (let i = 0; i < parts.length; i++) if (parts[i].compute) parts[i].compute(ctx, enc); },
  gbuffer(ctx, pass) { for (let i = 0; i < parts.length; i++) if (parts[i].gbuffer) parts[i].gbuffer(ctx, pass); },
  forward(ctx, pass) { for (let i = 0; i < parts.length; i++) if (parts[i].forward) parts[i].forward(ctx, pass); },
  resize(ctx) { for (let i = 0; i < parts.length; i++) if (parts[i].resize) parts[i].resize(ctx); },
};
