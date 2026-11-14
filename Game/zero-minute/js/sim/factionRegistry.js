// Faction registry: every weapon, unit, building, upgrade, support power and
// promotion in the game is data in this file. The simulation never checks a
// unit by name; it reads role flags (builder, harvester, air, stealth, ...).
// Adding a faction means adding entries here, not touching the engine.

// ---------------------------------------------------------------- weapons
// cd in sim ticks (20/s). vs: damage multiplier per armor class; a missing or
// zero entry means the weapon cannot target that class at all.
export const WEAPONS = {
  rifle:       { range: 30, dmg: 9,  cd: 8,  kind: 'hitscan', vs: { inf: 1, light: 0.5, heavy: 0.15, bldg: 0.2, air: 0.45 } },
  sniper:      { range: 52, dmg: 90, cd: 50, kind: 'hitscan', vs: { inf: 1, light: 0.08 } },
  flashbang:   { range: 24, dmg: 80, cd: 60, kind: 'lob', speed: 26, arc: 4, splash: 5, clearsGarrison: true, garrisonOnly: true, vs: { inf: 1 } },
  cannon:      { range: 36, dmg: 60, cd: 44, kind: 'shell', speed: 110, vs: { inf: 0.35, light: 1, heavy: 1, bldg: 1 } },
  dual_cannon: { range: 38, dmg: 75, cd: 58, kind: 'shell', speed: 110, burst: 2, burstGap: 6, vs: { inf: 0.4, light: 1, heavy: 1.1, bldg: 1.1 } },
  laser:       { range: 40, dmg: 13, cd: 5,  kind: 'laser', vs: { inf: 0.9, light: 1, heavy: 0.55, bldg: 0.3, air: 1.7 } },
  chaingun:    { range: 32, dmg: 7,  cd: 3,  kind: 'hitscan', vs: { inf: 1, light: 0.8, heavy: 0.2, bldg: 0.15, air: 0.7 } },
  heli_rocket: { range: 40, dmg: 40, cd: 70, kind: 'rocket', speed: 55, burst: 2, burstGap: 5, intercept: true, vs: { inf: 0.25, light: 1, heavy: 1.5, bldg: 1.1 } },
  rocket:      { range: 46, dmg: 42, cd: 64, kind: 'rocket', speed: 48, burst: 2, burstGap: 5, intercept: true, vs: { inf: 0.25, light: 1, heavy: 1.6, bldg: 1.2 } },
  rpg:         { range: 38, dmg: 48, cd: 52, kind: 'rocket', speed: 46, intercept: true, vs: { inf: 0.2, light: 1, heavy: 1.35, bldg: 0.8, air: 1.2 } },
  patriot:     { range: 54, dmg: 48, cd: 26, kind: 'missile', speed: 70, intercept: true, vs: { inf: 0.5, light: 1.2, heavy: 1, bldg: 0.3, air: 1.6 } },
  stinger:     { range: 50, dmg: 40, cd: 30, kind: 'missile', speed: 64, intercept: true, vs: { inf: 0.5, light: 1.1, heavy: 0.9, bldg: 0.3, air: 1.6 } },
  gatling:     { range: 38, dmg: 6,  cd: 2,  kind: 'hitscan', vs: { inf: 1, light: 0.7, heavy: 0.15, bldg: 0.1, air: 1 } },
  inferno:     { range: 72, minRange: 18, dmg: 45, cd: 90, kind: 'lob', speed: 40, arc: 16, splash: 6, clearsGarrison: true, hazard: { kind: 'fire', r: 6, secs: 6, dps: 16 }, vs: { inf: 1, light: 0.8, heavy: 0.3, bldg: 0.6 } },
  bunker_bomb: { range: 30, dmg: 300, cd: 16, kind: 'missile', speed: 60, splash: 6, vs: { inf: 0.6, light: 0.9, heavy: 1, bldg: 2.2 } },          // F-15E: two per sortie, no use against aircraft
  lav_gun:     { range: 30, dmg: 9, cd: 3, kind: 'hitscan', vs: { inf: 1, light: 0.9, heavy: 0.25, bldg: 0.2, air: 0.5 } },                          // 25 mm chain gun
  tow:         { range: 46, dmg: 170, cd: 110, kind: 'missile', speed: 60, intercept: true, vs: { inf: 0.2, light: 1, heavy: 1.9, bldg: 0.9 } },      // TOW upgrade: built to kill tanks
  vest:        { range: 2.6, dmg: 1, cd: 999, kind: 'hitscan', vs: { inf: 1, light: 1, heavy: 1, bldg: 1 } },                                        // suicide units: reaching this range triggers the blast
  scud_missile: { range: 120, dmg: 320, cd: 400, kind: 'shell', speed: 55, splash: 10, hazard: { kind: 'toxin', r: 7, secs: 10, dps: 16 }, vs: { inf: 1, light: 1, heavy: 0.7, bldg: 1.1 } },
  raptor_missile: { range: 46, dmg: 115, cd: 20, kind: 'missile', speed: 95, burst: 2, burstGap: 4, intercept: true, splash: 4, vs: { inf: 0.6, light: 1, heavy: 1.1, bldg: 0.9, air: 1.4 } },
  mig_missile: { range: 44, dmg: 110, cd: 20, kind: 'missile', speed: 90, burst: 2, burstGap: 4, intercept: true, splash: 5, hazard: { kind: 'fire', r: 4.5, secs: 4, dps: 16 }, vs: { inf: 0.8, light: 1, heavy: 1, bldg: 1 } },
  tech_mg:     { range: 30, dmg: 6,  cd: 4,  kind: 'hitscan', vs: { inf: 1, light: 0.6, heavy: 0.12, bldg: 0.12, air: 0.6 } },
  tech_cannon: { range: 32, dmg: 30, cd: 24, kind: 'shell', speed: 100, vs: { inf: 0.5, light: 1, heavy: 0.8, bldg: 0.8 } },
  tech_rocket: { range: 40, dmg: 44, cd: 40, kind: 'rocket', speed: 52, burst: 2, burstGap: 5, intercept: true, vs: { inf: 0.3, light: 1, heavy: 1.5, bldg: 1.1, air: 1 } },
  toxin_shell: { range: 34, dmg: 42, cd: 46, kind: 'shell', speed: 100, hazard: { kind: 'toxin', r: 3.5, secs: 3, dps: 12 }, vs: { inf: 1, light: 1, heavy: 0.85, bldg: 0.8 } },
  scorp_rocket:{ range: 40, dmg: 60, cd: 110, kind: 'rocket', speed: 50, intercept: true, vs: { inf: 0.2, light: 1, heavy: 1.5, bldg: 1 } },
  toxin_spray: { range: 15, dmg: 7,  cd: 2,  kind: 'spray', clearsGarrison: true, vs: { inf: 1, light: 0.15, heavy: 0.04, bldg: 0.08 } },
  // damage profiles for off-map strikes and lingering hazards (never equipped)
  a10gun:    { vs: { inf: 1, light: 1, heavy: 1, bldg: 0.4 } },      // 30 mm depleted-uranium burst
  a10rocket: { vs: { inf: 0.8, light: 1.2, heavy: 1, bldg: 0.6 } },   // armor-piercing rockets
  artillery: { vs: { inf: 1, light: 1, heavy: 0.7, bldg: 1 } },
  fab:       { vs: { inf: 1, light: 1, heavy: 0.6, bldg: 0.8 } },
  nuke:      { vs: { inf: 1, light: 1, heavy: 0.9, bldg: 1.1 } },
  particle:  { vs: { inf: 1, light: 1, heavy: 1, bldg: 1.3 } },
  scud:      { vs: { inf: 1, light: 1, heavy: 0.6, bldg: 0.9 } },
  fire:      { vs: { inf: 1, light: 0.5, heavy: 0.15 } },
  thermal:   { vs: { inf: 1, light: 0.6, heavy: 0.25, bldg: 0.15 } },
  toxin:     { vs: { inf: 1 } },
};

// ---------------------------------------------------------------- units
// cls: 0 infantry (1 cell clearance), 1 vehicle (2 cells). model: render key.
const DOZER = { model: 'dozer', cost: 1000, secs: 5, hp: 250, speed: 9, turn: 2.6, radius: 1.7, cls: 1, sight: 30, armor: 'light', builder: true };
const TRUCK = { model: 'truck', cost: 600, secs: 5, hp: 220, speed: 11, turn: 2.8, radius: 1.7, cls: 1, sight: 24, armor: 'light', harvester: true, carry: 200 };
const SQUAD = { model: 'rifle', cost: 300, secs: 5, hp: 240, speed: 6, turn: 9, radius: 1.0, cls: 0, sight: 36, armor: 'inf', weapon: 'rifle', infantry: true, canGarrison: true, canCapture: true };
const TANK  = { model: 'tank', cost: 900, secs: 10, hp: 480, speed: 9, turn: 1.7, radius: 2.0, cls: 1, sight: 36, armor: 'heavy', weapon: 'cannon', turret: 3.2, fireMoving: true, dirArmor: true, tank: true };

export const UNITS = {
  // ---- Vanguard Coalition
  v_dozer:      { ...DOZER, name: 'Dozer', faction: 'vanguard' },
  v_truck:      { ...TRUCK, name: 'Supply Truck', faction: 'vanguard' },   // no longer trained: the United States collects with Chinooks
  v_chinook:    { model: 'chinook', name: 'Chinook', faction: 'vanguard', cost: 800, secs: 8, hp: 320, speed: 15, turn: 2.2, radius: 2.8, cls: 1, sight: 30, armor: 'air',
                  air: true, alt: 11, heli: true, harvester: true, carry: 200 },
  v_ranger:     { ...SQUAD, name: 'Flashbang Ranger', faction: 'vanguard', weapon2: 'flashbang' },
  v_pathfinder: { model: 'sniper', name: 'Pathfinder Sniper', faction: 'vanguard', cost: 600, secs: 8, hp: 120, speed: 6, turn: 9, radius: 0.9, cls: 0, sight: 48, armor: 'inf',
                  weapon: 'sniper', infantry: true, canGarrison: true, canCapture: true, stealth: 'still', detector: 26, promo: 'v_pathfinder' },
  v_tank:       { ...TANK, model: 'abrams', name: 'Sentinel Battle Tank', faction: 'vanguard', pdlUpgrade: true },
  v_avenger:    { model: 'avenger', name: 'Avenger Laser Tank', faction: 'vanguard', cost: 1200, secs: 12, hp: 380, speed: 10, turn: 1.9, radius: 2.0, cls: 1, sight: 40, armor: 'heavy',
                  weapon: 'laser', turret: 4.5, fireMoving: true, dirArmor: true, pdl: 20, detector: 22 },
  v_drone:      { model: 'drone', name: 'Recon Drone', faction: 'vanguard', cost: 400, secs: 6, hp: 90, speed: 24, turn: 3.2, radius: 1.2, cls: 1, sight: 46, armor: 'air', air: true, alt: 18, scout: true },
  v_comanche:   { model: 'comanche', name: 'Comanche Gunship', faction: 'vanguard', cost: 1500, secs: 14, hp: 260, speed: 16, turn: 2.6, radius: 2.2, cls: 1, sight: 44, armor: 'air',
                  weapon: 'chaingun', weapon2: 'heli_rocket', turret: 5, air: true, alt: 13, fireMoving: true, heli: true },
  v_raptor:     { model: 'raptor', name: 'F-22 Raptor', faction: 'vanguard', cost: 1400, secs: 12, hp: 220, speed: 36, turn: 2.3, radius: 2.4, cls: 1, sight: 40, armor: 'air',
                  weapon: 'raptor_missile', air: true, alt: 20, fireMoving: true, based: true, ammo: 2, reload: 110 },
  // ---- Red Hammer Pact
  r_dozer:      { ...DOZER, name: 'Dozer', faction: 'redhammer' },
  r_truck:      { ...TRUCK, name: 'Supply Truck', faction: 'redhammer' },
  r_conscript:  { ...SQUAD, name: 'Conscript Squad', faction: 'redhammer', cost: 250, hp: 260 },
  r_hacker:     { model: 'hacker', name: 'Hacker Squad', faction: 'redhammer', cost: 600, secs: 8, hp: 100, speed: 5.5, turn: 9, radius: 0.9, cls: 0, sight: 24, armor: 'inf',
                  infantry: true, canCapture: true, deploy: { income: 6, every: 20 } },
  r_scout:      { model: 'scoutcar', name: 'Scout Car', faction: 'redhammer', cost: 450, secs: 6, hp: 170, speed: 18, turn: 3.0, radius: 1.6, cls: 1, sight: 42, armor: 'light',
                  weapon: 'tech_mg', turret: 4.5, fireMoving: true, scout: true },
  r_tank:       { ...TANK, model: 'battlemaster', name: 'Battlemaster Tank', faction: 'redhammer', cost: 800, hp: 440, nuke: true },
  r_overlord:   { model: 'overlord', name: 'Overlord Heavy Tank', faction: 'redhammer', cost: 2000, secs: 18, hp: 1100, speed: 6, turn: 1.2, radius: 2.7, cls: 1, sight: 36, armor: 'heavy',
                  weapon: 'dual_cannon', turret: 2.2, fireMoving: true, dirArmor: true, tank: true, nuke: true,
                  hardpoints: { gatling: { name: 'Gatling Cannon', cost: 500, secs: 8, weapon: 'gatling' }, bunker: { name: 'Battle Bunker', cost: 400, secs: 8, capacity: 1 } } },
  r_inferno:    { model: 'inferno', name: 'Inferno Cannon', faction: 'redhammer', cost: 900, secs: 12, hp: 240, speed: 7, turn: 1.6, radius: 1.9, cls: 1, sight: 30, armor: 'light', weapon: 'inferno', thermo: true },
  r_mig:        { model: 'j11', name: 'J-11 Fighter', faction: 'redhammer', cost: 1200, secs: 12, hp: 200, speed: 34, turn: 2.2, radius: 2.4, cls: 1, sight: 40, armor: 'air',
                  weapon: 'mig_missile', air: true, alt: 20, fireMoving: true, based: true, ammo: 2, reload: 120, thermo: true },
  r_hind:       { model: 'hind', name: 'Hind Gunship', faction: 'redhammer', cost: 1500, secs: 14, hp: 340, speed: 14, turn: 2.2, radius: 2.4, cls: 1, sight: 42, armor: 'air',
                  weapon: 'chaingun', weapon2: 'heli_rocket', turret: 5, air: true, alt: 13, fireMoving: true, heli: true },
  // ---- general-only units (see GENERALS)
  v_f15:        { model: 'f15e', name: 'F-15E Strike Eagle', faction: 'vanguard', cost: 1600, secs: 13, hp: 240, speed: 34, turn: 2.1, radius: 2.5, cls: 1, sight: 40, armor: 'air',
                  weapon: 'bunker_bomb', air: true, alt: 20, fireMoving: true, based: true, ammo: 2, reload: 130 },
  v_lav:        { model: 'lav25', name: 'LAV-25', faction: 'vanguard', cost: 900, secs: 9, hp: 300, speed: 13, turn: 2.8, radius: 2.0, cls: 1, sight: 34, armor: 'light',
                  weapon: 'lav_gun', upWeapon: { v_tow: 'tow' }, turret: 4, fireMoving: true, amph: true },
  s_bomber:     { model: 'bomber', name: 'Suicide Bomber', faction: 'sandstorm', cost: 300, secs: 5, hp: 70, speed: 9.5, turn: 9, radius: 0.8, cls: 0, sight: 26, armor: 'inf',
                  weapon: 'vest', infantry: true, suicide: { r: 7, dmg: 280 } },
  s_fpv:        { model: 'fpv', name: 'FPV Attack Drone', faction: 'sandstorm', cost: 350, secs: 6, hp: 40, speed: 24, turn: 4, radius: 1.0, cls: 1, sight: 34, armor: 'air',
                  weapon: 'vest', air: true, alt: 8, fireMoving: true, suicide: { r: 5, dmg: 230 } },
  s_scudtruck:  { model: 'scudtel', name: 'Scud Launcher', faction: 'sandstorm', cost: 1500, secs: 16, hp: 260, speed: 7, turn: 1.4, radius: 2.8, cls: 1, sight: 30, armor: 'light',
                  weapon: 'scud_missile' },
  // ---- Sandstorm Front
  s_worker:     { model: 'worker', name: 'Worker', faction: 'sandstorm', cost: 250, secs: 4, hp: 110, speed: 6.5, turn: 9, radius: 0.9, cls: 0, sight: 28, armor: 'inf', infantry: true, builder: true },
  s_truck:      { ...TRUCK, name: 'Supply Pickup', faction: 'sandstorm' },
  s_guerrilla:  { ...SQUAD, name: 'Guerrilla Squad', faction: 'sandstorm', cost: 250 },
  s_rpg:        { model: 'rpg', name: 'RPG Trooper', faction: 'sandstorm', cost: 350, secs: 6, hp: 160, speed: 6, turn: 9, radius: 0.9, cls: 0, sight: 36, armor: 'inf', weapon: 'rpg', infantry: true, canGarrison: true, canCapture: true },
  s_saboteur:   { model: 'saboteur', name: 'Saboteur', faction: 'sandstorm', cost: 700, secs: 10, hp: 90, speed: 7, turn: 9, radius: 0.9, cls: 0, sight: 30, armor: 'inf', infantry: true, stealth: 'always', infiltrator: true, promo: 's_saboteur' },
  s_technical:  { model: 'technical', name: 'Technical Pickup', faction: 'sandstorm', cost: 500, secs: 6, hp: 150, speed: 18, turn: 3.2, radius: 1.6, cls: 1, sight: 38, armor: 'light',
                  weapon: 'tech_mg', turret: 4.5, fireMoving: true, salvage: true, salvageWeapons: ['tech_mg', 'tech_cannon', 'tech_rocket'] },
  s_buggy:      { model: 'buggy', name: 'Rocket Buggy', faction: 'sandstorm', cost: 900, secs: 8, hp: 160, speed: 17, turn: 3.2, radius: 1.6, cls: 1, sight: 40, armor: 'light', weapon: 'rocket', turret: 4.0, fireMoving: true, salvage: true },
  s_scorpion:   { model: 'scorpion', name: 'Scorpion Light Tank', faction: 'sandstorm', cost: 700, secs: 9, hp: 320, speed: 11, turn: 2.2, radius: 1.8, cls: 1, sight: 36, armor: 'heavy',
                  weapon: 'toxin_shell', weapon2: 'scorp_rocket', turret: 3.6, fireMoving: true, dirArmor: true, salvage: true },
  s_tractor:    { model: 'tractor', name: 'Toxin Tractor', faction: 'sandstorm', cost: 600, secs: 8, hp: 220, speed: 9, turn: 2.4, radius: 1.7, cls: 1, sight: 30, armor: 'light', weapon: 'toxin_spray', turret: 4, fireMoving: true, salvage: true },
};

// ---------------------------------------------------------------- buildings
// w,h in nav cells. power: + produces, - consumes. role: generic engine role.
const CC      = { model: 'cc', role: 'cc', cost: 2000, secs: 30, hp: 3000, w: 10, h: 10, power: 0, sight: 46 };
const POWER   = { model: 'power', role: 'power', cost: 800, secs: 8, hp: 800, w: 6, h: 6, power: 5, sight: 24 };
const SUPPLY  = { model: 'supply', role: 'supply', cost: 1500, secs: 10, hp: 1500, w: 8, h: 6, power: -1, sight: 28, exitEast: true };
const BARRACKS= { model: 'barracks', role: 'barracks', cost: 500, secs: 8, hp: 1000, w: 6, h: 6, power: 0, sight: 28 };
// repair: vehicles within this many metres of the footprint are repaired while out of combat
const FACTORY = { model: 'factory', role: 'factory', cost: 2000, secs: 14, hp: 2000, w: 8, h: 8, power: -1, sight: 28, repair: 12 };
// 40 m x 28 m: four parking pads and a helipad down the middle, a 36 m runway on each side.
const AIRFIELD= { model: 'airfield', role: 'airfield', cost: 1800, secs: 14, hp: 2000, w: 20, h: 14, power: -1, sight: 30, pads: 4, runway: true };

export const BLDGS = {
  v_cc:       { ...CC, name: 'Command Center', faction: 'vanguard', trains: ['v_dozer', 'v_drone'] },
  v_power:    { ...POWER, name: 'Cold Fusion Reactor', faction: 'vanguard' },
  v_supply:   { ...SUPPLY, name: 'Supply Center', faction: 'vanguard', trains: ['v_chinook'], needs: 'v_power' },
  v_barracks: { ...BARRACKS, name: 'Barracks', faction: 'vanguard', trains: ['v_ranger', 'v_pathfinder'] },
  v_factory:  { ...FACTORY, name: 'War Factory', faction: 'vanguard', trains: ['v_tank', 'v_avenger'], upgrades: ['v_pdl'], needs: 'v_supply' },
  v_airfield: { ...AIRFIELD, name: 'Air Field', faction: 'vanguard', trains: ['v_raptor', 'v_comanche'], needs: 'v_factory' },
  v_patriot:  { model: 'patriot', role: 'defense', name: 'Patriot Battery', faction: 'vanguard', cost: 1000, secs: 8, hp: 1000, w: 4, h: 4, power: -3, sight: 50, weapon: 'patriot', turret: 3.0, detector: 30, needs: 'v_power' },
  v_uplink:   { model: 'uplink', role: 'income', name: 'Satellite Uplink', faction: 'vanguard', cost: 2500, secs: 20, hp: 1200, w: 6, h: 6, power: -3, sight: 30, income: { amt: 25, every: 40 }, needs: 'v_factory' },

  r_cc:       { ...CC, name: 'Command Center', faction: 'redhammer', trains: ['r_dozer', 'r_scout'] },
  r_power:    { ...POWER, name: 'Nuclear Reactor', faction: 'redhammer' },
  r_supply:   { ...SUPPLY, name: 'Supply Center', faction: 'redhammer', trains: ['r_truck'], needs: 'r_power' },
  r_barracks: { ...BARRACKS, name: 'Barracks', faction: 'redhammer', trains: ['r_conscript', 'r_hacker'] },
  r_factory:  { ...FACTORY, name: 'War Factory', faction: 'redhammer', trains: ['r_tank', 'r_inferno', 'r_overlord'], upgrades: ['r_nuke', 'r_thermo'], needs: 'r_supply' },
  r_airfield: { ...AIRFIELD, name: 'Airfield', faction: 'redhammer', trains: ['r_mig', 'r_hind'], needs: 'r_factory' },
  r_gatling:  { model: 'gatling', role: 'defense', name: 'Gatling Tower', faction: 'redhammer', cost: 900, secs: 8, hp: 1100, w: 4, h: 4, power: -2, sight: 46, weapon: 'gatling', turret: 4.0, detector: 28, needs: 'r_power' },

  s_cc:       { ...CC, name: 'Command Hideout', faction: 'sandstorm', trains: ['s_worker'] },
  s_supply:   { ...SUPPLY, name: 'Supply Stash', faction: 'sandstorm', power: 0, trains: ['s_truck'] },
  s_barracks: { ...BARRACKS, name: 'Barracks', faction: 'sandstorm', trains: ['s_guerrilla', 's_rpg', 's_saboteur'] },
  s_factory:  { ...FACTORY, name: 'Arms Dealer', faction: 'sandstorm', power: 0, cost: 1800, trains: ['s_technical', 's_scorpion', 's_tractor', 's_buggy'], needs: 's_supply' },
  s_stinger:  { model: 'stinger', role: 'defense', name: 'Stinger Site', faction: 'sandstorm', cost: 900, secs: 8, hp: 900, w: 4, h: 4, power: 0, sight: 48, weapon: 'stinger', turret: 3.2, detector: 28, needs: 's_barracks' },
  s_tunnel:   { model: 'tunnel', role: 'tunnel', name: 'Tunnel Network', faction: 'sandstorm', cost: 800, secs: 8, hp: 1000, w: 4, h: 4, power: 0, sight: 32, tunnel: true, repair: 10, needs: 's_barracks' },
  // Superweapons: one per side, announced to both players, 5-minute countdown from completion.
  v_particle: { model: 'particle', role: 'super', name: 'Particle Cannon', faction: 'vanguard', cost: 5000, secs: 45, hp: 2400, w: 8, h: 8, power: -10, sight: 30, needs: 'v_factory', superPower: 'particle' },
  r_silo:     { model: 'silo', role: 'super', name: 'Nuclear Missile Silo', faction: 'redhammer', cost: 5000, secs: 45, hp: 2600, w: 8, h: 8, power: -10, sight: 30, needs: 'r_factory', superPower: 'nuke' },
  s_scud:     { model: 'scud', role: 'super', name: 'Scud Storm', faction: 'sandstorm', cost: 5000, secs: 45, hp: 2200, w: 8, h: 8, power: 0, sight: 30, needs: 's_factory', superPower: 'scud' },
  s_market:   { model: 'market', role: 'income', name: 'Black Market', faction: 'sandstorm', cost: 2500, secs: 20, hp: 1200, w: 6, h: 6, power: 0, sight: 30, income: { amt: 25, every: 40 }, needs: 's_factory' },

  // neutral map objects
  // caps: infantry squads each building type holds (same order as CIV_KINDS in map.js: apartment, market hall, office tower, mosque,
  // warehouse, farmhouse, log cabin, barn, fuel station, water tower). `capacity` is the fallback.
  civ:     { model: 'civ', name: 'Civilian Building', hp: 1200, w: 6, h: 6, sight: 40, capacity: 5, caps: [6, 5, 8, 5, 6, 4, 3, 4, 3, 3] },
  dock:    { model: 'dock', name: 'Supply Dock', hp: 1e9, w: 8, h: 6, sight: 0, indestructible: true },
  derrick: { model: 'derrick', name: 'Oil Derrick', hp: 1e9, w: 4, h: 4, sight: 26, indestructible: true, capturable: true, income: { amt: 30, every: 40 }, captureXp: 150, captureTicks: 100 },
};

// ---------------------------------------------------------------- upgrades
export const UPGRADES = {
  v_pdl:    { name: 'Point-Defense Lasers', cost: 1500, secs: 20, desc: 'Sentinel tanks shoot down incoming rockets and missiles.' },
  r_nuke:   { name: 'Nuclear Tanks', cost: 2000, secs: 25, desc: 'Battlemasters and Overlords: +25% damage, +15% speed.' },
  v_stealthrotor: { name: 'Stealth Comanche', cost: 1500, secs: 20, desc: 'Comanches are hidden unless they have just fired or a detector is near.' },
  v_tow:    { name: 'TOW Missiles', cost: 1200, secs: 18, desc: 'LAV-25s add a TOW launcher: heavy damage to tanks at long range.' },
  s_anthrax: { name: 'Anthrax Beta', cost: 1500, secs: 20, desc: 'Every toxin cloud you make does 50% more damage.' },
  r_thermo: { name: 'Thermobaric Shells', cost: 1500, secs: 20, desc: 'Inferno Cannon and MiG firestorms are larger and last longer.' },
};

// ---------------------------------------------------------------- support powers
export const POWERS = {
  a10:     { name: 'A-10 Strafing Run', cd: 150, radius: 24, shape: 'line', desc: 'A-10 dives in: a 30 mm cannon burst along a 48 m line, then six armor-piercing rockets.',
             gun: { dmg: 80, r: 4.5, step: 3.5 }, rockets: { n: 6, dmg: 270, r: 7, flight: 16, seek: 7 } },
  emp:     { name: 'EMP Pulse Bomb', cd: 210, radius: 22, desc: 'Disables enemy vehicles and defenses in the area for 12 s.' },
  barrage: { name: 'Artillery Barrage', cd: 150, radius: 16, desc: '12 high-explosive shells fall on the target zone.' },
  fab:     { name: 'Fuel-Air Bomb', cd: 240, radius: 24, desc: 'Massive shockwave, then lingering heat that also empties garrisons.' },
  ambush:  { name: 'Ambush Squad', cd: 180, radius: 8, desc: '6 stealthed guerrillas appear at the target.' },
  toxinbomb: { name: 'Toxin Bomb', cd: 210, radius: 15, desc: 'Green cloud for 20 s: kills infantry and clears garrisons.' },
  b2: { name: 'B-2 Carpet Bomb', cd: 240, radius: 14, line: 60, n: 10, dmg: 190, r: 8, desc: 'A B-2 Spirit lays ten bombs along a 60 m line.' },
  paradrop: { name: 'Paratrooper Drop', cd: 240, radius: 9, n: 5, unit: 'v_ranger', desc: 'A transport drops 5 Ranger squads at the target.' },
  cashhack: { name: 'Cash Hack', cd: 240, radius: 14, amount: 1500, aim: 'supply', desc: 'Steals up to $1,500 from the enemy. Aim at an enemy supply building you have scouted.' },
  sneaktunnel: { name: 'Sneak Attack', cd: 300, radius: 6, delay: 5, aim: 'site', desc: 'A Tunnel Network exit breaks ground at the target after 5 s. Needs clear, explored ground.' },
  // Superweapons. `super` is the building that owns the power; cd is the 5-minute countdown.
  particle: { name: 'Particle Cannon', cd: 300, radius: 12, super: 'v_particle', beam: { ticks: 100, every: 2, dmg: 55, r: 6, sweep: 24 }, desc: 'Orbital beam burns along a 24 m line for 5 s.' },
  nuke:     { name: 'Nuclear Missile', cd: 300, radius: 34, super: 'r_silo', flight: 120, dmg: 1400, fallout: { r: 20, secs: 12, dps: 40 }, desc: 'One warhead. Levels everything within 34 m and leaves fallout.' },
  scud:     { name: 'Scud Storm', cd: 300, radius: 24, super: 's_scud', n: 9, dmg: 280, r: 9, toxin: { r: 7, secs: 10, dps: 18 }, desc: 'Nine toxin-tipped missiles rain over a 24 m zone.' },
};

// ---------------------------------------------------------------- general
export const GENERAL = { rankXp: [0, 200, 500, 1000, 1700], dmgXp: 0.05, killXp: 0.1 };
export const VET = { names: ['', 'Veteran', 'Elite', 'Heroic'], xpMult: [1, 2.5, 5], hp: 0.15, rate: 0.15, regen: [0, 0, 0.01, 0.02] };
export const HORDE = { radius: 14, need: 4, bonus: 0.15, bonusPromo: 0.25 };

// ---------------------------------------------------------------- factions
// tree: tier = General rank required (1, 3, 5). req = parent node (branching).
export const FACTIONS = {
  vanguard: {
    id: 'vanguard', name: 'United States', doctrine: 'High-tech and air superiority',
    blurb: 'Abrams tanks, F-22s, Comanche gunships and stealth snipers. Everything leans on the power grid.',
    hull: 0xc4b79a, dark: 0x8a8067, usesPower: true, radarNeedsPower: true,
    build: ['v_power', 'v_barracks', 'v_supply', 'v_factory', 'v_airfield', 'v_patriot', 'v_uplink', 'v_particle', 'v_cc'],
    roles: { cc: 'v_cc', power: 'v_power', supply: 'v_supply', barracks: 'v_barracks', factory: 'v_factory', airfield: 'v_airfield', defense: 'v_patriot', income: 'v_uplink', super: 'v_particle', builder: 'v_dozer', truck: 'v_chinook', squad: 'v_ranger', scout: 'v_drone' },
    aiArmy: ['v_ranger', 'v_tank', 'v_ranger', 'v_avenger', 'v_tank', 'v_comanche'],
    tree: [
      { id: 'v_pathfinder', tier: 1, name: 'Pathfinder Training', desc: 'Unlocks the Pathfinder Sniper at the Barracks.', unlock: 'v_pathfinder' },
      { id: 'v_vet', tier: 1, name: 'Armor Veterancy', desc: 'Tanks leave the War Factory as Veterans.', vetBuild: 'tank' },
      { id: 'v_a10', tier: 3, name: 'A-10 Strafing Run', desc: POWERS.a10.desc, power: 'a10' },
      { id: 'v_para', tier: 3, req: 'v_pathfinder', name: 'Paratrooper Drop', desc: POWERS.paradrop.desc, power: 'paradrop' },
      { id: 'v_fastpdl', tier: 3, req: 'v_vet', name: 'Rapid Point Defense', desc: 'Point-defense lasers recharge 40% faster.', flag: 'fastPdl' },
      { id: 'v_emp', tier: 5, req: 'v_a10', name: 'EMP Pulse Bomb', desc: POWERS.emp.desc, power: 'emp' },
      { id: 'v_a10x2', tier: 5, req: 'v_a10', name: 'A-10 Wingman', desc: 'A second A-10 follows the first.', flag: 'a10x2' },
    ],
  },
  redhammer: {
    id: 'redhammer', name: 'China', doctrine: 'Heavy armor and overwhelming firepower',
    blurb: 'Heavy tanks, Inferno Cannons and J-11 fighters. Units fight 15% faster in a horde of five or more.',
    hull: 0x5d6a48, dark: 0x3d4631, usesPower: true, horde: true,
    build: ['r_power', 'r_barracks', 'r_supply', 'r_factory', 'r_airfield', 'r_gatling', 'r_silo', 'r_cc'],
    roles: { cc: 'r_cc', power: 'r_power', supply: 'r_supply', barracks: 'r_barracks', factory: 'r_factory', airfield: 'r_airfield', defense: 'r_gatling', super: 'r_silo', builder: 'r_dozer', truck: 'r_truck', squad: 'r_conscript', scout: 'r_scout' },
    aiArmy: ['r_conscript', 'r_tank', 'r_conscript', 'r_tank', 'r_inferno', 'r_overlord', 'r_mig'],
    tree: [
      { id: 'r_redguard', tier: 1, name: 'Red Guard Training', desc: 'Infantry leave the Barracks as Veterans.', vetBuild: 'infantry' },
      { id: 'r_artyvet', tier: 1, name: 'Artillery Training', desc: 'Inferno Cannons are built as Veterans.', vetBuild: 'r_inferno' },
      { id: 'r_barrage', tier: 3, name: 'Artillery Barrage', desc: POWERS.barrage.desc, power: 'barrage' },
      { id: 'r_hack', tier: 3, req: 'r_artyvet', name: 'Cash Hack', desc: POWERS.cashhack.desc, power: 'cashhack' },
      { id: 'r_mass', tier: 3, req: 'r_redguard', name: 'Mass Assault', desc: 'Horde bonus rises from +15% to +25% fire rate.', flag: 'hordePlus' },
      { id: 'r_fab', tier: 5, req: 'r_barrage', name: 'Fuel-Air Bomb', desc: POWERS.fab.desc, power: 'fab' },
      { id: 'r_barrage2', tier: 5, req: 'r_barrage', name: 'Barrage II', desc: 'Artillery Barrage fires 20 shells.', flag: 'barrage2' },
    ],
  },
  sandstorm: {
    id: 'sandstorm', name: 'ISIS', doctrine: 'Guerrilla, stealth and salvage',
    blurb: 'No power grid. Vehicles upgrade from enemy wrecks, and Tunnel Networks move units across the map instantly.',
    hull: 0x9a7848, dark: 0x5e4a30, usesPower: false, salvage: true, ambush: ['s_rpg', 's_rpg', 's_guerrilla'],
    build: ['s_barracks', 's_supply', 's_factory', 's_stinger', 's_tunnel', 's_market', 's_scud', 's_cc'],
    roles: { cc: 's_cc', supply: 's_supply', barracks: 's_barracks', factory: 's_factory', defense: 's_stinger', tunnel: 's_tunnel', income: 's_market', super: 's_scud', builder: 's_worker', truck: 's_truck', squad: 's_guerrilla', scout: 's_technical' },
    aiArmy: ['s_guerrilla', 's_technical', 's_rpg', 's_scorpion', 's_technical', 's_buggy', 's_tractor'],
    tree: [
      { id: 's_scrap', tier: 1, name: 'Scrap Mastery', desc: 'New vehicles start with one salvage upgrade.', flag: 'scrap' },
      { id: 's_saboteur', tier: 1, name: 'Saboteur Cell', desc: 'Unlocks the Saboteur at the Barracks.', unlock: 's_saboteur' },
      { id: 's_ambush', tier: 3, name: 'Ambush Squad', desc: POWERS.ambush.desc, power: 'ambush' },
      { id: 's_bounty', tier: 3, req: 's_scrap', name: 'Cash Bounty', desc: 'Earn 20% of the cost of every enemy unit you destroy.', flag: 'bounty' },
      { id: 's_toxin', tier: 5, req: 's_ambush', name: 'Toxin Bomb', desc: POWERS.toxinbomb.desc, power: 'toxinbomb' },
      { id: 's_sneak', tier: 5, req: 's_saboteur', name: 'Sneak Attack', desc: POWERS.sneaktunnel.desc, power: 'sneaktunnel' },
      { id: 's_ambush2', tier: 5, req: 's_ambush', name: 'Ambush II', desc: 'Ambush Squad brings 10 guerrillas.', flag: 'ambush2' },
    ],
  },
};
export const FACTION_IDS = Object.keys(FACTIONS);

// ---------------------------------------------------------------- lookups
export const armorOf = (e) => (e.kind === 'bldg' ? 'bldg' : UNITS[e.type].armor);
export const defOf = (e) => (e.kind === 'unit' ? UNITS[e.type] : BLDGS[e.type]);
export const promoNode = (faction, id) => FACTIONS[faction].tree.find(n => n.id === id);
// Which building type trains a unit (first match within the unit's faction).
export function trainerOf(type) {
  for (const k in BLDGS) if ((BLDGS[k].trains || []).includes(type)) return k;
  return null;
}

// ---------------------------------------------------------------- generals
// Two per faction. A general adds units and upgrades to existing buildings, swaps a power, or changes a rule.
//   trains / upgrades   { building: [ids] } added to that building's lists
//   swap                { power: replacement } in the promotion tree
//   amph                infantry and units flagged `amph` cross water
//   spy                 metres of permanent vision around every enemy building
//   grant               promotions owned from the start;  hack: overrides for Cash Hack
//   discount            { infantry, tank } cost multipliers
//   cloak               every infantry squad and light vehicle hides when it stands still
//   toxin               damage multiplier for the side's toxin clouds;  superCd: superweapon countdown multiplier
export const GENERALS = {
  airforce: { faction: 'vanguard', name: 'General Drudgereport.com', title: 'Air Force General', desc: 'F-15E Strike Eagles with bunker-buster bombs, a Stealth Comanche upgrade, and a B-2 carpet bomb in place of the A-10 run.',
    trains: { v_airfield: ['v_f15'] }, upgrades: { v_airfield: ['v_stealthrotor'] }, swap: { a10: 'b2' } },
  marine: { faction: 'vanguard', name: 'General Maddox', title: 'Marine Corps General', desc: 'Infantry and LAV-25s cross water. The LAV-25 fighting vehicle can add TOW missiles that smash tanks.',
    trains: { v_factory: ['v_lav'] }, upgrades: { v_factory: ['v_tow'] }, amph: true },
  cyber: { faction: 'redhammer', name: "Secretary Yuec'an Tsie Mie", title: 'Cyber General', desc: 'Always sees every enemy building and what stands next to it. Starts with Cash Hack, which steals more and recharges faster.',
    spy: 18, grant: ['r_hack'], hack: { amount: 2500, cd: 150 } },
  mass: { faction: 'redhammer', name: 'General Tsao, Chicken', title: 'Mass Assault General', desc: 'Tanks and infantry cost 25% less.',
    discount: { infantry: 0.75, tank: 0.75 } },
  stealth: { faction: 'sandstorm', name: 'EWSAMA BEN ALLADIN', title: 'Stealth General', desc: 'Infantry and light vehicles vanish when they stand still. Adds Suicide Bombers and FPV Attack Drones.',
    trains: { s_barracks: ['s_bomber', 's_fpv'] }, cloak: true },
  wmd: { faction: 'sandstorm', name: 'Nuclear Nadal', title: 'WMD General', desc: 'Scud Launchers, stronger toxin clouds, the Anthrax Beta upgrade, and a faster Scud Storm.',
    trains: { s_factory: ['s_scudtruck'] }, upgrades: { s_market: ['s_anthrax'] }, toxin: 1.25, superCd: 0.8 },
};
export const generalsOf = (faction) => Object.keys(GENERALS).filter(g => GENERALS[g].faction === faction);
export const generalOf = (T) => (T && T.general && GENERALS[T.general]) || null;
export function trainsOf(T, btype) { const base = BLDGS[btype].trains || [], g = generalOf(T); return g && g.trains && g.trains[btype] ? base.concat(g.trains[btype]) : base; }
export function upgradesOf(T, btype) { const base = BLDGS[btype].upgrades || [], g = generalOf(T); return g && g.upgrades && g.upgrades[btype] ? base.concat(g.upgrades[btype]) : base; }
export function unitCost(T, type) {
  const d = UNITS[type], g = generalOf(T); let c = d.cost;
  if (g && g.discount) { if (d.infantry && g.discount.infantry) c *= g.discount.infantry; else if (d.tank && g.discount.tank) c *= g.discount.tank; }
  return Math.round(c / 10) * 10;
}
// The power a promotion node gives this team (a general may swap one, e.g. A-10 -> B-2).
export function nodePower(T, n) { const g = generalOf(T); return n.power && g && g.swap && g.swap[n.power] ? g.swap[n.power] : n.power; }
