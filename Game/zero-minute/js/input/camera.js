// RTS camera rig: a focus point on the ground, orbit yaw/pitch, zoom distance.
import { WORLD } from '../sim/defs.js';
import { heightAt } from '../sim/map.js';

export class CameraRig {
  constructor(map) {
    this.map = map;
    this.tx = WORLD / 2; this.tz = WORLD / 2; this.ty = 0;
    this.dist = 88; this.goalDist = 88; this.yaw = 0; this.pitch = 0.93;
    this.minDist = 26; this.maxDist = 190;
  }
  focus(x, z) { this.tx = Math.min(WORLD - 8, Math.max(8, x)); this.tz = Math.min(WORLD - 8, Math.max(8, z)); }
  // Pan in screen space: right = +sx, up/forward = +sy
  pan(sx, sy) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.focus(this.tx + c * sx - s * sy, this.tz - s * sx - c * sy);
  }
  zoom(f) { this.goalDist = Math.min(this.maxDist, Math.max(this.minDist, this.goalDist * f)); }
  rotate(dyaw, dpitch) { this.yaw += dyaw; this.pitch = Math.min(1.42, Math.max(0.5, this.pitch + dpitch)); }
  update(dt, panX, panY) {
    const speed = this.dist * 1.15 * dt;
    if (panX || panY) this.pan(panX * speed, panY * speed);
    this.dist += (this.goalDist - this.dist) * Math.min(1, dt * 10);
    const h = heightAt(this.map, this.tx, this.tz);
    this.ty += (h - this.ty) * Math.min(1, dt * 5);
  }
  apply(cam) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    cam.position.set(this.tx + Math.sin(this.yaw) * this.dist * cp, this.ty + this.dist * sp, this.tz + Math.cos(this.yaw) * this.dist * cp);
    cam.lookAt(this.tx, this.ty, this.tz);
    cam.updateMatrixWorld();
  }
}
