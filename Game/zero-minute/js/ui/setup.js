// Pre-match faction selector. Pure DOM + registry data; no Three.js needed,
// so it can show while the 3D library is still loading.
import { FACTIONS, FACTION_IDS, UNITS, BLDGS, POWERS, GENERALS, generalsOf } from '../sim/factionRegistry.js';
import { DIFFICULTY } from '../sim/aiController.js';
import { OPEN_MAP, FOREST_MAP } from '../sim/map.js';
import { openMapBuilder, loadSavedMap } from './mapBuilder.js';
import { PALETTE, resolveColors } from './teamColors.js';

// Lobby option tables. Lighting ids match PRESETS in render/environmentFX.js (kept as plain data here so the lobby needs no Three.js).
export const LIGHTING = [['noon', 'Harsh Noon', 'High sun, hard shadows'], ['dusk', 'Golden Hour Dusk', 'Low orange sun, long shadows'], ['night', 'Night Ops', 'Moonlight, headlights, searchlights']];
export const FUNDS = [5000, 10000, 25000];
export const TREATY_SECONDS = 300;

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function roster(f) { // signature units and tech, straight from the registry
  const names = [];
  for (const b of f.build) for (const u of BLDGS[b].trains || []) { const d = UNITS[u]; if (!d.builder && !d.harvester && u !== f.roles.squad) names.push(d.name); }
  const tech = f.build.filter(b => BLDGS[b].income || BLDGS[b].tunnel).map(b => BLDGS[b].name);
  return { units: names, tech, powers: f.tree.filter(n => n.power).map(n => POWERS[n.power].name) };
}

export function showSetup(onStart) {
  const root = document.getElementById('setup'), cards = document.getElementById('setup-factions'), foes = document.getElementById('setup-foes'), tiers = document.getElementById('setup-levels');
  let mine = 'vanguard', foe = 'random', level = 'medium', light = 'noon', funds = 10000, treaty = false, noSuper = false, koth = false, mapId = 'canyon', custom = loadSavedMap(), colYou = 'blue', colFoe = 'red', gen = {};   // gen: the general picked for each faction
  try { const s = JSON.parse(localStorage.getItem('cz-setup') || 'null'); if (s && FACTIONS[s.mine]) { mine = s.mine; if (s.foe === 'random' || FACTIONS[s.foe]) foe = s.foe; if (DIFFICULTY[s.level] || s.level === 'none') level = s.level; if (s.map === 'open' || s.map === 'forest' || (s.map === 'custom' && custom)) mapId = s.map; if (s.gen) gen = s.gen; if (s.colors) [colYou, colFoe] = resolveColors(s.colors[0], s.colors[1]); if (LIGHTING.some(l => l[0] === s.light)) light = s.light; if (FUNDS.includes(s.funds)) funds = s.funds; treaty = !!s.treaty; noSuper = !!s.noSuper; koth = !!s.koth; } } catch (e) { /* storage unavailable */ }
  cards.innerHTML = FACTION_IDS.map(id => {
    const f = FACTIONS[id], r = roster(f), hex = '#' + f.hull.toString(16).padStart(6, '0');
    return `<label class="fcard"><input type="radio" name="faction" id="fac-${id}" value="${id}"><span class="fbody"><i class="swatch" style="background:${hex}"></i>
      <b class="fname">${esc(f.name)}</b><span class="fdoc">${esc(f.doctrine)}</span><span class="fblurb">${esc(f.blurb)}</span>
      <span class="flist"><em>Units</em>${esc(r.units.join(', '))}</span><span class="flist"><em>Tech</em>${esc(r.tech.join(', ') || 'Power grid, upgrades')}</span><span class="flist"><em>Powers</em>${esc(r.powers.join(', '))}</span></span></label>`;
  }).join('');
  foes.innerHTML = [['random', 'Random'], ...FACTION_IDS.map(id => [id, FACTIONS[id].name])].map(([id, n]) => `<label class="fchip"><input type="radio" name="foe" id="foe-${id}" value="${id}"><span>${esc(n)}</span></label>`).join('');
  // difficulty tiers are behavioural caps only: every tier plays by the same rules with the same money
  tiers.innerHTML = Object.entries(DIFFICULTY).map(([id, d]) => `<label class="fchip lvl"><input type="radio" name="level" id="lvl-${id}" value="${id}"><span><b>${esc(d.label)}</b><small>${d.apm} actions/min · reacts in ${d.react / 20} s</small></span></label>`).join('')
    + `<label class="fchip lvl"><input type="radio" name="level" id="lvl-none" value="none"><span><b>No enemy</b><small>Sandbox: no AI and no enemy base</small></span></label>`;
  const mapNote = document.getElementById('setup-map-note');
  const drawMaps = () => {
    document.getElementById('setup-map').innerHTML = [['canyon', 'Desert Canyon', 'Ridges, ramps and a walled base'], ['open', 'Open Desert', 'No rock: wide open ground'], ['forest', 'Forest River', 'Woods, a river and three bridges'], ['custom', 'Custom map', custom ? 'Your saved map' : 'Not built yet']].map(([id, n, d]) => `<label class="fchip lvl"><input type="radio" name="map" id="map-${id}" value="${id}"${id === mapId ? ' checked' : ''}${id === 'custom' && !custom ? ' disabled' : ''}><span><b>${esc(n)}</b><small>${esc(d)}</small></span></label>`).join('') + '<button type="button" class="tbtn sm" id="setup-mapbuild">Open map builder</button>';
    mapNote.textContent = mapId === 'custom' ? 'Playing your custom map.' : '';
  };
  drawMaps();
  const drawColors = () => { // six swatches per side; the enemy cannot take your colour
    [colYou, colFoe] = resolveColors(colYou, colFoe);
    const row = (name, cur, off) => PALETTE.map(p => `<label class="fchip sw"><input type="radio" name="${name}" value="${p.id}"${p.id === cur ? ' checked' : ''}${p.id === off ? ' disabled' : ''}><span><i style="background:${p.css}"></i>${p.name}</span></label>`).join('');
    document.getElementById('setup-color-you').innerHTML = row('col-you', colYou, null); document.getElementById('setup-color-foe').innerHTML = row('col-foe', colFoe, colYou);
  };
  drawColors();
  const myGen = () => (GENERALS[gen[mine]] && GENERALS[gen[mine]].faction === mine) ? gen[mine] : generalsOf(mine)[0];
  const drawGenerals = () => { // the two generals of the faction you picked
    const cur = myGen(); document.getElementById('setup-general').innerHTML = generalsOf(mine).map(id => { const G = GENERALS[id]; return `<label class="fchip lvl"><input type="radio" name="general" value="${id}"${id === cur ? ' checked' : ''}><span><b>${esc(G.name)}</b><small>${esc(G.title)}: ${esc(G.desc)}</small></span></label>`; }).join('');
  };
  drawGenerals();
  root.addEventListener('click', (e) => { if (e.target.id !== 'setup-mapbuild') return; root.hidden = true; openMapBuilder(custom || (mapId === 'open' ? OPEN_MAP : mapId === 'forest' ? FOREST_MAP : null), (spec) => { root.hidden = false; if (spec) { custom = spec; mapId = 'custom'; } drawMaps(); }); });
  document.getElementById('setup-light').innerHTML = LIGHTING.map(([id, n, d]) => `<label class="fchip lvl"><input type="radio" name="light" id="light-${id}" value="${id}"><span><b>${esc(n)}</b><small>${esc(d)}</small></span></label>`).join('');
  document.getElementById('setup-funds').innerHTML = FUNDS.map(v => `<label class="fchip"><input type="radio" name="funds" id="funds-${v}" value="${v}"><span>$${v.toLocaleString('en-US')}</span></label>`).join('');
  const tbox = document.getElementById('setup-treaty'), nbox = document.getElementById('setup-nosuper'), kbox = document.getElementById('setup-koth');
  const sync = () => { for (const i of root.querySelectorAll('input[name="light"]')) i.checked = i.value === light; for (const i of root.querySelectorAll('input[name="funds"]')) i.checked = +i.value === funds; tbox.checked = treaty; nbox.checked = noSuper; kbox.checked = koth; for (const i of root.querySelectorAll('input[name="faction"]')) i.checked = i.value === mine; for (const i of root.querySelectorAll('input[name="foe"]')) i.checked = i.value === foe; for (const i of root.querySelectorAll('input[name="level"]')) i.checked = i.value === level; };
  sync();
  root.addEventListener('change', (e) => { if (e.target.name === 'faction') { mine = e.target.value; drawGenerals(); } else if (e.target.name === 'general') gen[mine] = e.target.value; else if (e.target.name === 'foe') foe = e.target.value; else if (e.target.name === 'level') level = e.target.value; else if (e.target.name === 'col-you') { colYou = e.target.value; drawColors(); } else if (e.target.name === 'col-foe') { colFoe = e.target.value; drawColors(); } else if (e.target.name === 'map') { mapId = e.target.value; mapNote.textContent = mapId === 'custom' ? 'Playing your custom map.' : ''; } else if (e.target.name === 'light') light = e.target.value; else if (e.target.name === 'funds') funds = +e.target.value; else if (e.target === tbox) treaty = tbox.checked; else if (e.target === nbox) noSuper = nbox.checked; else if (e.target === kbox) koth = kbox.checked; });
  root.hidden = false;
  const go = (a, b, lv = level, o = {}) => {
    const opt = { lighting: o.lighting || light, money: o.money || funds, treaty: (o.treaty ?? treaty) ? TREATY_SECONDS : 0, noSuper: !!(o.noSuper ?? noSuper), koth: !!(o.koth ?? koth), noEnemy: !!(o.noEnemy ?? lv === 'none'), colors: resolveColors(...(o.colors || [colYou, colFoe])), map: o.map !== undefined ? o.map : mapId === 'custom' ? custom : mapId === 'open' ? OPEN_MAP : mapId === 'forest' ? FOREST_MAP : null };
    try { localStorage.setItem('cz-setup', JSON.stringify({ mine: a, foe: b, level: lv, light: opt.lighting, funds: opt.money, treaty: !!opt.treaty, noSuper: opt.noSuper, koth: opt.koth, map: mapId, colors: opt.colors, gen })); } catch (e) { /* ignore */ }
    const pick = b === 'random' ? FACTION_IDS[Math.floor(Math.random() * FACTION_IDS.length)] : b; // chosen before the sim starts, so the sim itself stays deterministic
    const eg = generalsOf(pick); opt.generals = o.generals || [a === mine ? myGen() : generalsOf(a)[0], eg[Math.floor(Math.random() * eg.length)]];   // the enemy's general is drawn here, before the sim starts
    root.hidden = true; onStart([a, pick], lv === 'none' ? 'medium' : lv, opt);
  };
  document.getElementById('setup-start').addEventListener('click', () => go(mine, foe), { once: true });
  window.__rtsStart = (a, b, lv, o) => go(a || mine, b || foe, lv || level, o);
}
