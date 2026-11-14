// Engine constants. Game content (units, buildings, weapons, factions) lives
// in factionRegistry.js and is re-exported here for convenience.
export { UNITS, BLDGS, WEAPONS, FACTIONS, UPGRADES, POWERS } from './factionRegistry.js';

export const TICK_HZ = 20;
export const DT = 1 / TICK_HZ;
export const N = 256;          // map is N x N cells
export const CELL = 2;         // metres per cell
export const WORLD = N * CELL; // 512 m square
export const PLAYER = 0, ENEMY = 1, NEUTRAL = 2;
export const MESA_H = 10;

// Directional armor: multiplier on incoming damage by hit zone.
export const ZONE_MULT = [1.0, 1.25, 1.5]; // front, side, rear
export const ZONE_NAME = ['FRONT', 'SIDE', 'REAR'];
export const LOAD_TICKS = 50, UNLOAD_TICKS = 25;
export const GARRISON_RANGE_BONUS = 8;

export function angDiff(a, b) { // shortest signed a - b
  let d = (a - b) % 6.283185307179586;
  if (d > Math.PI) d -= 6.283185307179586; else if (d < -Math.PI) d += 6.283185307179586;
  return d;
}
