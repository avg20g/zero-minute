// Team colours. Six choices; the lobby assigns one to each side. Cosmetic only: the simulation never
// reads this, so colours cannot change a match or a replay's outcome.
//   paint  matte colour for recognition panels and building trim (lit by the scene)
//   light  brighter version for unlit things: selection rings, capture pulses
//   css    the same bright colour for the minimap and HUD
export const PALETTE = [
  { id: 'blue', name: 'Blue', paint: 0x2f6fc4, light: 0x4aa3ff, css: '#4aa3ff' },
  { id: 'red', name: 'Red', paint: 0xb8382c, light: 0xff5a4d, css: '#ff5a4d' },
  { id: 'green', name: 'Green', paint: 0x3a8f47, light: 0x5fd16f, css: '#5fd16f' },
  { id: 'gold', name: 'Gold', paint: 0xc9941a, light: 0xf2c230, css: '#f2c230' },
  { id: 'purple', name: 'Purple', paint: 0x7a48c2, light: 0xb07cff, css: '#b07cff' },
  { id: 'teal', name: 'Teal', paint: 0x1f9a96, light: 0x3fd0c9, css: '#3fd0c9' },
];
const byId = (id) => PALETTE.find(p => p.id === id);
// Index 0 = you, 1 = enemy, 2 = neutral. Arrays are mutated in place so every importer sees the choice.
export const TEAM = { ids: ['blue', 'red'], paint: [0x2f6fc4, 0xb8382c, 0x9a9a9a], light: [0x4aa3ff, 0xff5a4d, 0xcfc7b8], css: ['#4aa3ff', '#ff5a4d', '#cfc7b8'] };
// The two sides never share a colour: if they would, the enemy takes the first other one.
export function resolveColors(mine, foe) {
  const a = byId(mine) ? mine : 'blue'; let b = byId(foe) ? foe : 'red';
  if (b === a) b = a === 'red' ? 'blue' : 'red';
  return [a, b];
}
export function setTeamColors(mine, foe) {
  const ids = resolveColors(mine, foe);
  ids.forEach((id, i) => { const p = byId(id); TEAM.ids[i] = id; TEAM.paint[i] = p.paint; TEAM.light[i] = p.light; TEAM.css[i] = p.css; });
  return ids;
}
