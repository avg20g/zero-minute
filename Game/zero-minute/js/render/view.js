// The Three.js view. Reads sim state, never writes it. Interpolates between
// the previous and current sim tick so motion is smooth at any frame rate.
// Everything the player is shown goes through the sim's fog helpers.
import { TEAM } from '../ui/teamColors.js';
import THREE from '../lib/three.js';
import { N, CELL, PLAYER, NEUTRAL, angDiff } from '../sim/defs.js';
import { UNITS, BLDGS, WEAPONS, POWERS, HERO_CALL } from '../sim/factionRegistry.js';
import { heightAt, WATER_Y } from '../sim/map.js';
import { strikeVisible, fxVisible, SCUD_GAP } from '../sim/powers.js';
import { fowUniforms } from './gfx.js';
import { buildTerrain, buildRocks, buildWater, buildBridges, buildTrees } from './terrain.js';
import { Environment, makeTerrainTextures, terrainMaterial } from './environmentFX.js';
import { createModel, createPlane, createMissile, createChute, buildGhost, buildCrate, buildBomb, bakeStats } from './modelFactory.js';
import { VFX, VET_TRACER } from './vfxManager.js';

const AIR_Y = 13, LASER = [0.4, 0.9, 1], PDL = [0.6, 1, 1], PBEAM = [0.56, 0.85, 1];
const TEAM_HEX = TEAM.light; // lobby colours

export class View {
  constructor(canvas, sim, opts = {}) {
    this.sim = sim; this.map = sim.map;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;

    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 1400);
    // sun, sky, fog, image-based light, headlights and searchlights all live in the environment
    this.env = new Environment(r, scene);

    // Fog-of-War texture (smoothed on the CPU, sampled by every lit material)
    this.fowData = new Uint8Array(N * N);     // one channel: the shader only reads red
    this.fowCur = new Float32Array(N * N); this.fowRow = 0;
    const ft = this.fowTex = new THREE.DataTexture(this.fowData, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    ft.magFilter = THREE.LinearFilter; ft.minFilter = THREE.LinearFilter; ft.generateMipmaps = false; ft.needsUpdate = true;
    fowUniforms.uFow.value = ft; fowUniforms.uFowInv.value = 1 / (N * CELL);   // maps come in several sizes
    this.fowFrame = 0;

    const aniso = Math.min(8, r.capabilities.getMaxAnisotropy());
    this.terrainTex = makeTerrainTextures(aniso, this.map.biome);
    scene.add(buildTerrain(this.map, terrainMaterial(this.terrainTex)));
    scene.add(buildRocks(this.map));
    if (this.map.hasWater) { scene.add(this.water = buildWater(this.map, sim.nav.distS)); scene.add(buildBridges(this.map)); }
    if (this.map.trees.length) scene.add(buildTrees(this.map));

    this.fx = new VFX(scene, this.map);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.fx.shakeOn = false;
    this.setLighting(opts.lighting || 'noon');
    this.skyBeams = [];           // Particle Cannon buildings firing into the sky right now
    this.views = new Map(); this.props = new Map(); // props: crates, strike aircraft, bombs
    this.rings = []; this.ringGeo = new THREE.RingGeometry(0.86, 1, 28); this.ringGeo.rotateX(-Math.PI / 2);
    this.sqGeo = new THREE.RingGeometry(0.93, 1, 4, 1, Math.PI / 4); this.sqGeo.rotateX(-Math.PI / 2);
    this.thinGeo = new THREE.RingGeometry(0.965, 1, 64); this.thinGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x7dffa0, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    this.ringMatE = new THREE.MeshBasicMaterial({ color: TEAM.light[1], transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    this.ringMatP = new THREE.MeshBasicMaterial({ color: 0xf2a93b, transparent: true, opacity: 0.95, depthWrite: false, fog: false });
    this.ghost = buildGhost(); scene.add(this.ghost);
    this.vis = 0; this.shown = { units: 0, hiddenEnemies: 0 };
    this._v = new THREE.Vector3();
    this.w = 1; this.h = 1; this.time = 0;
  }

  setLighting(id) { this.lighting = this.env.apply(id, this.fx); return this.lighting; }
  // Resource counts for the leak check: these must stay flat once every unit type has been seen.
  stats() { const i = this.renderer.info; return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0, calls: i.render.calls, triangles: i.render.triangles, views: this.views.size, props: this.props.size, vfx: this.fx.stats(), models: bakeStats() }; }

  resize(w, h) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---- sim events -> effects (each one gated by the player's fog) ----
  handleEvents(events) {
    const sim = this.sim, fx = this.fx, fog = sim.fog;
    const see = (e) => this.reveal || fxVisible(sim, PLAYER, e);
    const altOf = (id) => { const v = this.views.get(id); return v && v.alt ? v.alt : AIR_Y; };   // how high that aircraft is drawn right now
    for (const e of events) {
      switch (e.t) {
        case 'tracer': {
          if (!fog.visAt(PLAYER, e.x, e.z) && !fog.visAt(PLAYER, e.tx, e.tz)) break;
          const y0 = fx.h(e.x, e.z) + (e.sAir ? altOf(e.sid) + (e.y ?? -0.6) : e.y ?? 1.1), y1 = fx.h(e.tx, e.tz) + (e.tAir ? altOf(e.tid) : 0.9), a = Math.atan2(e.tz - e.z, e.tx - e.x);
          const sx = e.x + Math.cos(a) * 0.9, sz = e.z + Math.sin(a) * 0.9, col = VET_TRACER[e.vet || 0], glow = 1 + (e.vet || 0) * 0.4;
          const n = WEAPONS[e.w].cd <= 4 ? 1 : e.w === 'sniper' ? 1 : 3;
          for (let i = 0; i < n; i++) {
            const ox = (fx.rnd() - 0.5) * 1.6, oz = (fx.rnd() - 0.5) * 1.6, oy = (fx.rnd() - 0.5) * 0.8;
            fx.tracer(sx + ox * 0.3, y0 + oy * 0.3, sz + oz * 0.3, e.tx + ox, y1 + oy, e.tz + oz, e.w === 'sniper' ? 420 : 170 + i * 25, col, glow);
          }
          fx.muzzle(sx, y0, sz, a, false);
          if (!e.tAir) fx.dust(e.tx + (fx.rnd() - 0.5) * 2, fx.h(e.tx, e.tz), e.tz + (fx.rnd() - 0.5) * 2, 2, 1.5, 0.7, 0.3);
          break;
        }
        case 'laser': {
          if (!fog.visAt(PLAYER, e.x, e.z) && !fog.visAt(PLAYER, e.tx, e.tz)) break;
          fx.beam(e.x, fx.h(e.x, e.z) + (e.sAir ? altOf(e.sid) : e.y ?? 1.9), e.z, e.tx, fx.h(e.tx, e.tz) + (e.tAir ? altOf(e.tid) : 1.2), e.tz, WEAPONS[e.w].beam || (e.vet ? VET_TRACER[e.vet] : LASER));   // a weapon may have its own beam colour (the bear's eyes are red)
          break;
        }
        case 'melee': { // a spear thrust: sparks where it lands, and the figure lunges (recoil forward)
          if (!fog.visAt(PLAYER, e.x, e.z)) break;
          const y = fx.h(e.tx, e.tz) + (e.onBldg ? 1.6 : 1.1), dx = e.tx - e.x, dz = e.tz - e.z, l = Math.hypot(dx, dz) || 1, r = Math.min(l, 2.6);
          fx.spark(e.x + dx / l * r, y, e.z + dz / l * r, [1, 0.85, 0.5]); fx.dust(e.x + dx / l * r, y - 0.8, e.z + dz / l * r, 3, 1.2, 0.9, 0.3);
          break;
        }
        case 'spray': {
          if (!fog.visAt(PLAYER, e.x, e.z)) break;
          const y = fx.h(e.x, e.z) + 1.7, dx = e.tx - e.x, dz = e.tz - e.z;
          for (let i = 0; i < 3; i++) { const g = 0.6 + fx.rnd() * 0.3; fx.smoke.spawn(e.x + dx * 0.1, y, e.z + dz * 0.1, dx * (1.3 + fx.rnd() * 0.5) + (fx.rnd() - 0.5) * 3, -0.5 + fx.rnd(), dz * (1.3 + fx.rnd() * 0.5) + (fx.rnd() - 0.5) * 3, 0.7 + fx.rnd() * 0.3, 0.8, 3.4, 0.3 * g, g, 0.16 * g, 0.5, 0.5, 1.2); }
          break;
        }
        case 'fire': {
          if (!fog.visAt(PLAYER, e.x, e.z)) break;
          const v = this.views.get(e.sid), len = e.len ?? (v && v.muzzle ? v.muzzle : 2), my = e.y ?? (v && v.muzzleY !== undefined ? v.muzzleY : 1.6), alt = v && v.alt ? v.alt : 0;   // a shot from a ship's mount carries its own height and barrel length
          if (WEAPONS[e.w].grenade) { const g = 0.8; fx.smoke.spawn(e.x + Math.cos(e.a) * len, fx.h(e.x, e.z) + my + alt, e.z + Math.sin(e.a) * len, Math.cos(e.a) * 2, 0.6, Math.sin(e.a) * 2, 0.35, 0.5, 1.2, g, g, g, 0.4, 0, 2); }   // a grenade launcher thumps: a puff, no flash
          else fx.muzzle(e.x + Math.cos(e.a) * len, fx.h(e.x, e.z) + my + alt, e.z + Math.sin(e.a) * len, e.a, e.k === 'shell' || e.w === 'inferno');
          if (v) v.recoil = 1;
          if (e.w === 'scud_missile') { const y = fx.h(e.x, e.z); fx.dust(e.x, y, e.z, 18, 5, 2.6, 0.4); fx.flash(e.x, y + 3, e.z, 40, 0.25); }   // launch blast round the truck
          break;
        }
        case 'impact': {
          if (!fog.visAt(PLAYER, e.x, e.z)) break;
          const y = fx.h(e.x, e.z) + (e.air ? AIR_Y : e.onBldg ? 2 : 0);
          if (e.w === 'flashbang') { fx.fire.spawn(e.x, y + 2, e.z, 0, 0, 0, 0.18, 16, 10, 1, 1, 1, 1, 0, 0); fx.flash(e.x, y + 3, e.z, 90, 0.2); fx.dust(e.x, y, e.z, 8, 5, 1.6, 0.3); break; }
          fx.explosion(e.x, y, e.z, e.w === 'inferno' ? 1.5 : e.w === 'mig_missile' ? 1.6 : e.k === 'shell' ? 0.75 : 0.95);
          if (!e.onBldg && !e.air) fx.crater(e.x + (fx.rnd() - 0.5) * 1.5, e.z + (fx.rnd() - 0.5) * 1.5, e.splash ? 7 : e.k === 'shell' ? 4.2 : 5);
          break;
        }
        case 'pdl': {
          if (!fog.visAt(PLAYER, e.x, e.z) && !fog.visAt(PLAYER, e.tx, e.tz)) break;
          const ty = fx.h(e.tx, e.tz) + (e.tAir ? AIR_Y : 2.2), py = fx.h(e.x, e.z) + (e.y ?? 2.7);
          if (e.gun) { for (let i = 0; i < 3; i++) fx.tracer(e.x, py, e.z, e.tx + (fx.rnd() - 0.5), ty + (fx.rnd() - 0.5), e.tz + (fx.rnd() - 0.5)); }   // a gun-based defense (Corvette) fires a burst
          else fx.beam(e.x, py, e.z, e.tx, ty, e.tz, PDL, 0.18);
          fx.explosion(e.tx, ty, e.tz, 0.35);
          break;
        }
        case 'die': {
          const seen = e.team === PLAYER || fog.visAt(PLAYER, e.x, e.z);
          if (e.kind === 'bldg') {
            fx.crater(e.x, e.z, e.r * 2.6); // rubble scorch stays even if we did not watch it happen
            if (!seen) break;
            for (let i = 0; i < 5; i++) fx.explosion(e.x + (fx.rnd() - 0.5) * e.r * 1.6, fx.h(e.x, e.z) + 1 + fx.rnd() * 3, e.z + (fx.rnd() - 0.5) * e.r * 1.6, 1.3 + fx.rnd());
            fx.smokeColumn(e.x, e.z, 9, e.r * 0.5);
          } else if (seen) {
            if (UNITS[e.type].infantry) fx.dust(e.x, fx.h(e.x, e.z), e.z, 6, 2, 1.2);
            else if (UNITS[e.type].ship || (!e.air && fx.wet(e.x, e.z))) { // goes down: a blast, a column of water, smoke for a moment, nothing left afloat
              fx.explosion(e.x, WATER_Y + 1.2, e.z, 1.2 + e.r * 0.25); fx.splash(e.x, e.z, 1 + e.r * 0.3); fx.smokeColumn(e.x, e.z, 3, 1 + e.r * 0.2); fx.shake(e.x, e.z, 0.3);
            } else {
              fx.explosion(e.x, fx.h(e.x, e.z) + (e.air ? AIR_Y : 0.8), e.z, e.air ? 1.9 : 1.5); fx.crater(e.x, e.z, 6.5); fx.shake(e.x, e.z, 0.3);
              // ground vehicles leave a charred hull; one in four tanks throws its turret (decided by the unit's id, so replays match)
              if (!e.air) fx.wreck(e.x, e.z, e.f || 0, e.r * 2.3, !!UNITS[e.type].turret, (Math.imul(e.id, 2654435761) >>> 28) < 4, e.tf);
              else fx.smokeColumn(e.x, e.z, 5, 1.2);
            }
          }
          break;
        }
        case 'done': if (e.team === PLAYER) fx.dust(e.x, fx.h(e.x, e.z), e.z, 14, 7, 2.6, 0.28); break;
        // ---- phase 2
        case 'tunnel': {
          if (e.team === PLAYER || fog.visAt(PLAYER, e.fx, e.fz)) fx.dust(e.fx, fx.h(e.fx, e.fz), e.fz, 10, 4, 2, 0.4);
          if (see(e)) { const y = fx.h(e.x, e.z); fx.dust(e.x, y, e.z, 12, 5, 2.2, 0.42); fx.shock(e.x, y + 0.3, e.z, 5, 0.4, 0xe2c48a); }
          break;
        }
        case 'salvage': if (see(e)) { fx.spark(e.x, fx.h(e.x, e.z) + 1.5, e.z, [1, 0.8, 0.3]); fx.spark(e.x, fx.h(e.x, e.z) + 2, e.z, [1, 0.8, 0.3]); fx.shock(e.x, fx.h(e.x, e.z) + 0.3, e.z, 3.5, 0.4, 0xffcf5a); } break;
        case 'vet': if (see(e)) { const y = fx.h(e.x, e.z); fx.shock(e.x, y + 0.3, e.z, 4.5, 0.6, [0xffcf3a, 0x5ac8ff, 0xff4a3a][e.rank - 1]); fx.spark(e.x, y + 2, e.z, VET_TRACER[e.rank]); } break;
        case 'hazard': if (fog.visAt(PLAYER, e.x, e.z) && e.kind === 'fire') fx.explosion(e.x, fx.h(e.x, e.z), e.z, 0.9); break;
        case 'shellhit': if (see(e)) { fx.explosion(e.x, fx.h(e.x, e.z), e.z, 1.5); fx.crater(e.x, e.z, 7.5); fx.shock(e.x, fx.h(e.x, e.z) + 0.4, e.z, 8, 0.35, 0xffd9a0); } break;
        case 'hack': { // Fook Mie's call: a thin beam from her phone to the unit, then a ring in the new owner's colour (recruit) or dust (resign)
          if (!(this.reveal || e.team === PLAYER || e.victim === PLAYER || fog.visAt(PLAYER, e.tx, e.tz))) break;
          const y = fx.h(e.tx, e.tz);
          if (e.team === PLAYER || fog.visAt(PLAYER, e.x, e.z) || this.reveal) fx.beam(e.x, fx.h(e.x, e.z) + 1.9, e.z, e.tx, y + 1.4, e.tz, [1, 0.45, 0.8], 0.25);
          fx.spark(e.tx, y + 1.6, e.tz, [1, 0.5, 0.85]);
          if (e.k === 'recruit') fx.shock(e.tx, y + 0.3, e.tz, 4.5, 0.6, TEAM_HEX[e.team]); else if (e.k === 'resign') fx.dust(e.tx, y, e.tz, 6, 3, 1.4, 0.4);
          break;
        }
        case 'launch': if (see(e)) { // a one-way drone leaves its container: booster flash and a cloud of smoke behind the truck
          const y = fx.h(e.x, e.z) + 2.4; fx.flash(e.x, y, e.z, 26, 0.15); const g = 0.82;
          for (let i = 0; i < 7; i++) fx.smoke.spawn(e.x, y, e.z, -Math.cos(e.a) * (2 + fx.rnd() * 5) + (fx.rnd() - 0.5) * 3, 0.5 + fx.rnd() * 1.5, -Math.sin(e.a) * (2 + fx.rnd() * 5) + (fx.rnd() - 0.5) * 3, 1.1, 1.0, 3.2, g, g, g, 0.4, 0, 1);
          fx.dust(e.x, y - 2.4, e.z, 8, 4, 1.8, 0.35);
        } break;
        case 'dodge': if (see(e)) { const v = this.views.get(e.id); if (v) v.jinkRoll = 1; const y = fx.h(e.x, e.z) + altOf(e.id); for (let i = 0; i < 3; i++) fx.spark(e.x + (fx.rnd() - 0.5) * 3, y - 0.5, e.z + (fx.rnd() - 0.5) * 3, [1, 0.9, 0.6]); } break;   // flares, and the helicopter rolls out of the way
        case 'vanish': if (see(e)) fx.dust(e.x, fx.h(e.x, e.z), e.z, e.inf ? 6 : 12, 3, e.inf ? 1.3 : 2.2, 0.4); break;
        case 'airliner': if (see(e)) { fx.megaBlast(e.x, e.z, e.r); fx.smokeColumn(e.x, e.z, 8, 2); fx.shake(e.x, e.z, 1.4); } else fx.shake(e.x, e.z, 0.3); break;
        case 'superlaunch': { // what the launching building does; shown only if you can see that building right now
          if (!(this.reveal || e.team === PLAYER || fog.visAt(PLAYER, e.bx, e.bz))) break;
          const y = fx.h(e.bx, e.bz);
          const kind = POWERS[e.id].as || e.id;   // a newer faction's superweapon looks like the one whose strike it reuses
          if (kind === 'particle') { this.skyBeams.push({ x: e.bx, y: y + 14, z: e.bz, until: this.time + POWERS[e.id].beam.ticks / 20 }); fx.flash(e.bx, y + 15, e.bz, 120, 0.5); }
          else { fx.dust(e.bx, y, e.bz, 26, 9, 3, 0.45); fx.flash(e.bx, y + 4, e.bz, kind === 'nuke' ? 160 : 70, 0.6); fx.shake(e.bx, e.bz, kind === 'nuke' ? 0.9 : 0.4); }
          break;
        }
        case 'suicide': if (see(e)) { const up = e.y !== undefined ? e.y : e.air ? 6 : 0, y = fx.h(e.x, e.z) + up; fx.explosion(e.x, y, e.z, 2.0); if (up < 2.5) fx.crater(e.x, e.z, 6); fx.shock(e.x, y + 0.4, e.z, e.r * 1.3, 0.4, 0xffd9a0); fx.shake(e.x, e.z, 0.7); } break;
        case 'touchdown': if (see(e)) { const y = fx.h(e.x, e.z) + 0.5; fx.dust(e.x, y, e.z, 8, 3, 1.2, 0.3); } break; // tyre smoke
        case 'fab': if (see(e)) fx.megaBlast(e.x, e.z, e.r); break;
        case 'nuke': if (see(e)) { fx.megaBlast(e.x, e.z, e.r); fx.megaBlast(e.x, e.z, e.r * 0.55); fx.mushroom(e.x, e.z, e.r); fx.smokeColumn(e.x, e.z, 12); fx.shake(e.x, e.z, 2.2); } else fx.shake(e.x, e.z, 0.5); break; // the ground shakes for everyone
        case 'scudhit': if (see(e)) { const y = fx.h(e.x, e.z); fx.streak(e.x - 14, y + 70, e.z - 6, e.x, y + 1, e.z); fx.explosion(e.x, y, e.z, 2.2); fx.crater(e.x, e.z, 9); if (!e.fire) fx.toxinBurst(e.x, e.z, e.r); fx.shake(e.x, e.z, 0.7); } break;
        case 'pbeam': if (see(e)) { const y = fx.h(e.x, e.z); fx.beam(e.x + 6, y + 150, e.z - 10, e.x, y + 0.2, e.z, PBEAM, 0.16); fx.spark(e.x, y + 0.5, e.z); if (e.k % 6 === 0) { fx.explosion(e.x, y, e.z, 0.8); fx.crater(e.x, e.z, 5); } if (e.k % 10 === 0) fx.shake(e.x, e.z, 0.35); } break;
        case 'paradrop': if (see(e)) fx.dust(e.x, fx.h(e.x, e.z), e.z, 22, 7, 2.2, 0.36); break;
        case 'sneak': if (see(e)) { const y = fx.h(e.x, e.z); fx.dust(e.x, y, e.z, 30, 9, 3, 0.45); fx.shock(e.x, y + 0.4, e.z, 10, 0.6, 0xd9b27a); fx.shake(e.x, e.z, 0.5); } break;
        case 'toxin': if (see(e)) fx.toxinBurst(e.x, e.z, e.r); break;
        case 'ambush': if (e.team === PLAYER) fx.dust(e.x, fx.h(e.x, e.z), e.z, 18, 6, 2.4, 0.4); break; // an enemy ambush gives no tell
        case 'cleared': if (fog.visAt(PLAYER, e.x, e.z)) { fx.dust(e.x, fx.h(e.x, e.z) + 3, e.z, 16, 8, 2.4, 0.4); fx.flash(e.x, fx.h(e.x, e.z) + 4, e.z, 30, 0.2); } break;
        case 'capture': if (e.team === PLAYER || fog.visAt(PLAYER, e.x, e.z)) fx.shock(e.x, fx.h(e.x, e.z) + 0.4, e.z, 9, 0.7, TEAM_HEX[e.team]); break;
        case 'sabotage': if (e.team === PLAYER || e.victim === PLAYER) { const y = fx.h(e.x, e.z); for (let i = 0; i < 5; i++) fx.spark(e.x + (fx.rnd() - 0.5) * 6, y + 2 + fx.rnd() * 3, e.z + (fx.rnd() - 0.5) * 6); fx.flash(e.x, y + 4, e.z, 40, 0.25); } break;
      }
    }
  }

  updateFow(dt) {
    const fog = this.sim.fog, vis = fog.vis[PLAYER], exp = fog.exp[PLAYER], cur = this.fowCur, d = this.fowData;
    // The 2 km maps have four times the cells: there the texture is refreshed in two halves on alternate passes.
    const parts = N > 512 ? 2 : 1, k = Math.min(1, dt * 7 * parts), r0 = Math.floor(N * this.fowRow / parts), r1 = Math.floor(N * (this.fowRow + 1) / parts);
    this.fowRow = (this.fowRow + 1) % parts;
    for (let i = r0 * N, n = r1 * N; i < n; i++) {
      const tgt = this.reveal || vis[i] ? 255 : 118, c = cur[i] + (tgt - cur[i]) * k;   // no black shroud: unseen ground is dimmed, never hidden (enemy units and buildings still are)
      cur[i] = c; d[i] = c;
    }
    this.fowTex.needsUpdate = true;
  }

  viewFor(e) {
    let v = this.views.get(e.id);
    if (!v) {
      const tm = e.kind === 'unit' && e.inert ? NEUTRAL : e.team;       // a unit that has resigned is drawn in neutral colours until it leaves
      v = createModel(tm === e.team ? e : { kind: e.kind, type: e.type, team: tm, variant: e.variant }); v.id = e.id; v.recoil = 0; v.dustAcc = 0; v.spinT = 0; v.alt = 0; v.team = tm;
      if (e.kind === 'bldg') { // a shipyard stands at quay height on the shore and looks out to sea
        if (BLDGS[e.type].shore) { v.g.position.set(e.x, WATER_Y + 0.9, e.z); v.g.rotation.y = -(e.face | 0) * Math.PI / 2; }
        else v.g.position.set(e.x, heightAt(this.map, e.x, e.z), e.z);
      }
      this.scene.add(v.g); this.views.set(e.id, v);
    }
    return v;
  }
  // Nuclear Missile and Scud Storm missiles. Each is drawn twice: climbing out of its launcher (if you can see the
  // launcher) and coming down on the target (if you can see the target). In between it is too high to see.
  drawMissile(p, alpha, stamp, dt) {
    const fog = this.sim.fog, fx = this.fx, nuke = p.kind === 'nuke', own = this.reveal || p.team === PLAYER;
    const el = p.T - p.t + alpha - (p.lift || 0), left = p.t - alpha, UP = nuke ? 56 : 30, DOWN = nuke ? 44 : 26, H = nuke ? 190 : 150;
    let x, y, z, pitch, hdg;
    if (el >= 0 && el < UP && (own || fog.visAt(PLAYER, p.sx, p.sz))) {
      const u = el / UP, d = (nuke ? 9 : 5) + H * u * u;                                   // straight up, off the rail or out of the silo
      x = p.sx; z = p.sz; y = fx.h(p.sx, p.sz) + d; hdg = Math.PI; pitch = Math.PI / 2;
    } else if (left < DOWN && (own || fog.visAt(PLAYER, p.x, p.z))) {
      const u = Math.max(0, left / DOWN) * H;
      x = p.x - 0.2 * u; z = p.z - 0.085 * u; y = fx.h(p.x, p.z) + u; hdg = Math.atan2(0.085, 0.2); pitch = -1.36;
    } else return;
    const m = this.prop(p.id, () => { const r = createMissile(nuke ? 'nuke' : 'scud'); r.g.userData.rig = r; return r.g; }, stamp);
    m.position.set(x, y, z); m.rotation.y = -hdg; m.userData.rig.body.rotation.z = pitch;
    const back = nuke ? 4.2 : 2.6, c = Math.cos(pitch);
    if (fx.rnd() < dt * 70) fx.exhaust(x - c * Math.cos(hdg) * back, y - Math.sin(pitch) * back, z - c * Math.sin(hdg) * back, nuke ? 2.4 : 1.1);
  }
  prop(id, make, stamp) {
    let m = this.props.get(id);
    if (!m) { m = make(); this.scene.add(m); this.props.set(id, m); }
    m.userData.stamp = stamp; return m;
  }

  ring(i, x, y, z, sx, sz, geo, mat) {
    let r = this.rings[i];
    if (!r) { r = new THREE.Mesh(this.ringGeo, this.ringMat); r.renderOrder = 6; this.scene.add(r); this.rings[i] = r; }
    r.geometry = geo; r.material = mat;
    r.position.set(x, y, z); r.scale.set(sx, 1, sz); r.visible = true;
  }

  // ui: { selection:Set, place:{type,cx,cz,ok}|null, power:{id,x,z,ok}|null }
  render(alpha, dt, rig, ui) {
    const sim = this.sim, map = this.map, fog = sim.fog, fx = this.fx, cam = this.camera;
    this.time += dt;
    rig.apply(cam);
    if (fx.trauma > 0) { cam.position.x += fx.shakeX; cam.position.y += fx.shakeY; cam.position.z += fx.shakeZ; cam.updateMatrixWorld(); } // blast shake
    fx.setListener(rig.tx, rig.tz, rig.dist);
    const env = this.env; env.frame(rig.tx, rig.tz, rig.dist); env.begin();

    if ((this.fowFrame++ & 1) === 0) this.updateFow(dt * 2);
    if (this.env.fogNear) { this.scene.fog.near = Math.max(this.env.fogNear, rig.dist * 1.15); this.scene.fog.far = Math.max(this.env.fogFar, rig.dist * 3.2); }   // pulled back on a big map: the haze starts further out
    if (this.water) { const b = this.water.userData.bump; b.offset.x += dt * 0.012; b.offset.y += dt * 0.007; }   // the sea drifts

    let ringN = 0, shownUnits = 0, hidden = 0;
    const stamp = ++this.vis, sel = ui.selection;
    for (const e of sim.ents) {
      const show = this.reveal || fog.shouldShow(PLAYER, e);
      if (!show) { if (e.team !== PLAYER && e.kind === 'unit') hidden++; const v0 = this.views.get(e.id); if (v0) { v0.g.visible = false; v0.stamp = stamp; } continue; }
      let v = this.viewFor(e);
      if (e.kind === 'unit' && v.team !== (e.inert ? NEUTRAL : e.team)) { this.scene.remove(v.g); this.views.delete(e.id); v = this.viewFor(e); }   // recruited or resigned: rebuild in the new colours
      v.stamp = stamp; v.g.visible = true;
      if (e.kind === 'unit') {
        shownUnits++;
        const d = UNITS[e.type];
        const x = e.px + (e.x - e.px) * alpha, z = e.pz + (e.z - e.pz) * alpha;
        const f = e.pfacing + angDiff(e.facing, e.pfacing) * alpha, gy = heightAt(map, x, z);
        const c = Math.cos(f), s = Math.sin(f);
        let y = map.hasWater && !e.air ? Math.max(gy, WATER_Y - (e.cls === 0 ? 1.0 : 0.6)) : gy;   // amphibious units ride in the water, not on the river bed
        if (e.air) {
          // height comes from the simulation (take-off roll, climb, glide slope): wheels on the tarmac at 0, cruise at 1
          const ak = e.paltK + (e.altK - e.paltK) * alpha, g0 = v.ground || 1.1; v.alt = g0 + (d.alt - g0) * ak; y = gy + v.alt;
          if (v.gear) v.gear.visible = ak < 0.4;                                                 // gear retracts on the way up
          v.body.rotation.x = ak > 0.03 ? Math.max(-0.5, Math.min(0.5, angDiff(e.facing, e.pfacing) * 9)) : 0;
          v.body.rotation.z = d.based ? (e.altK > e.paltK ? 0.26 : e.altK < e.paltK ? 0.09 : 0) * Math.min(1, ak * 6 + 0.25) : e.landed ? 0 : -Math.min(0.16, e.spd * 0.008); // nose up to climb, flare to land
          if (v.rotor) v.rotor.rotation.y += dt * (e.landed ? (e.as === 'spool' ? 3 + e.reloadT * 0.9 : 3) : 30);                    // rotors spool up on the helipad
          if (v.rotorTail) v.rotorTail.rotation.z += dt * 55;
          if (v.rotor2) v.rotor2.rotation.y -= dt * (e.landed ? (e.as === 'spool' ? 3 + e.reloadT * 0.9 : 3) : 30);                  // tandem rotors turn opposite ways
          if (v.prop) v.prop.rotation.x += dt * 60;
          if (v.props) for (const pr of v.props) pr.rotation.x += dt * (e.landed && e.as !== 'spool' ? 6 : 45);                  // AC-130: four propellers, idling on the ground
          if (d.jink || v.jinkRoll) { // a gunship that jinks leans into each sidestep; a dodge is a sharp roll
            const lat = (-(e.x - e.px) * s + (e.z - e.pz) * c) * 20, want = e.landed ? 0 : Math.max(-0.45, Math.min(0.45, lat * 0.05));
            v.lean = (v.lean || 0) + (want - (v.lean || 0)) * Math.min(1, dt * 6); v.jinkRoll = Math.max(0, (v.jinkRoll || 0) - dt * 2.2);
            v.body.rotation.x += v.lean + Math.sin(v.jinkRoll * Math.PI) * 0.7;
          }
          if (e.dive) v.body.rotation.z = -Math.min(1.0, e.dive * 0.2);                                  // FPV drone tips its nose at the target
          if (ak > 0.5 && d.based && fx.rnd() < dt * 40) { const g = 0.85; fx.smoke.spawn(x - c * 3, y, z - s * 3, 0, 0, 0, 0.5, 0.6, 1.4, g, g, g, 0.25, 0, 0.5); }
        } else if (d.ship) { // afloat: level on the water, with a slow roll and pitch; a bow wave and wake when under way
          const ph = this.time * 1.1 + e.id * 1.7, k = d.warship ? 0.5 : 1;
          y = WATER_Y + Math.sin(ph) * 0.05 * k; v.body.rotation.x = Math.sin(ph * 0.83) * 0.035 * k; v.body.rotation.z = Math.sin(ph * 0.61 + 1) * 0.014 * k + Math.min(0.05, e.spd * 0.0022) * (d.warship ? 0.4 : 1);
          if (e.spd > 1.5) { v.dustAcc += dt * e.spd * 0.5; while (v.dustAcc > 1) { v.dustAcc -= 1; const side = fx.rnd() < 0.5 ? -1 : 1; fx.wake(x - c * e.radius * (0.4 + fx.rnd()) - s * side * e.radius * 0.3, z - s * e.radius * (0.4 + fx.rnd()) + c * side * e.radius * 0.3, 0.6 + e.radius * 0.28); } }
          if (v.hold) v.hold.visible = !!(e.garrison && e.garrison.length);
        } else {
          const L = e.radius * 0.9;
          v.body.rotation.z = Math.atan2(heightAt(map, x + c * L, z + s * L) - heightAt(map, x - c * L, z - s * L), 2 * L);
          v.body.rotation.x = -Math.atan2(heightAt(map, x - s * L, z + c * L) - heightAt(map, x + s * L, z - c * L), 2 * L);
        }
        v.g.position.set(x, y, z); v.g.rotation.y = -f;
        if (!d.infantry) {
          if (e.hp < e.maxHp * 0.4) fx.damage(x, y, z, dt, e.hp / e.maxHp);   // trailing engine smoke and sparks
          if (!e.air) env.headlight(x, y, z, f, e.radius);                    // no-op except at night
        }
        if (v.turret) {
          const tf = e.pturret + angDiff(e.turret, e.pturret) * alpha;
          v.turret.rotation.y = -(tf - f);
          if (v.recoil > 0) { v.recoil = Math.max(0, v.recoil - dt * 5); if (!v.noRecoil) v.turret.position.x = v.turretX - v.recoil * 0.28; }
        }
        if (v.men) {
          const n = v.men.length, alive = Math.max(1, Math.ceil(n * e.hp / e.maxHp)); for (let i = 0; i < n; i++) v.men[i].visible = i < alive;
          // walking: legs swing from the hip, alternate legs half a stride apart, each man slightly out of step with the next; the swing dies away when the squad stops
          const walking = e.spd > 0.5 && !e.inB; if (walking) v.spinT += dt * (5.5 + e.spd * 0.9);
          v.stride = (v.stride || 0) + ((walking ? 0.6 : 0) - (v.stride || 0)) * Math.min(1, dt * 9);
          if (v.legs && (v.stride > 0.005 || v.strode)) { const per = v.legs.length / n; for (let i = 0; i < v.legs.length; i++) v.legs[i].rotation.z = Math.sin(v.spinT + ((i / per) | 0) * 1.3 + (i & 1) * Math.PI) * v.stride; v.strode = v.stride > 0.005; }
          if (walking || v.bobbed) { for (let i = 0; i < n; i++) v.men[i].position.y = walking ? Math.abs(Math.cos(v.spinT + i * 1.3)) * 0.035 : 0; v.bobbed = walking; }
        }
        if (v.cargo) v.cargo.visible = e.cargo > 0;
        if (v.blade) v.blade.position.y = 0.55 + (e.working ? Math.sin(this.time * 12) * 0.18 : 0);
        if (v.addons) { v.addons.gatling.visible = e.addon === 'gatling'; v.addons.bunker.visible = e.addon === 'bunker'; }
        if (v.tiers) for (let i = 0; i < 3; i++) v.tiers[i].visible = i === e.tier;
        if (v.stores) for (let i = 0; i < v.stores.length; i++) v.stores[i].visible = i < e.ammo;      // missiles and bombs come off the aircraft as they are fired
        if (v.longbow) v.longbow.visible = !!e.up;                                                     // Apache: the radar dome appears with the Longbow upgrade
        if (v.doors) { // Shahed Launcher: the container doors swing open while it sets up and fires, and close during the reload; the rack empties drone by drone
          const W = WEAPONS[d.weapon], cd = e.cds[0], firing = e.bursts[0] > 0 || cd > W.cd - 50, want = e.windup > 0 ? Math.min(1, e.windup / (W.windup * 0.7)) : firing ? 1 : 0;
          v.open = (v.open || 0) + (want - (v.open || 0)) * Math.min(1, dt * 4);
          for (let i = 0; i < 2; i++) v.doors[i].rotation.y = (i ? 1 : -1) * v.open * 1.95;
          const left = cd <= 0 || e.windup > 0 ? W.burst : e.bursts[0] > 0 ? e.bursts[0] : cd < W.cd * 0.45 ? W.burst : 0;
          for (let i = 0; i < v.rack.length; i++) v.rack[i].visible = i < left;   // rack[0] is the bottom tier: the top drone goes first
        }
        if (v.arm) { // Scud Launcher: the erector lifts the missile upright before a launch, drops afterwards, and a new missile slides on during the reload
          const W = WEAPONS[d.weapon], cd = e.cds[0], up = Math.max(e.windup / W.windup, cd > W.cd - 30 ? (cd - (W.cd - 30)) / 30 : 0), k = up * up * (3 - 2 * up);
          v.arm.rotation.z = 0.12 + 1.3 * k;
          const back = Math.max(0, Math.min(1, (cd - W.cd * 0.3) / (W.cd * 0.25)));                    // 1 = not loaded yet, 0 = fully on the cradle
          v.round.visible = cd < W.cd * 0.55; v.round.position.x = -3.4 * back;
        }
        // tread / wheel dust
        if (!e.air && e.cls === 1 && !d.ship && e.spd > 1.5 && !fx.wet(x, z)) {
          v.dustAcc += dt * e.spd * 1.15;
          while (v.dustAcc > 1) { v.dustAcc -= 1; const side = fx.rnd() < 0.5 ? -1 : 1; fx.dust(x - c * e.radius * 0.8 - s * side * 0.8, y, z - s * e.radius * 0.8 + c * side * 0.8, 1, 1.2, 1.15, 0.3); }
        } else if (e.working && fx.rnd() < dt * 14) {
          fx.fire.spawn(x + c * 2.2, y + 0.6, z + s * 2.2, (fx.rnd() - 0.5) * 6, 3 + fx.rnd() * 4, (fx.rnd() - 0.5) * 6, 0.4, 0.35, 0, 1, 0.8, 0.4, 1, 18, 0.5);
          if (fx.rnd() < 0.4) fx.dust(x + c * 2.4, y, z + s * 2.4, 1, 2, 1.3, 0.25);
        }
        if (sel.has(e.id)) this.ring(ringN++, x, Math.max(gy, map.hasWater ? WATER_Y : -1e9) + 0.18, z, e.radius * 1.25, e.radius * 1.25, this.ringGeo, e.team !== PLAYER ? this.ringMatE : this.ringMat);
      } else {
        const d = BLDGS[e.type];
        v.g.scale.y = e.done ? 1 : 0.1 + 0.9 * e.progress;
        if (v.turret) { const tf = e.pturret + angDiff(e.turret, e.pturret) * alpha; v.turret.rotation.y = -tf; }
        if (d.weapon && e.done && !sim.teams[e.team]?.low) env.searchlight(e.x, v.g.position.y + 5.5, e.z, this.time * 0.45 + e.id * 1.7 + Math.sin(this.time * 0.31 + e.id) * 0.8);
        if (v.spin && !e.offline) v.spin.rotation.y += dt * 1.2;
        if (d.superPower && e.done && (v.missile || v.missiles)) { // superweapon reload you can watch: 0 = ready, 1 = just fired
          const left = e.superCd ? Math.max(0, Math.min(1, (e.superReady - sim.tick) / e.superCd)) : 0;
          if (v.missile) { v.missile.visible = left < 0.6; v.missile.position.y = -11 * Math.min(1, left / 0.6); }               // the next missile rises out of the shaft as the countdown runs down
          else { const n = Math.min(9, Math.floor(9 * (1 - left) / 0.92 + 1e-6)); for (let i = 0; i < 9; i++) v.missiles[i].visible = i < n || sim.tick < e.superShot + i * SCUD_GAP; }   // rails empty one by one at launch, then a missile is raised onto each in turn; all nine stand ready a little before the countdown ends
        }
        if (v.pump) v.pump.rotation.z = Math.sin(this.time * 2.2) * 0.3;
        if (v.crates) { const n = e.maxSupplies ? Math.ceil(v.crates.length * e.supplies / e.maxSupplies) : 0; if (n !== v.nCrates) { v.nCrates = n; for (let i = 0; i < v.crates.length; i++) v.crates[i].visible = i >= v.crates.length - n; } }
        if (v.rub && e.ruined !== v.wasRuined) { v.wasRuined = e.ruined; v.main.visible = !e.ruined; v.rub.visible = e.ruined; }
        if (v.flags) { // owner flag on civilian buildings and derricks, only if we can actually see who holds it
          const owned = e.type === 'civ' ? e.garrison.length > 0 : e.team < 2;
          const occ = owned && (e.team === PLAYER || fog.canSee(PLAYER, e)) ? e.team : -1;
          v.flags[0].visible = occ === 0; v.flags[1].visible = occ === 1;
        }
        if (v.flag) v.flag.rotation.y = Math.sin(this.time * 3) * 0.25;
        if (e.offline && fx.rnd() < dt * 5) fx.spark(e.x + (fx.rnd() - 0.5) * e.w, v.g.position.y + 2 + fx.rnd() * 3, e.z + (fx.rnd() - 0.5) * e.h);
        if (!e.done && e.team === PLAYER && fx.rnd() < dt * 3) fx.dust(e.x + (fx.rnd() - 0.5) * e.w * CELL, v.g.position.y, e.z + (fx.rnd() - 0.5) * e.h * CELL, 1, 2, 2, 0.2);
        if (e.done && d.cost && e.hp < e.maxHp * 0.5 && fx.rnd() < dt * 5) { const g = 0.15 + fx.rnd() * 0.1; fx.smoke.spawn(e.x + (fx.rnd() - 0.5) * e.w, v.g.position.y + 3, e.z + (fx.rnd() - 0.5) * e.h, 0.8, 3 + fx.rnd() * 2, 0.3, 2 + fx.rnd(), 2, 5, g, g, g, 0.5, -0.5, 0.5); }
        if (sel.has(e.id)) this.ring(ringN++, e.x, v.g.position.y + 0.25, e.z, e.w * CELL * 0.74, e.h * CELL * 0.74, this.sqGeo, e.team !== PLAYER && e.team !== NEUTRAL ? this.ringMatE : this.ringMat);
      }
    }
    // drop views whose entity is gone
    for (const [id, v] of this.views) if (v.stamp !== stamp) { this.scene.remove(v.g); this.views.delete(id); }
    this.shown.units = shownUnits; this.shown.hiddenEnemies = hidden;

    // salvage crates (only inside the player's vision)
    for (const c of sim.crates) {
      if (!fog.visAt(PLAYER, c.x, c.z)) continue;
      const m = this.prop(c.id, buildCrate, stamp);
      m.position.set(c.x, fx.h(c.x, c.z) + 0.15 + Math.sin(this.time * 3 + c.id) * 0.12, c.z); m.rotation.y = this.time * 0.9 + c.id;
    }
    // off-map strikes: enemy aircraft and shells are drawn only where the player has vision
    for (const p of sim.strikes) {
      if (p.kind === 'nuke' || p.kind === 'scud') { this.drawMissile(p, alpha, stamp, dt); continue; }
      if (!this.reveal && !strikeVisible(sim, PLAYER, p)) continue;
      const x = p.px + (p.x - p.px) * alpha, z = p.pz + (p.z - p.pz) * alpha;
      if (p.kind === 'plane') {
        const m = this.prop(p.id, () => { const r = createPlane(p.model, sim.teams[p.team].faction, p.team); r.g.userData.rig = r; return r.g; }, stamp);
        // the sim gives the dive profile (height above the aim point); the nose follows the flight path
        const gy = fx.h(p.tx, p.tz), py = p.py || p.y, y = gy + py + (p.y - py) * alpha, rig = m.userData.rig;
        m.position.set(x, y, z); m.rotation.y = -p.a; rig.body.rotation.z = Math.atan2(p.y - py, 4.4);
        if (rig.props) for (const pr of rig.props) pr.rotation.x += dt * 45;
        if (fx.rnd() < dt * 60) { const g = 0.9; for (const k of [-1, 1]) fx.smoke.spawn(x - p.dx * 5 - p.dz * k, y + 0.9, z - p.dz * 5 + p.dx * k, 0, 0, 0, 0.6, 0.8, 2.0, g, g, g, 0.22, 0, 0.3); }
      } else if (p.kind === 'airliner') { // The Phantom's hijacked jet: a shallow dive onto the target, trailing smoke
        const m = this.prop(p.id, () => { const r = createPlane('b737', sim.teams[p.team].faction, p.team); r.g.userData.rig = r; return r.g; }, stamp);
        const y = fx.h(p.tx, p.tz) + p.py + (p.y - p.py) * alpha;
        m.position.set(x, y, z); m.rotation.y = -p.a; m.userData.rig.body.rotation.z = Math.atan2(p.y - p.py, HERO_CALL.airliner.speed);
        if (fx.rnd() < dt * 50) { const g = 0.25 + fx.rnd() * 0.15; fx.smoke.spawn(x - Math.cos(p.a) * 6, y + 0.3, z - Math.sin(p.a) * 6, 0, 0.5, 0, 1.6, 1.6, 4, g, g, g, 0.5, -0.1, 0.6); }
      } else if (p.kind === 'para') { // five troopers come down under canopies onto the spots where their squads will form up
        const n = (POWERS[p.pid] || POWERS.paradrop).n, up = Math.max(0, p.t - alpha) * 0.55;
        for (let i = 0; i < n; i++) {
          const a = i * 2.399963, cx = p.x + Math.cos(a) * (2 + i * 1.2), cz = p.z + Math.sin(a) * (2 + i * 1.2), m = this.prop(p.id + ':' + i, () => createChute().g, stamp);
          m.position.set(cx + Math.sin(this.time * 1.3 + i) * 0.5, fx.h(cx, cz) + up * (1 + i * 0.04), cz); m.rotation.z = Math.sin(this.time * 1.7 + i * 2) * 0.12; m.rotation.y = i * 1.3;
        }
      } else if (p.kind === 'shell') {
        if (p.t > 16) continue;
        const y = fx.h(p.x, p.z) + (p.t - alpha) * 5.5;
        fx.fire.spawn(p.x, y, p.z, 0, -30, 0, 0.07, 2.4, 0, 1, 0.8, 0.45, 1, 0, 0); fx.fire.spawn(p.x, y + 2.5, p.z, 0, -30, 0, 0.09, 1.4, 0, 1, 0.6, 0.2, 0.8, 0, 0);
      } else if (p.kind === 'bomb') {
        const m = this.prop(p.id, buildBomb, stamp); m.position.set(p.x, fx.h(p.x, p.z) + (p.t - alpha) * 2.8, p.z); m.rotation.z = Math.PI;
      }
    }
    // Particle Cannon: the building itself fires a beam straight up for as long as the orbital beam burns
    if (this.skyBeams.length) {
      for (const b of this.skyBeams) if (fx.rnd() < dt * 30) {
        fx.beam(b.x, b.y, b.z, b.x, b.y + 320, b.z, PBEAM, 0.14); fx.spark(b.x, b.y + 1, b.z);
        fx.fire.spawn(b.x, b.y + 0.5, b.z, 0, 0, 0, 0.14, 6, 0, PBEAM[0], PBEAM[1], PBEAM[2], 0.9, 0, 0);                                   // glow at the emitter
        for (let i = 0; i < 10; i++) fx.fire.spawn(b.x, b.y + 4 + i * 9 + fx.rnd() * 6, b.z, 0, 40, 0, 0.16, 2.0, 0, PBEAM[0], PBEAM[1], PBEAM[2], 0.85, 0, 0);   // a thick column for the first 100 m
      }
      if (this.skyBeams[0].until < this.time) this.skyBeams = this.skyBeams.filter(b => b.until >= this.time);
    }
    // lingering hazards
    for (const h of sim.hazards) if (h.team === PLAYER || fog.visAt(PLAYER, h.x, h.z)) fx.hazard(h.kind, h.x, h.z, h.r, dt);

    // projectiles (only where the player can see)
    for (const p of sim.projs) {
      const x = p.px + (p.x - p.px) * alpha, z = p.pz + (p.z - p.pz) * alpha;
      if (!fog.visAt(PLAYER, x, z)) continue;
      const tot = Math.hypot(p.tx - p.sx, p.tz - p.sz) || 1, u = Math.min(1, Math.hypot(x - p.sx, z - p.sz) / tot);
      const W = WEAPONS[p.w], big = p.w === 'scud_missile';
      const arc = W.arc || (p.kind === 'lob' ? 10 : p.kind === 'shell' ? 0.4 : p.kind === 'rocket' ? 2.2 : 5);
      const y0 = fx.h(p.sx, p.sz) + (p.sAir ? p.sy0 ?? AIR_Y : big ? 6 : p.sy0 ?? 1.7), y1 = fx.h(p.tx, p.tz) + (p.tAir ? (this.views.get(p.tid) || {}).alt || AIR_Y : 1.0), y = y0 * (1 - u) + y1 * u + Math.sin(u * Math.PI) * arc;
      if (big) { // a Scud Launcher's missile is a real missile: it climbs off the erector, arcs over and comes down nose first
        const m = this.prop(p.id, () => { const r = createMissile('scud'); r.g.userData.rig = r; return r.g; }, stamp), pitch = Math.atan2(y1 - y0 + Math.cos(u * Math.PI) * Math.PI * arc, tot);
        m.position.set(x, y, z); m.rotation.y = -p.a; m.userData.rig.body.rotation.z = pitch;
        if (fx.rnd() < dt * 70) fx.exhaust(x - Math.cos(pitch) * Math.cos(p.a) * 2.6, y - Math.sin(pitch) * 2.6, z - Math.cos(pitch) * Math.sin(p.a) * 2.6, 1.1);
        continue;
      }
      fx.trail(p.kind, x, y, z, p.a, p.w);
    }
    for (const [id, m] of this.props) if (m.userData.stamp !== stamp) { this.scene.remove(m); this.props.delete(id); }   // props whose crate, aircraft or missile is gone

    // support-power reticle
    const pw = ui.power;
    if (pw && pw.x !== undefined) {
      const R = POWERS[pw.id].radius, y = fx.h(pw.x, pw.z) + 0.4, mat = pw.ok ? this.ringMatP : this.ringMatE, pulse = 1 + Math.sin(this.time * 6) * 0.03;
      this.ring(ringN++, pw.x, y, pw.z, R * pulse, R * pulse, this.thinGeo, mat);
      this.ring(ringN++, pw.x, y, pw.z, R * 0.45, R * 0.45, this.thinGeo, mat);
      this.ring(ringN++, pw.x, y, pw.z, 1.2, 1.2, this.ringGeo, mat);
    }
    for (let i = ringN; i < this.rings.length; i++) this.rings[i].visible = false;

    // placement ghost
    const g = this.ghost, pl = ui.place;
    if (pl && pl.type) {
      const d = BLDGS[pl.type], gx = (pl.cx + d.w / 2) * CELL, gz = (pl.cz + d.h / 2) * CELL;
      g.visible = true; g.scale.set(d.w * CELL, 3.2, d.h * CELL); g.position.set(gx, heightAt(map, gx, gz) + 1.7, gz);
      g.material.color.setHex(pl.ok ? 0x55ff88 : 0xff4d40);
    } else g.visible = false;

    env.end();
    // King of the Hill: a pulsing ring on the ground marks the hill for everyone (its position is public)
    if (sim.koth && dt > 0) { this.hillT = (this.hillT || 0) - dt; if (this.hillT <= 0) { this.hillT = 1.4; const k = sim.koth; fx.shock(k.x, fx.h(k.x, k.z) + 0.35, k.z, k.r, 1.4, k.owner === PLAYER ? 0x7dffa0 : k.owner === 1 ? 0xff5a4d : 0xf2a93b); } }
    fx.update(dt);
    this.renderer.render(this.scene, cam);
  }

  // World -> screen (CSS px). Returns false when behind the camera.
  project(x, y, z, out) {
    const v = this._v.set(x, y, z).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.w; out.y = (-v.y * 0.5 + 0.5) * this.h;
    return v.z < 1 && v.z > -1;
  }
}
