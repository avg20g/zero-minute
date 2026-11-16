// Engine constants. Game content (units, buildings, weapons, factions) lives
// in factionRegistry.js and is re-exported here for convenience.
export { UNITS, BLDGS, WEAPONS, FACTIONS, UPGRADES, POWERS } from './factionRegistry.js';

export const TICK_HZ = 20;
export const DT = 1 / TICK_HZ;
export const CELL = 2;         // metres per cell
// The map is N x N cells. The size belongs to the map (256 = the small test maps, 512 = 1 km, 1024 = 2 km), so N and
// WORLD are live values: generateMap() sets them from the map spec and Sim.step() re-asserts them for its own map.
export let N = 256;
export let WORLD = N * CELL;   // metres per side
export const MAP_SIZES = [256, 512, 1024];
export function setMapSize(cells) { N = MAP_SIZES.includes(cells) ? cells : 256; WORLD = N * CELL; }
export const PLAYER = 0, ENEMY = 1, NEUTRAL = 2;
export const MESA_H = 10;
export const ROAD_SPEED = 1.25;   // ground vehicles on a road or a bridge deck
export const SWIM_SPEED = 0.6;    // amphibious units while they are in the water

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
