// First-person controller in the style of Minecraft creative mode.
//  Walk: WASD, Space jumps, gravity, collision with terrain, water surface and building boxes.
//  Fly : double-tap Space to toggle. Space rises, Shift descends. Landing on the ground ends flight.
//  Hold R (or Q), or double-tap W, to sprint. Ctrl is avoided because Ctrl+W closes the browser tab.
//  Mouse wheel changes flying speed.

import { WORLD_BOUND } from './world.js';
import { clamp } from './math.js';

const EYE = 1.7, RADIUS = 0.45, STEP = 0.65;

export class Controls {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.x = 0; this.y = 0; this.z = 0;   // feet position
    this.yaw = 0; this.pitch = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.flying = true;
    this.onGround = false;
    this.flySpeed = 30;
    this.keys = new Set();
    this.lastSpace = 0;
    this.lastW = 0;
    this.sprintW = false;
    this.locked = false;
    this.enabled = true;
    this.sens = 0.0022;
    this.cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 1.05, near: 0.25 };
    this.vel = [0, 0, 0];

    addEventListener('keydown', (e) => {
      if (e.repeat) { if (e.code !== 'Space') return; }
      this.keys.add(e.code);
      if (e.code === 'KeyW' && !e.repeat) {
        const now = performance.now();
        this.sprintW = now - this.lastW < 300;
        this.lastW = now;
      }
      if (e.code === 'Space' && !e.repeat) {
        const now = performance.now();
        if (now - this.lastSpace < 300) { this.flying = !this.flying; this.vy = 0; this.lastSpace = 0; }
        else this.lastSpace = now;
        if (!this.flying && this.onGround) this.vy = 7.2;
      }
      if ((e.code === 'Space' || e.code === 'KeyQ' || e.code === 'KeyR') && this.locked) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyW') this.sprintW = false; });
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sens;
      this.pitch = clamp(this.pitch - e.movementY * this.sens, -1.55, 1.55);
    });
    addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.flySpeed = clamp(this.flySpeed * (e.deltaY > 0 ? 0.85 : 1.18), 4, 400);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }

  setPose(x, y, z, yaw, pitch, fly = true) {
    this.x = x; this.y = y - EYE; this.z = z; this.yaw = yaw; this.pitch = pitch;
    this.vx = this.vy = this.vz = 0;
    this.flying = fly;
  }

  // Highest walkable surface under (x,z) at or below feet + STEP.
  groundAt(x, z, feet) {
    let g = Math.max(this.world.heightAt(x, z), 0.15);   // water acts as a floor
    const cell = this.world.collidersNear(x, z);
    if (cell) {
      for (let i = 0; i < cell.length; i++) {
        const c = cell[i];
        const top = c.cy + c.hy;
        if (top > feet + STEP || top <= g) continue;
        const dx = x - c.cx, dz = z - c.cz;
        const lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
        if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) g = top;
      }
    }
    return g;
  }

  // Push the player out of boxes horizontally (only boxes that overlap the body height).
  resolveWalls() {
    const cell = this.world.collidersNear(this.x, this.z);
    if (!cell) return;
    for (let i = 0; i < cell.length; i++) {
      const c = cell[i];
      const bottom = c.cy - c.hy, top = c.cy + c.hy;
      if (this.y + STEP >= top || this.y + EYE + 0.1 < bottom) continue;
      const dx = this.x - c.cx, dz = this.z - c.cz;
      let lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
      const ex = c.hx + RADIUS, ez = c.hz + RADIUS;
      if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
      const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
      if (px < pz) lx = Math.sign(lx || 1) * ex; else lz = Math.sign(lz || 1) * ez;
      this.x = c.cx + lx * c.cos - lz * c.sin;
      this.z = c.cz + lx * c.sin + lz * c.cos;
    }
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const sprint = this.sprintW || k.has('KeyR') || k.has('KeyQ');
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // horizontal movement ignores pitch (Minecraft style)
    let mx = -sy * f + cy * s, mz = -cy * f - sy * s;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }

    if (this.flying) {
      const speed = this.flySpeed * (sprint ? 4 : 1);
      const up = (k.has('Space') ? 1 : 0) - (k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : 0);
      const a = 1 - Math.exp(-dt * 8);
      this.vx += (mx * speed - this.vx) * a;
      this.vz += (mz * speed - this.vz) * a;
      this.vy += (up * speed * 0.8 - this.vy) * a;
    } else {
      const speed = sprint ? 11 : 5;
      const a = 1 - Math.exp(-dt * (this.onGround ? 12 : 2));
      this.vx += (mx * speed - this.vx) * a;
      this.vz += (mz * speed - this.vz) * a;
      this.vy -= 22 * dt;
    }

    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this.resolveWalls();

    // soft world boundary
    const r = Math.hypot(this.x, this.z);
    if (r > WORLD_BOUND) { const sc = WORLD_BOUND / r; this.x *= sc; this.z *= sc; }
    if (this.y > 1600) { this.y = 1600; this.vy = Math.min(this.vy, 0); }

    const g = this.groundAt(this.x, this.z, this.y);
    // walking down slopes and steps: stay glued to the ground instead of hopping
    if (!this.flying && this.onGround && this.vy <= 0 && this.y > g && this.y - g < 0.8) this.y = g;
    if (this.y <= g) {
      this.y = g;
      if (this.vy < 0) this.vy = 0;
      this.onGround = true;
      if (this.flying && (k.has('ShiftLeft') || k.has('ShiftRight'))) this.flying = false; // land
    } else {
      this.onGround = this.y - g < 0.05;
    }

    const c = this.cam;
    c.x = this.x; c.y = this.y + EYE; c.z = this.z; c.yaw = this.yaw; c.pitch = this.pitch;
    this.vel[0] = this.vx; this.vel[1] = this.vy; this.vel[2] = this.vz;
    return c;
  }
}
