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
  bunker_bomb: { range: 30, dmg: 320, cd: 16, kind: 'missile', speed: 60, splash: 6, vs: { inf: 0.8, light: 1.1, heavy: 1.2, bldg: 2.2 } },         // F-15E: two per sortie, the ground-attack specialist; no use against aircraft
  lav_gun:     { range: 30, dmg: 9, cd: 3, kind: 'hitscan', vs: { inf: 1, light: 0.9, heavy: 0.25, bldg: 0.2, air: 0.5 } },                          // 25 mm chain gun
  tow:         { range: 46, dmg: 170, cd: 110, kind: 'missile', speed: 60, intercept: true, vs: { inf: 0.2, light: 1, heavy: 1.9, bldg: 0.9 } },      // TOW upgrade: built to kill tanks
  vest:        { range: 2.6, dmg: 1, cd: 999, kind: 'hitscan', vs: { inf: 1, light: 1, heavy: 1, bldg: 1 } },                                        // suicide units: reaching this range triggers the blast
  fpv_dive:    { range: 9, dmg: 1, cd: 999, kind: 'hitscan', noJets: true, vs: { inf: 1, light: 1, heavy: 0.4, bldg: 0.3, air: 1 } },                 // FPV drone: inside this range it dives; helicopters yes, jets in flight no
  scud_missile: { range: 120, dmg: 320, cd: 240, kind: 'shell', speed: 55, arc: 36, windup: 40, splash: 10, hazard: { kind: 'toxin', r: 7, secs: 10, dps: 16 }, vs: { inf: 1, light: 1, heavy: 0.7, bldg: 1.1 } },
  raptor_missile: { range: 46, dmg: 80, cd: 20, kind: 'missile', speed: 95, burst: 2, burstGap: 4, intercept: true, splash: 4, vs: { inf: 0.5, light: 0.9, heavy: 0.8, bldg: 0.6, air: 1.6 } },   // F-22: four per sortie, best against aircraft
  mig_missile: { range: 44, dmg: 110, cd: 20, kind: 'missile', speed: 90, burst: 2, burstGap: 4, intercept: true, splash: 5, hazard: { kind: 'fire', r: 4.5, secs: 4, dps: 16 }, vs: { inf: 0.8, light: 1, heavy: 1, bldg: 1 } },
  tech_mg:     { range: 30, dmg: 6,  cd: 4,  kind: 'hitscan', vs: { inf: 1, light: 0.6, heavy: 0.12, bldg: 0.12, air: 0.6 } },
  tech_hmg:    { range: 32, dmg: 8,  cd: 3,  kind: 'hitscan', vs: { inf: 1, light: 0.8, heavy: 0.18, bldg: 0.15, air: 0.7 } },   // Technical, first salvage: heavy machine gun
  tech_twin:   { range: 34, dmg: 8,  cd: 2,  kind: 'hitscan', vs: { inf: 1, light: 0.9, heavy: 0.3, bldg: 0.2, air: 0.9 } },     // Technical, second salvage: twin heavy machine guns
  toxin_shell: { range: 34, dmg: 42, cd: 46, kind: 'shell', speed: 100, hazard: { kind: 'toxin', r: 3.5, secs: 3, dps: 12 }, vs: { inf: 1, light: 1, heavy: 0.85, bldg: 0.8 } },
  scorp_rocket:{ range: 40, dmg: 60, cd: 110, kind: 'rocket', speed: 50, intercept: true, vs: { inf: 0.2, light: 1, heavy: 1.5, bldg: 1 } },
  toxin_spray: { range: 18, dmg: 7,  cd: 2,  kind: 'spray', clearsGarrison: true, vs: { inf: 1.25, light: 0.4, heavy: 0.05, bldg: 0.08 } },
  // ---- hero weapons. noJets: cannot hit a strike aircraft in flight. noBased: cannot be used on strike aircraft at all.
  m60:         { range: 34, dmg: 10, cd: 2,  kind: 'hitscan', noJets: true, vs: { inf: 1, light: 0.8, heavy: 0.3, bldg: 0.25, air: 0.9 } },                       // Disabled Vet, one hand
  vet_rpg:     { range: 40, dmg: 70, cd: 30, kind: 'rocket', speed: 60, intercept: true, noJets: true, vs: { inf: 0.3, light: 1, heavy: 1.5, bldg: 1.1, air: 1.2 } }, // Disabled Vet, other hand
  // Fook Mie's phone. Against a hero it does `dmg`; any other unit is recruited or made to resign, and the recharge
  // then depends on what the unit cost: cost / perSec seconds, kept between minSec and maxSec (cd is the fallback).
  phone:       { range: 42, dmg: 100, cd: 80, kind: 'hack', noJets: true, noBased: true, perSec: 150, minSec: 2, maxSec: 14, vs: { inf: 1, light: 1, heavy: 1, air: 1 } },
  // The Phantom's call: one of three attacks at random (hijacked airliner, 10 s ambush, car bomb). Numbers in HERO_CALL.
  phantom_call:{ range: 44, dmg: 1, cd: 200, kind: 'call', vs: { inf: 1, light: 1, heavy: 1, bldg: 1 } },
  // ---- ships. Small craft count as light armor and warships as heavy, so every weapon above already knows what it does to them.
  rhib_mg:     { range: 32, dmg: 8,  cd: 3,  kind: 'hitscan', vs: { inf: 1, light: 0.8, heavy: 0.2, bldg: 0.15, air: 0.5 } },                        // RHIB: twin machine guns
  naval_gun:   { range: 62, dmg: 95, cd: 50, kind: 'shell', speed: 120, splash: 4, vs: { inf: 0.5, light: 1, heavy: 1, bldg: 1.1 } },                // Frigate deck gun: ships, the coast, buildings
  naval_laser: { range: 56, dmg: 18, cd: 5,  kind: 'laser', vs: { air: 1.7 } },                                                                     // Frigate laser turret: jets and helicopters only
  corvette_gun:{ range: 56, dmg: 70, cd: 44, kind: 'shell', speed: 115, splash: 3, vs: { inf: 0.45, light: 1, heavy: 1, bldg: 1 } },                 // Corvette deck cannon
  ciws:        { range: 42, dmg: 6,  cd: 2,  kind: 'hitscan', vs: { air: 1.1, inf: 0.8, light: 0.6, heavy: 0.1 } },                                 // Corvette minigun: aircraft first, small boats and people too
  minigun2:    { range: 32, dmg: 9,  cd: 2,  kind: 'hitscan', vs: { inf: 1, light: 0.8, heavy: 0.18, bldg: 0.12, air: 0.6 } },                       // Mk V: two miniguns
  mk19:        { range: 36, dmg: 26, cd: 16, kind: 'lob', grenade: true, speed: 30, arc: 3, splash: 4, burst: 2, burstGap: 4, vs: { inf: 1, light: 0.8, heavy: 0.3, bldg: 0.5 } },   // Mk V: two grenade launchers
  hellfire:    { range: 50, dmg: 150, cd: 120, kind: 'missile', speed: 70, intercept: true, vs: { inf: 0.2, light: 1, heavy: 1.8, bldg: 1 } },       // Mk V: one Hellfire launcher
  boat_rockets:{ range: 74, minRange: 14, dmg: 60, cd: 260, kind: 'rocket', speed: 50, burst: 8, burstGap: 4, splash: 5, intercept: true, vs: { inf: 0.6, light: 1, heavy: 1.1, bldg: 1.2 } },   // Missile Boat: eight at a time, then a long reload
  seal_rifle:  { range: 32, dmg: 12, cd: 5,  kind: 'hitscan', vs: { inf: 1, light: 0.5, heavy: 0.15, bldg: 0.2, air: 0.45 } },                       // SEAL Team: rapid-fire carbines
  seal_sniper: { range: 50, dmg: 80, cd: 60, kind: 'hitscan', vs: { inf: 1, light: 0.08 } },                                                         // SEAL Team: the marksman
  seal_gl:     { range: 34, dmg: 34, cd: 40, kind: 'lob', grenade: true, speed: 28, arc: 3.5, splash: 4.5, vs: { inf: 0.9, light: 1, heavy: 0.5, bldg: 0.7 } },     // SEAL Team: grenade launcher
  // ---- Russia (weapons follow what the real vehicle carries; numbers are placeholders set by the balance sweep)
  gun125:      { range: 36, dmg: 62, cd: 44, kind: 'shell', speed: 110, vs: { inf: 0.35, light: 1, heavy: 1, bldg: 1 } },                                  // T-90: 125 mm 2A46
  gun125a:     { range: 40, dmg: 82, cd: 46, kind: 'shell', speed: 120, vs: { inf: 0.35, light: 1, heavy: 1.1, bldg: 1.05 } },                            // T-14 Armata: 125 mm 2A82
  bmp100:      { range: 34, dmg: 40, cd: 70, kind: 'shell', speed: 80, splash: 3, vs: { inf: 0.8, light: 1, heavy: 0.6, bldg: 1 } },                      // BMP-3: 100 mm low-pressure gun
  bmp30:       { range: 30, dmg: 8,  cd: 3,  kind: 'hitscan', vs: { inf: 1, light: 0.9, heavy: 0.25, bldg: 0.2, air: 0.5 } },                             // BMP-3: 30 mm 2A72 beside it
  tung_gun:    { range: 40, dmg: 7,  cd: 2,  kind: 'hitscan', vs: { air: 1.1, inf: 0.6, light: 0.6, heavy: 0.15, bldg: 0.1 } },                           // Tunguska: twin 30 mm 2A38
  tung_missile:{ range: 56, dmg: 44, cd: 40, kind: 'missile', speed: 70, intercept: true, vs: { air: 1.6 } },                                             // Tunguska: 9M311 missiles, aircraft only
  tos_rockets: { range: 62, minRange: 16, dmg: 30, cd: 220, kind: 'lob', speed: 44, arc: 12, splash: 6, burst: 6, burstGap: 5, clearsGarrison: true,
                 hazard: { kind: 'fire', r: 5, secs: 5, dps: 16 }, vs: { inf: 1, light: 0.8, heavy: 0.35, bldg: 0.7 } },                                  // TOS-1A: thermobaric rockets, six at a time
  su_missile:  { range: 46, dmg: 95, cd: 20, kind: 'missile', speed: 92, burst: 2, burstGap: 4, intercept: true, splash: 4, vs: { inf: 0.6, light: 0.9, heavy: 0.9, bldg: 0.8, air: 1.5 } },   // Su-27: R-27 and Kh-29
  su57_missile:{ range: 48, dmg: 84, cd: 20, kind: 'missile', speed: 98, burst: 2, burstGap: 4, intercept: true, splash: 4, vs: { inf: 0.5, light: 0.9, heavy: 0.8, bldg: 0.6, air: 1.7 } },   // Su-57: R-77M, best against aircraft
  pantsir:     { range: 50, dmg: 8,  cd: 2,  kind: 'hitscan', vs: { air: 1.3, inf: 1, light: 0.7, heavy: 0.15, bldg: 0.1 } },                             // Pantsir site: twin 30 mm
  bear_minigun:{ range: 34, dmg: 11, cd: 2,  kind: 'hitscan', noJets: true, vs: { inf: 1, light: 0.85, heavy: 0.25, bldg: 0.2, air: 0.9 } },              // IT'S HIM!: the minigun
  bear_laser:  { range: 36, dmg: 62, cd: 24, kind: 'laser', beam: [1, 0.12, 0.08], noJets: true, vs: { inf: 0.5, light: 1, heavy: 1.4, bldg: 1.2 } },      // IT'S HIM!: red lasers from the bear's eyes
  // ---- Europe
  gun120:      { range: 40, dmg: 66, cd: 44, kind: 'shell', speed: 125, vs: { inf: 0.35, light: 1, heavy: 1.05, bldg: 1 } },                              // Leopard 2A6: 120 mm L/55
  gun130:      { range: 42, dmg: 98, cd: 52, kind: 'shell', speed: 125, vs: { inf: 0.35, light: 1, heavy: 1.15, bldg: 1.1 } },                            // KF51 Panther: 130 mm
  mk30:        { range: 32, dmg: 10, cd: 3,  kind: 'hitscan', vs: { inf: 1, light: 0.9, heavy: 0.25, bldg: 0.2, air: 0.5 } },                             // Puma: 30 mm MK 30-2
  spike:       { range: 48, dmg: 118, cd: 140, kind: 'missile', speed: 60, intercept: true, vs: { inf: 0.2, light: 1, heavy: 1.5, bldg: 0.9 } },          // Puma: Spike LR launcher
  milan:       { range: 44, dmg: 70, cd: 90, kind: 'missile', speed: 56, intercept: true, vs: { inf: 0.2, light: 1, heavy: 1.7, bldg: 0.8 } },            // MILAN team
  gepard35:    { range: 44, dmg: 8,  cd: 2,  kind: 'hitscan', vs: { air: 1.2, inf: 0.7, light: 0.7, heavy: 0.15, bldg: 0.1 } },                           // Gepard: twin 35 mm Oerlikon
  pzh155:      { range: 86, minRange: 20, dmg: 115, cd: 120, kind: 'lob', speed: 46, arc: 18, splash: 6.5, vs: { inf: 0.9, light: 1, heavy: 0.6, bldg: 1.1 } },   // PzH 2000: 155 mm L/52
  typhoon_missile: { range: 46, dmg: 100, cd: 20, kind: 'missile', speed: 92, burst: 2, burstGap: 4, intercept: true, splash: 4.5, vs: { inf: 0.7, light: 1, heavy: 1, bldg: 1, air: 1.4 } },   // Eurofighter: multirole load
  aster:       { range: 56, dmg: 50, cd: 30, kind: 'missile', speed: 74, intercept: true, vs: { air: 1.6 } },                                             // FREMM: Aster 15, aircraft only
  hel:         { range: 42, dmg: 14, cd: 5,  kind: 'laser', vs: { inf: 0.9, light: 1, heavy: 0.5, bldg: 0.3, air: 1.7 } },                                // Laser Leopard: high-energy laser
  iris:        { range: 54, dmg: 48, cd: 26, kind: 'missile', speed: 72, intercept: true, vs: { inf: 0.5, light: 1.2, heavy: 1, bldg: 0.3, air: 1.6 } },   // IRIS-T battery
  spear:       { range: 3.4, dmg: 195, cd: 14, kind: 'melee', vs: { inf: 1, light: 1, heavy: 1, bldg: 1 } },                                             // Leonidas: a spear thrust; nothing in the air
  // damage profiles for off-map strikes and lingering hazards (never equipped)
  boatblast: { vs: { inf: 0.6, light: 1.2, heavy: 1.2, bldg: 1 } },     // Drone Boat: a hull full of explosive
  a10gun:    { vs: { inf: 1, light: 1, heavy: 1, bldg: 0.4 } },      // 30 mm depleted-uranium burst
  a10rocket: { vs: { inf: 0.8, light: 1.2, heavy: 1, bldg: 0.6 } },   // armor-piercing rockets
  artillery: { vs: { inf: 1, light: 1, heavy: 0.7, bldg: 1 } },
  fab:       { vs: { inf: 1, light: 1, heavy: 0.6, bldg: 0.8 } },
  nuke:      { vs: { inf: 1, light: 1, heavy: 0.9, bldg: 1.1 } },
  particle:  { vs: { inf: 1, light: 1, heavy: 1, bldg: 1.3 } },
  scud:      { vs: { inf: 1, light: 1, heavy: 0.6, bldg: 0.9 } },
  fire:      { vs: { inf: 1, light: 0.5, heavy: 0.15 } },
  thermal:   { vs: { inf: 1, light: 0.6, heavy: 0.25, bldg: 0.15 } },
  toxin:     { vs: { inf: 1.3, light: 0.45 } },                          // gas: fast against infantry, a decent amount against light armor
  bombvest:  { vs: { inf: 0.7, light: 1, heavy: 1.7, bldg: 1.1 } },     // Suicide Bomber: shaped charge, built to break tanks
  fpvblast:  { vs: { inf: 1.2, light: 1.3, heavy: 0.35, bldg: 0.3, air: 1.2 } }, // FPV drone: small warhead for people, light vehicles and helicopters
  airliner:  { vs: { inf: 1, light: 1, heavy: 0.8, bldg: 1.4 } },       // The Phantom's hijacked 737
  ac130gun:  { vs: { inf: 1, light: 0.7, heavy: 0.15, bldg: 0.1 } },    // AC-130 25 mm rotary cannon
  ac130shell:{ vs: { inf: 0.8, light: 1, heavy: 0.9, bldg: 1 } },       // AC-130 105 mm howitzer
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
  v_pathfinder: { model: 'sniper', name: 'Pathfinder Sniper', faction: 'vanguard', cost: 650, secs: 8, hp: 120, speed: 6, turn: 9, radius: 0.9, cls: 0, sight: 48, armor: 'inf',
                  weapon: 'sniper', infantry: true, canGarrison: true, canCapture: true, stealth: 'still', detector: 26, promo: 'v_pathfinder' },
  v_tank:       { ...TANK, model: 'abrams', name: 'Sentinel Battle Tank', faction: 'vanguard', pdlUpgrade: 'v_pdl' },
  v_avenger:    { model: 'avenger', name: 'Avenger Laser Tank', faction: 'vanguard', cost: 1200, secs: 12, hp: 380, speed: 10, turn: 1.9, radius: 2.0, cls: 1, sight: 40, armor: 'heavy',
                  weapon: 'laser', turret: 4.5, fireMoving: true, dirArmor: true, pdl: 20, detector: 22 },
  v_drone:      { model: 'drone', name: 'Recon Drone', faction: 'vanguard', cost: 400, secs: 6, hp: 90, speed: 24, turn: 3.2, radius: 1.2, cls: 1, sight: 46, armor: 'air', air: true, alt: 18, scout: true, loiter: 11 },   // loiter: circles its station (radius in metres) instead of hovering
  v_comanche:   { model: 'comanche', name: 'Comanche Gunship', faction: 'vanguard', cost: 1500, secs: 14, hp: 260, speed: 16, turn: 2.6, radius: 2.2, cls: 1, sight: 44, armor: 'air',
                  weapon: 'chaingun', weapon2: 'heli_rocket', turret: 5, air: true, alt: 13, fireMoving: true, heli: true },
  v_raptor:     { model: 'raptor', name: 'F-22 Raptor', faction: 'vanguard', cost: 1400, secs: 12, hp: 220, speed: 36, turn: 2.3, radius: 2.4, cls: 1, sight: 40, armor: 'air',
                  weapon: 'raptor_missile', air: true, alt: 20, fireMoving: true, based: true, ammo: 4, reload: 140 },
  // ---- Red Hammer Pact
  r_dozer:      { ...DOZER, name: 'Dozer', faction: 'redhammer' },
  r_truck:      { ...TRUCK, name: 'Supply Truck', faction: 'redhammer' },
  r_conscript:  { ...SQUAD, name: 'Conscript Squad', faction: 'redhammer', cost: 250, hp: 290 },
  r_hacker:     { model: 'hacker', name: 'Hacker Squad', faction: 'redhammer', cost: 600, secs: 8, hp: 100, speed: 5.5, turn: 9, radius: 0.9, cls: 0, sight: 24, armor: 'inf',
                  infantry: true, canCapture: true, deploy: { income: 6, every: 20 } },
  r_scout:      { model: 'scoutcar', name: 'Scout Car', faction: 'redhammer', cost: 450, secs: 6, hp: 170, speed: 18, turn: 3.0, radius: 1.6, cls: 1, sight: 42, armor: 'light',
                  weapon: 'tech_mg', turret: 4.5, fireMoving: true, scout: true },
  r_tank:       { ...TANK, model: 'battlemaster', name: 'Battlemaster Tank', faction: 'redhammer', cost: 750, hp: 470, nuke: true },
  r_overlord:   { model: 'overlord', name: 'Overlord Heavy Tank', faction: 'redhammer', cost: 2000, secs: 18, hp: 1100, speed: 6, turn: 1.2, radius: 2.7, cls: 1, sight: 36, armor: 'heavy',
                  weapon: 'dual_cannon', turret: 2.2, fireMoving: true, dirArmor: true, tank: true, nuke: true,
                  hardpoints: { gatling: { name: 'Gatling Cannon', cost: 500, secs: 8, weapon: 'gatling' }, bunker: { name: 'Battle Bunker', cost: 400, secs: 8, capacity: 1 } } },
  r_inferno:    { model: 'inferno', name: 'Inferno Cannon', faction: 'redhammer', cost: 850, secs: 12, hp: 240, speed: 7, turn: 1.6, radius: 1.9, cls: 1, sight: 30, armor: 'light', weapon: 'inferno', thermo: true },
  r_mig:        { model: 'j11', name: 'J-11 Fighter', faction: 'redhammer', cost: 1200, secs: 12, hp: 200, speed: 34, turn: 2.2, radius: 2.4, cls: 1, sight: 40, armor: 'air',
                  weapon: 'mig_missile', air: true, alt: 20, fireMoving: true, based: true, ammo: 2, reload: 120, thermo: true },
  r_hind:       { model: 'z10', name: 'Z-10 Gunship', faction: 'redhammer', cost: 1500, secs: 14, hp: 340, speed: 14, turn: 2.2, radius: 2.4, cls: 1, sight: 42, armor: 'air',
                  weapon: 'chaingun', weapon2: 'heli_rocket', turret: 5, air: true, alt: 13, fireMoving: true, heli: true },
  // ---- general-only units (see GENERALS)
  v_f15:        { model: 'f15e', name: 'F-15E Strike Eagle', faction: 'vanguard', cost: 1600, secs: 13, hp: 240, speed: 34, turn: 2.1, radius: 2.5, cls: 1, sight: 40, armor: 'air',
                  weapon: 'bunker_bomb', air: true, alt: 20, fireMoving: true, based: true, ammo: 2, reload: 130 },
  v_lav:        { model: 'lav25', name: 'LAV-25', faction: 'vanguard', cost: 800, secs: 9, hp: 380, speed: 13, turn: 2.8, radius: 2.0, cls: 1, sight: 34, armor: 'light',
                  weapon: 'lav_gun', upWeapon: { v_tow: 'tow' }, turret: 4, fireMoving: true, amph: true },
  s_bomber:     { model: 'bomber', name: 'Suicide Bomber', faction: 'sandstorm', cost: 300, secs: 5, hp: 70, speed: 9.5, turn: 9, radius: 0.8, cls: 0, sight: 26, armor: 'inf',
                  weapon: 'vest', infantry: true, stealth: 'still', suicide: { r: 7, dmg: 270, w: 'bombvest', charge: { r: 24, mult: 1.6 } } },   // sprints the last 24 m
  s_fpv:        { model: 'fpv', name: 'FPV Attack Drone', faction: 'sandstorm', cost: 350, secs: 6, hp: 40, speed: 24, turn: 4, radius: 1.0, cls: 1, sight: 34, armor: 'air',
                  weapon: 'fpv_dive', air: true, alt: 8, fireMoving: true, suicide: { r: 5, dmg: 210, w: 'fpvblast', dive: true } },
  s_scudtruck:  { model: 'scudtel', name: 'Scud Launcher', faction: 'sandstorm', cost: 1500, secs: 16, hp: 260, speed: 7, turn: 1.4, radius: 2.8, cls: 1, sight: 30, armor: 'light',
                  weapon: 'scud_missile' },
  // mounts: one entry per weapon, in order: where it sits on the hull (x metres forward of centre, y metres up), its barrel
  // length, and the arc it can swing through either side of its own axis (dir: 0 = facing the bow, PI = facing the stern).
  // Shots start at the mount. A weapon whose target is outside its arc holds fire; a stationary ship turns to bring it to bear.
  // ---- ships: built at the shipyard. ship = sails on water only and keeps off the shore (a boat 6 m, a `warship` 10 m);
  // `beach` = may touch the shore (landing craft). transport = carries `squads` infantry squads or `vehicles` ground vehicles, never both.
  v_rhib:       { model: 'rhib', name: 'RHIB', faction: 'vanguard', cost: 500, secs: 6, hp: 180, speed: 24, turn: 2.6, radius: 2.2, cls: 1, sight: 44, armor: 'light',
                  weapon: 'rhib_mg', turret: 5, fireMoving: true, ship: true, scout: true },
  v_frigate:    { model: 'frigate', name: 'Frigate', faction: 'vanguard', cost: 2200, secs: 20, hp: 1000, speed: 12, turn: 1.0, radius: 8, cls: 1, sight: 52, armor: 'heavy',
                  weapon: 'naval_gun', weapon2: 'naval_laser', turret: 2.4, fireMoving: true, ship: true, warship: true, pdl: 10, pdlR: 26, detector: 30,   // pdl: ticks between missiles shot down; pdlR: how far out it reaches
                  mounts: [{ x: 10.6, y: 2.6, len: 3.4, arc: 2.3 }, { x: 3.3, y: 8.3, len: 0.6, arc: Math.PI }], pdlAt: 1 },   // deck gun on the forecastle (cannot fire across the bridge); laser on the mast top, all round. pdlAt: the mount the missile defense fires from
  v_mkv:        { model: 'mkv', name: 'Mk V Combat Boat', faction: 'vanguard', cost: 1400, secs: 12, hp: 420, speed: 20, turn: 2.0, radius: 3.8, cls: 1, sight: 44, armor: 'light',
                  weapon: 'minigun2', weapon2: 'mk19', weapon3: 'hellfire', turret: 4, fireMoving: true, ship: true },
  v_seal:       { model: 'seal', name: 'SEAL Team', faction: 'vanguard', cost: 900, secs: 10, hp: 320, speed: 6.5, turn: 9, radius: 1.0, cls: 0, sight: 44, armor: 'inf',
                  weapon: 'seal_rifle', weapon2: 'seal_sniper', weapon3: 'seal_gl', infantry: true, canGarrison: true, canCapture: true },
  r_lcraft:     { model: 'lcraft', name: 'Landing Craft', faction: 'redhammer', cost: 700, secs: 10, hp: 520, speed: 13, turn: 1.6, radius: 4.2, cls: 1, sight: 34, armor: 'light',
                  ship: true, beach: true, transport: { squads: 4, vehicles: 1 } },
  r_corvette:   { model: 'corvette', name: 'Corvette', faction: 'redhammer', cost: 1900, secs: 18, hp: 900, speed: 13, turn: 1.1, radius: 7, cls: 1, sight: 50, armor: 'heavy',
                  weapon: 'corvette_gun', weapon2: 'ciws', turret: 2.6, fireMoving: true, ship: true, warship: true, pdl: 18, pdlR: 24, pdlGun: true,
                  mounts: [{ x: 7.6, y: 2.1, len: 2.6, arc: 2.3 }, { x: -5.6, y: 3.0, len: 1.0, arc: 2.5, dir: Math.PI }], pdlAt: 1 },   // deck cannon forward; minigun aft of the funnel, blind dead ahead
  s_mboat:      { model: 'mboat', name: 'Missile Boat', faction: 'sandstorm', cost: 1500, secs: 14, hp: 520, speed: 15, turn: 1.6, radius: 4.2, cls: 1, sight: 46, armor: 'light',
                  weapon: 'boat_rockets', turret: 2.2, ship: true, noCloak: true, mounts: [{ x: 0.2, y: 2.4, len: 1.8, arc: Math.PI }] },   // noCloak: no general hides it
  s_dboat:      { model: 'dboat', name: 'Drone Boat', faction: 'sandstorm', cost: 400, secs: 6, hp: 150, speed: 22, turn: 2.8, radius: 1.8, cls: 1, sight: 30, armor: 'light',
                  weapon: 'vest', ship: true, suicide: { r: 8, dmg: 400, w: 'boatblast', charge: { r: 40, mult: 1.5 } } },   // rams ships; next to the shore it goes off as close as it can get
  // ---- heroes: trained at the Barracks, one alive per side, always cloaked (also while moving)
  v_hero:       { model: 'vet', name: 'Disabled Vet', faction: 'vanguard', cost: 2500, secs: 20, hp: 400, speed: 7, turn: 9, radius: 0.9, cls: 0, sight: 40, armor: 'inf',
                  weapon: 'm60', weapon2: 'vet_rpg', infantry: true, hero: true, stealth: 'always', needs: 'v_factory' },
  r_hero:       { model: 'fookmie', name: 'Fook Mie', faction: 'redhammer', cost: 2500, secs: 20, hp: 300, speed: 7, turn: 9, radius: 0.9, cls: 0, sight: 42, armor: 'inf',
                  weapon: 'phone', infantry: true, hero: true, stealth: 'always', needs: 'r_factory', modes: ['recruit', 'resign'] },
  s_hero:       { model: 'phantom', name: 'The Phantom', faction: 'sandstorm', cost: 2500, secs: 20, hp: 200, speed: 7, turn: 9, radius: 0.9, cls: 0, sight: 46, armor: 'inf',
                  weapon: 'phantom_call', infantry: true, hero: true, stealth: 'always', needs: 's_factory' },
  s_carbomb:    { model: 'car', name: 'Car Bomb', faction: 'sandstorm', cost: 400, secs: 1, hp: 120, speed: 20, turn: 3.2, radius: 1.6, cls: 1, sight: 20, armor: 'light',
                  weapon: 'vest', suicide: { r: 8, dmg: 350, w: 'bombvest' } },   // only ever called in by The Phantom
  // ---- Russia. `placeholder: true`: which units the faction has, and their numbers, stand in until the player's own list
  // arrives. Each one is modelled on the real machine named in its comment (models in render/modelFactory.js).
  u_dozer:      { ...DOZER, name: 'Dozer', faction: 'ursa', placeholder: true },
  u_truck:      { ...TRUCK, name: 'Supply Truck', faction: 'ursa', placeholder: true },
  u_rifle:      { ...SQUAD, model: 'motorrifle', name: 'Motor Rifle Squad', faction: 'ursa', cost: 280, hp: 270, placeholder: true },
  u_rpg:        { model: 'rpg7', name: 'RPG Team', faction: 'ursa', cost: 320, secs: 6, hp: 170, speed: 6, turn: 9, radius: 0.9, cls: 0, sight: 36, armor: 'inf', weapon: 'rpg', infantry: true, canGarrison: true, canCapture: true, placeholder: true },
  u_convict:    { ...SQUAD, model: 'convict', name: 'Convict Squad', faction: 'ursa', cost: 160, hp: 170, secs: 4, placeholder: true },                              // Wagner Group only
  u_tank:       { ...TANK, model: 't90', name: 'T-90', faction: 'ursa', cost: 800, hp: 500, weapon: 'gun125', placeholder: true },
  u_bmp:        { model: 'bmp3', name: 'BMP-3', faction: 'ursa', cost: 900, secs: 9, hp: 360, speed: 12, turn: 2.6, radius: 2.0, cls: 1, sight: 34, armor: 'light',
                  weapon: 'bmp100', weapon2: 'bmp30', turret: 4, fireMoving: true, placeholder: true },
  u_tunguska:   { model: 'tunguska', name: '2K22 Tunguska', faction: 'ursa', cost: 1000, secs: 11, hp: 340, speed: 10, turn: 2.0, radius: 2.0, cls: 1, sight: 44, armor: 'light',
                  weapon: 'tung_gun', weapon2: 'tung_missile', turret: 4.5, fireMoving: true, detector: 22, placeholder: true },
  u_tos:        { model: 'tos1', name: 'TOS-1A', faction: 'ursa', cost: 1100, secs: 13, hp: 420, speed: 7, turn: 1.5, radius: 2.1, cls: 1, sight: 30, armor: 'heavy', weapon: 'tos_rockets', dirArmor: true, placeholder: true },
  u_su27:       { model: 'su27', name: 'Su-27', faction: 'ursa', cost: 1300, secs: 12, hp: 210, speed: 34, turn: 2.2, radius: 2.4, cls: 1, sight: 40, armor: 'air',
                  weapon: 'su_missile', air: true, alt: 20, fireMoving: true, based: true, ammo: 2, reload: 120, placeholder: true },
  u_ka52:       { model: 'ka52', name: 'Ka-52', faction: 'ursa', cost: 1500, secs: 14, hp: 330, speed: 15, turn: 2.3, radius: 2.4, cls: 1, sight: 42, armor: 'air',
                  weapon: 'chaingun', weapon2: 'heli_rocket', turret: 5, air: true, alt: 13, fireMoving: true, heli: true, placeholder: true },
  u_corvette:   { model: 'stereg', name: 'Steregushchiy Corvette', faction: 'ursa', cost: 1900, secs: 18, hp: 900, speed: 13, turn: 1.1, radius: 7, cls: 1, sight: 50, armor: 'heavy',
                  weapon: 'corvette_gun', weapon2: 'ciws', turret: 2.6, fireMoving: true, ship: true, warship: true, pdl: 18, pdlR: 24, pdlGun: true,
                  mounts: [{ x: 8.2, y: 2.2, len: 2.8, arc: 2.3 }, { x: -3.4, y: 3.6, len: 1.0, arc: 2.5, dir: Math.PI }], pdlAt: 1, placeholder: true },
  u_armata:     { ...TANK, model: 't14', name: 'T-14 Armata', faction: 'ursa', cost: 1650, secs: 14, hp: 640, speed: 9.5, radius: 2.2, weapon: 'gun125a', pdl: 44, placeholder: true },   // Vacation Command Group; pdl: its active protection
  u_su57:       { model: 'su57', name: 'Su-57', faction: 'ursa', cost: 1600, secs: 13, hp: 230, speed: 37, turn: 2.3, radius: 2.5, cls: 1, sight: 40, armor: 'air',
                  weapon: 'su57_missile', air: true, alt: 20, fireMoving: true, based: true, ammo: 4, reload: 140, placeholder: true },                               // Vacation Command Group
  u_hero:       { model: 'bearrider', name: 'IT’S HIM!', faction: 'ursa', cost: 2500, secs: 20, hp: 650, speed: 10, turn: 6, radius: 1.3, cls: 0, sight: 42, armor: 'inf',
                  weapon: 'bear_minigun', weapon2: 'bear_laser', infantry: true, hero: true, stealth: 'always', needs: 'u_factory' },
  // ---- Europe (placeholders in the same sense)
  e_dozer:      { ...DOZER, name: 'Dozer', faction: 'aegis', placeholder: true },
  e_truck:      { ...TRUCK, name: 'Supply Truck', faction: 'aegis', placeholder: true },
  e_rifle:      { ...SQUAD, model: 'legion', name: 'Legion Squad', faction: 'aegis', cost: 340, hp: 260, placeholder: true },
  e_milan:      { model: 'milanteam', name: 'MILAN Team', faction: 'aegis', cost: 430, secs: 7, hp: 170, speed: 6, turn: 9, radius: 0.9, cls: 0, sight: 38, armor: 'inf', weapon: 'milan', infantry: true, canGarrison: true, canCapture: true, placeholder: true },
  e_tank:       { ...TANK, model: 'leopard2', name: 'Leopard 2A6', faction: 'aegis', cost: 1000, hp: 540, weapon: 'gun120', pdlUpgrade: 'e_aps', placeholder: true },
  e_puma:       { model: 'puma', name: 'Puma', faction: 'aegis', cost: 950, secs: 10, hp: 420, speed: 12, turn: 2.5, radius: 2.0, cls: 1, sight: 36, armor: 'light',
                  weapon: 'mk30', weapon2: 'spike', turret: 4, fireMoving: true, placeholder: true },
  e_gepard:     { model: 'gepard', name: 'Flakpanzer Gepard', faction: 'aegis', cost: 950, secs: 11, hp: 360, speed: 10, turn: 2.0, radius: 2.0, cls: 1, sight: 44, armor: 'light',
                  weapon: 'gepard35', turret: 4.8, fireMoving: true, detector: 24, placeholder: true },
  e_pzh:        { model: 'pzh2000', name: 'PzH 2000', faction: 'aegis', cost: 1100, secs: 13, hp: 360, speed: 8, turn: 1.5, radius: 2.2, cls: 1, sight: 30, armor: 'light', weapon: 'pzh155', turret: 1.6, placeholder: true },
  e_typhoon:    { model: 'typhoon', name: 'Eurofighter Typhoon', faction: 'aegis', cost: 1500, secs: 13, hp: 230, speed: 35, turn: 2.3, radius: 2.4, cls: 1, sight: 40, armor: 'air',
                  weapon: 'typhoon_missile', air: true, alt: 20, fireMoving: true, based: true, ammo: 2, reload: 125, placeholder: true },
  e_tiger:      { model: 'tiger', name: 'Tiger', faction: 'aegis', cost: 1500, secs: 14, hp: 280, speed: 16, turn: 2.6, radius: 2.2, cls: 1, sight: 44, armor: 'air',
                  weapon: 'chaingun', weapon2: 'heli_rocket', turret: 5, air: true, alt: 13, fireMoving: true, heli: true, placeholder: true },
  e_fremm:      { model: 'fremm', name: 'FREMM Frigate', faction: 'aegis', cost: 2100, secs: 20, hp: 950, speed: 12, turn: 1.0, radius: 8, cls: 1, sight: 52, armor: 'heavy',
                  weapon: 'corvette_gun', weapon2: 'aster', turret: 2.6, fireMoving: true, ship: true, warship: true, pdl: 14, pdlR: 26, detector: 30,
                  mounts: [{ x: 10.4, y: 2.4, len: 2.8, arc: 2.3 }, { x: 6.2, y: 2.2, len: 0.4, arc: Math.PI }], pdlAt: 1, placeholder: true },
  e_laserleo:   { model: 'laserleo', name: 'Laser Leopard', faction: 'aegis', cost: 1300, secs: 12, hp: 440, speed: 10, turn: 1.9, radius: 2.0, cls: 1, sight: 40, armor: 'heavy',
                  weapon: 'hel', turret: 4.5, fireMoving: true, dirArmor: true, pdl: 18, detector: 22, placeholder: true },                                         // Laser general
  e_panther:    { ...TANK, model: 'kf51', name: 'KF51 Panther', faction: 'aegis', cost: 1700, secs: 16, hp: 820, speed: 8.5, radius: 2.3, weapon: 'gun130', pdlUpgrade: 'e_aps', placeholder: true },   // Panzer general
  // berserk: charges every enemy in sight with no leash and is never pulled back
  e_hero:       { model: 'leonidas', name: 'Leonidas', faction: 'aegis', cost: 2500, secs: 20, hp: 1300, speed: 9, turn: 9, radius: 1.0, cls: 0, sight: 44, armor: 'inf',
                  weapon: 'spear', infantry: true, hero: true, berserk: true, stealth: 'always', needs: 'e_factory' },
  // ---- Sandstorm Front
  s_worker:     { model: 'worker', name: 'Worker', faction: 'sandstorm', cost: 250, secs: 4, hp: 110, speed: 6.5, turn: 9, radius: 0.9, cls: 0, sight: 28, armor: 'inf', infantry: true, builder: true },
  s_truck:      { ...TRUCK, name: 'Supply Pickup', faction: 'sandstorm' },
  s_guerrilla:  { ...SQUAD, name: 'Guerrilla Squad', faction: 'sandstorm', cost: 225 },
  s_rpg:        { model: 'rpg', name: 'RPG Trooper', faction: 'sandstorm', cost: 300, secs: 6, hp: 160, speed: 6, turn: 9, radius: 0.9, cls: 0, sight: 36, armor: 'inf', weapon: 'rpg', infantry: true, canGarrison: true, canCapture: true },
  s_saboteur:   { model: 'saboteur', name: 'Saboteur', faction: 'sandstorm', cost: 700, secs: 10, hp: 90, speed: 7, turn: 9, radius: 0.9, cls: 0, sight: 30, armor: 'inf', infantry: true, stealth: 'always', infiltrator: true, promo: 's_saboteur' },
  s_technical:  { model: 'technical', name: 'Technical Pickup', faction: 'sandstorm', cost: 450, secs: 6, hp: 150, speed: 18, turn: 3.2, radius: 1.6, cls: 1, sight: 38, armor: 'light',
                  weapon: 'tech_mg', turret: 4.5, fireMoving: true, salvage: true, salvageWeapons: ['tech_mg', 'tech_hmg', 'tech_twin'] },   // always a machine gun; salvage fits a heavier one
  s_buggy:      { model: 'buggy', name: 'Rocket Buggy', faction: 'sandstorm', cost: 900, secs: 8, hp: 160, speed: 17, turn: 3.2, radius: 1.6, cls: 1, sight: 40, armor: 'light', weapon: 'rocket', turret: 4.0, fireMoving: true, salvage: true },
  s_scorpion:   { model: 'scorpion', name: 'Scorpion Light Tank', faction: 'sandstorm', cost: 700, secs: 9, hp: 320, speed: 11, turn: 2.2, radius: 1.8, cls: 1, sight: 36, armor: 'heavy',
                  weapon: 'toxin_shell', weapon2: 'scorp_rocket', turret: 3.6, fireMoving: true, dirArmor: true, salvage: true },
  s_tractor:    { model: 'tractor', name: 'Toxin Tractor', faction: 'sandstorm', cost: 600, secs: 8, hp: 300, speed: 9, turn: 2.4, radius: 1.7, cls: 1, sight: 30, armor: 'light', weapon: 'toxin_spray', turret: 4, fireMoving: true, salvage: true },
};

// ---------------------------------------------------------------- buildings
// w,h in nav cells. power: + produces, - consumes. role: generic engine role.
const CC      = { model: 'cc', role: 'cc', cost: 2000, secs: 30, hp: 3000, w: 10, h: 10, power: 0, sight: 46 };
const POWER   = { model: 'power', role: 'power', cost: 800, secs: 8, hp: 800, w: 6, h: 6, power: 5, sight: 24 };
const SUPPLY  = { model: 'supply', role: 'supply', cost: 1500, secs: 10, hp: 1500, w: 8, h: 6, power: -1, sight: 28, exitEast: true };
const BARRACKS= { model: 'barracks', role: 'barracks', cost: 500, secs: 8, hp: 1000, w: 6, h: 6, power: 0, sight: 28 };
// repair: vehicles within this many metres of the footprint are repaired while out of combat
const FACTORY = { model: 'factory', role: 'factory', cost: 2000, secs: 14, hp: 2000, w: 8, h: 8, power: -1, sight: 28, repair: 12 };
// 40 m x 28 m. Two 36 m runways side by side along the south half; hangars and the helipad to the north.
// `layout` is in metres from the building's centre (x east, z south): `hangars` gives each hangar's position and the
// way its door faces; `spots` are where jets park, inside.
const AIRFIELD= { model: 'airfield', role: 'airfield', cost: 1800, secs: 14, hp: 2000, w: 20, h: 14, power: -1, sight: 30, pads: 4, runway: true };
// Shipyard: `shore` = it must stand half on land and half on water, and it turns to face the sea. It repairs ships near it.
const SHIPYARD = { model: 'shipyard', role: 'shipyard', cost: 2000, secs: 16, hp: 2200, w: 10, h: 10, power: -1, sight: 34, shore: true, repair: 18 };
const RUNWAYS = [4, 10.4];
// Jets park INSIDE their hangars (`spots`), nose toward the open door; `aprons` is the point outside each door that a
// jet rolls to first on its way to the runway, and last on its way back in. HANGAR: the building's width, depth and wall height.
export const HANGAR = { w: 7.2, d: 8.2, h: 3.4 };
const US_FIELD = { runways: RUNWAYS, helipad: [14.6, -8.2], tower: [10.6, -12.4],        // two hangars on the left, two along the top
  hangars: [[-15.5, -10.1, 'e'], [-15.5, -2.9, 'e'], [-2.2, -9.6, 's'], [5.1, -9.6, 's']], spots: [[-15.0, -10.1], [-15.0, -2.9], [-2.2, -9.1], [5.1, -9.1]],
  aprons: [[-8.8, -10.1], [-8.8, -2.9], [-2.2, -3], [5.1, -3]] };
const CN_FIELD = { runways: RUNWAYS, helipad: [14.6, -8.2], tower: [-18.4, -3],          // four hangars along the top
  hangars: [[-15.2, -9.6, 's'], [-7.9, -9.6, 's'], [-0.6, -9.6, 's'], [6.7, -9.6, 's']], spots: [[-15.2, -9.1], [-7.9, -9.1], [-0.6, -9.1], [6.7, -9.1]],
  aprons: [[-15.2, -3], [-7.9, -3], [-0.6, -3], [6.7, -3]] };

export const BLDGS = {
  v_cc:       { ...CC, name: 'Command Center', faction: 'vanguard', trains: ['v_dozer', 'v_drone'] },
  v_power:    { ...POWER, name: 'Cold Fusion Reactor', faction: 'vanguard' },
  v_supply:   { ...SUPPLY, name: 'Supply Center', faction: 'vanguard', trains: ['v_chinook'], needs: 'v_power' },
  v_barracks: { ...BARRACKS, name: 'Barracks', faction: 'vanguard', trains: ['v_ranger', 'v_pathfinder', 'v_hero'] },
  v_factory:  { ...FACTORY, name: 'War Factory', faction: 'vanguard', trains: ['v_tank', 'v_avenger'], upgrades: ['v_pdl'], needs: 'v_supply' },
  v_airfield: { ...AIRFIELD, layout: US_FIELD, name: 'Air Field', faction: 'vanguard', trains: ['v_raptor', 'v_comanche'], needs: 'v_factory' },
  v_shipyard: { ...SHIPYARD, name: 'Naval Yard', faction: 'vanguard', trains: ['v_rhib', 'v_frigate'], needs: 'v_factory' },
  v_patriot:  { model: 'patriot', role: 'defense', name: 'Patriot Battery', faction: 'vanguard', cost: 1000, secs: 8, hp: 1000, w: 4, h: 4, power: -3, sight: 50, weapon: 'patriot', turret: 3.0, detector: 30, needs: 'v_power' },
  v_uplink:   { model: 'uplink', role: 'income', name: 'Satellite Uplink', faction: 'vanguard', cost: 2500, secs: 20, hp: 1200, w: 6, h: 6, power: -3, sight: 30, income: { amt: 25, every: 40 }, needs: 'v_factory' },

  r_cc:       { ...CC, name: 'Command Center', faction: 'redhammer', trains: ['r_dozer', 'r_scout'] },
  r_power:    { ...POWER, name: 'Nuclear Reactor', faction: 'redhammer' },
  r_supply:   { ...SUPPLY, name: 'Supply Center', faction: 'redhammer', trains: ['r_truck'], needs: 'r_power' },
  r_barracks: { ...BARRACKS, name: 'Barracks', faction: 'redhammer', trains: ['r_conscript', 'r_hacker', 'r_hero'] },
  r_factory:  { ...FACTORY, name: 'War Factory', faction: 'redhammer', trains: ['r_tank', 'r_inferno', 'r_overlord'], upgrades: ['r_nuke', 'r_thermo'], needs: 'r_supply' },
  r_airfield: { ...AIRFIELD, layout: CN_FIELD, name: 'Airfield', faction: 'redhammer', trains: ['r_mig', 'r_hind'], needs: 'r_factory' },
  r_shipyard: { ...SHIPYARD, name: 'Shipyard', faction: 'redhammer', trains: ['r_lcraft', 'r_corvette'], needs: 'r_factory' },
  r_gatling:  { model: 'gatling', role: 'defense', name: 'Gatling Tower', faction: 'redhammer', cost: 900, secs: 8, hp: 1100, w: 4, h: 4, power: -2, sight: 46, weapon: 'gatling', turret: 4.0, detector: 28, needs: 'r_power' },

  s_cc:       { ...CC, name: 'Command Hideout', faction: 'sandstorm', trains: ['s_worker'] },
  s_supply:   { ...SUPPLY, name: 'Supply Stash', faction: 'sandstorm', power: 0, trains: ['s_truck'] },
  s_barracks: { ...BARRACKS, name: 'Barracks', faction: 'sandstorm', trains: ['s_guerrilla', 's_rpg', 's_saboteur', 's_hero'] },
  s_factory:  { ...FACTORY, name: 'Arms Dealer', faction: 'sandstorm', power: 0, cost: 1500, trains: ['s_technical', 's_scorpion', 's_tractor', 's_buggy'], needs: 's_supply' },
  s_shipyard: { ...SHIPYARD, name: 'Smuggler’s Dock', faction: 'sandstorm', power: 0, cost: 1700, trains: ['s_dboat', 's_mboat'], needs: 's_factory' },
  s_stinger:  { model: 'stinger', role: 'defense', name: 'Stinger Site', faction: 'sandstorm', cost: 900, secs: 8, hp: 900, w: 4, h: 4, power: 0, sight: 48, weapon: 'stinger', turret: 3.2, detector: 28, needs: 's_barracks' },
  s_tunnel:   { model: 'tunnel', role: 'tunnel', name: 'Tunnel Network', faction: 'sandstorm', cost: 800, secs: 8, hp: 1000, w: 4, h: 4, power: 0, sight: 32, tunnel: true, repair: 10, needs: 's_barracks' },
  // Superweapons: build as many as you can pay for and power. Each is announced to both players and runs its own countdown from completion.
  v_particle: { model: 'particle', role: 'super', name: 'Particle Cannon', faction: 'vanguard', cost: 5000, secs: 45, hp: 2400, w: 8, h: 8, power: -10, sight: 30, needs: 'v_factory', superPower: 'particle' },
  r_silo:     { model: 'silo', role: 'super', name: 'Nuclear Missile Silo', faction: 'redhammer', cost: 5000, secs: 45, hp: 2600, w: 8, h: 8, power: -10, sight: 30, needs: 'r_factory', superPower: 'nuke' },
  s_scud:     { model: 'scud', role: 'super', name: 'Scud Storm', faction: 'sandstorm', cost: 5000, secs: 45, hp: 2200, w: 8, h: 8, power: 0, sight: 30, needs: 's_factory', superPower: 'scud' },
  s_market:   { model: 'market', role: 'income', name: 'Black Market', faction: 'sandstorm', cost: 2500, secs: 20, hp: 1200, w: 6, h: 6, power: 0, sight: 30, income: { amt: 25, every: 40 }, needs: 's_factory' },

  // ---- Russia and Europe: building models are the existing ones in the faction's paint
  u_cc:       { ...CC, name: 'Command Center', faction: 'ursa', trains: ['u_dozer'] },
  u_power:    { ...POWER, name: 'Reactor', faction: 'ursa' },
  u_supply:   { ...SUPPLY, name: 'Supply Center', faction: 'ursa', trains: ['u_truck'], needs: 'u_power' },
  u_barracks: { ...BARRACKS, name: 'Barracks', faction: 'ursa', trains: ['u_rifle', 'u_rpg', 'u_hero'] },
  u_factory:  { ...FACTORY, name: 'War Factory', faction: 'ursa', trains: ['u_tank', 'u_bmp', 'u_tunguska', 'u_tos'], needs: 'u_supply' },
  u_airfield: { ...AIRFIELD, layout: CN_FIELD, name: 'Airfield', faction: 'ursa', trains: ['u_su27', 'u_ka52'], needs: 'u_factory' },
  u_shipyard: { ...SHIPYARD, name: 'Naval Base', faction: 'ursa', trains: ['u_corvette'], needs: 'u_factory' },
  u_pantsir:  { model: 'gatling', role: 'defense', name: 'Pantsir Site', faction: 'ursa', cost: 950, secs: 8, hp: 1050, w: 4, h: 4, power: -2, sight: 48, weapon: 'pantsir', turret: 4.0, detector: 28, needs: 'u_power' },
  u_iskander: { model: 'scud', role: 'super', name: 'Iskander Battery', faction: 'ursa', cost: 5000, secs: 45, hp: 2400, w: 8, h: 8, power: -10, sight: 30, needs: 'u_factory', superPower: 'iskander' },
  e_cc:       { ...CC, name: 'Command Center', faction: 'aegis', trains: ['e_dozer'] },
  e_power:    { ...POWER, name: 'Fusion Plant', faction: 'aegis' },
  e_supply:   { ...SUPPLY, name: 'Supply Center', faction: 'aegis', trains: ['e_truck'], needs: 'e_power' },
  e_barracks: { ...BARRACKS, name: 'Barracks', faction: 'aegis', trains: ['e_rifle', 'e_milan', 'e_hero'] },
  e_factory:  { ...FACTORY, name: 'War Factory', faction: 'aegis', trains: ['e_tank', 'e_puma', 'e_gepard', 'e_pzh'], needs: 'e_supply' },
  e_airfield: { ...AIRFIELD, layout: US_FIELD, name: 'Air Base', faction: 'aegis', trains: ['e_typhoon', 'e_tiger'], needs: 'e_factory' },
  e_shipyard: { ...SHIPYARD, name: 'Dockyard', faction: 'aegis', trains: ['e_fremm'], needs: 'e_factory' },
  e_iris:     { model: 'patriot', role: 'defense', name: 'IRIS-T Battery', faction: 'aegis', cost: 1050, secs: 8, hp: 1000, w: 4, h: 4, power: -3, sight: 50, weapon: 'iris', turret: 3.0, detector: 30, needs: 'e_power' },
  e_lance:    { model: 'particle', role: 'super', name: 'Orbital Lance', faction: 'aegis', cost: 5000, secs: 45, hp: 2400, w: 8, h: 8, power: -10, sight: 30, needs: 'e_factory', superPower: 'lance' },

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
  e_aps:    { name: 'Laser Point Defense', cost: 1500, secs: 20, desc: 'Leopard 2 and Panther tanks shoot down incoming rockets and missiles.' },
  v_tow:    { name: 'TOW Missiles', cost: 1200, secs: 18, desc: 'LAV-25s add a TOW launcher: heavy damage to tanks at long range.' },
  s_anthrax: { name: 'Anthrax Beta', cost: 1500, secs: 20, desc: 'Every toxin cloud you make does 50% more damage.' },
  r_thermo: { name: 'Thermobaric Shells', cost: 1500, secs: 20, desc: 'Inferno Cannon and MiG firestorms are larger and last longer.' },
};

// ---------------------------------------------------------------- support powers
export const POWERS = {
  a10:     { name: 'A-10 Strafing Run', cd: 150, radius: 24, shape: 'line', desc: 'A-10 dives in: a 30 mm cannon burst along a 48 m line, then six armor-piercing rockets.',
             gun: { dmg: 80, r: 4.5, step: 3.5 }, rockets: { n: 6, dmg: 270, r: 7, flight: 16, seek: 7 } },
  barrage: { name: 'Artillery Barrage', cd: 150, radius: 16, desc: '12 high-explosive shells fall on the target zone.' },
  fab:     { name: 'Fuel-Air Bomb', cd: 240, radius: 24, desc: 'Massive shockwave, then lingering heat that burns infantry, including garrisons.' },
  ambush:  { name: 'Ambush Squad', cd: 180, radius: 8, desc: '6 stealthed guerrillas appear at the target.' },
  toxinbomb: { name: 'Toxin Bomb', cd: 210, radius: 15, desc: 'Green cloud for 20 s: kills infantry in the open and inside buildings, and hurts light vehicles.' },
  b2: { name: 'B-2 Carpet Bomb', cd: 240, radius: 14, line: 60, n: 10, dmg: 190, r: 8, desc: 'A B-2 Spirit lays ten bombs along a 60 m line.' },
  paradrop: { name: 'Paratrooper Drop', cd: 240, radius: 9, n: 5, unit: 'v_ranger', desc: 'A transport drops 5 Ranger squads at the target.' },
  cashhack: { name: 'Cash Hack', cd: 240, radius: 14, amount: 1500, aim: 'supply', desc: 'Steals up to $1,500 from the enemy. Aim at an enemy supply building you have scouted.' },
  sneaktunnel: { name: 'Sneak Attack', cd: 300, radius: 6, delay: 5, aim: 'site', desc: 'A Tunnel Network exit breaks ground at the target after 5 s. Needs clear, explored ground.' },
  ac130: { name: 'AC-130 Gunship', cd: 240, radius: 18, reveal: 24, secs: 15, orbit: 44, alt: 30,
           gun: { every: 1, dmg: 10, r: 1.8, spread: 1.2 }, cannon: { every: 26, dmg: 160, r: 6 }, desc: 'A gunship circles the zone for 15 s, raking it with a rotary cannon and a 105 mm howitzer.' },
  // Superweapons. `super` is the building that owns the power; cd is each building's own countdown in seconds.
  particle: { name: 'Particle Cannon', cd: 210, radius: 12, super: 'v_particle', beam: { ticks: 100, every: 2, dmg: 55, r: 6, sweep: 24 }, desc: 'Orbital beam burns along a 24 m line for 5 s.' },
  nuke:     { name: 'Nuclear Missile', cd: 210, radius: 34, super: 'r_silo', flight: 120, dmg: 1400, fallout: { r: 20, secs: 12, dps: 40 }, desc: 'One warhead. Levels everything within 34 m and leaves fallout.' },
  scud:     { name: 'Scud Storm', cd: 210, radius: 24, super: 's_scud', n: 9, dmg: 280, r: 9, toxin: { r: 7, secs: 10, dps: 18 }, desc: 'Nine toxin-tipped missiles rain over a 24 m zone.' },
  // Powers of the two newer factions reuse the strike code of an existing power: `as` names it; the numbers here are their own.
  iskander: { name: 'Iskander Strike', cd: 210, radius: 22, super: 'u_iskander', as: 'scud', n: 6, dmg: 400, r: 9, fire: { r: 7, secs: 8, dps: 18 }, desc: 'Six ballistic missiles fall on a 22 m zone and leave it burning.' },
  lance:    { name: 'Orbital Lance', cd: 210, radius: 12, super: 'e_lance', as: 'particle', beam: { ticks: 100, every: 2, dmg: 55, r: 6, sweep: 24 }, desc: 'A beam from orbit burns along a 24 m line for 5 s.' },
  vdv:      { name: 'VDV Airdrop', cd: 240, radius: 9, as: 'paradrop', n: 5, unit: 'u_rifle', desc: 'A transport drops 5 Motor Rifle squads at the target.' },
  eupara:   { name: 'Airborne Drop', cd: 240, radius: 9, as: 'paradrop', n: 5, unit: 'e_rifle', desc: 'A transport drops 5 Legion squads at the target.' },
  odab:     { name: 'ODAB Fuel-Air Bomb', cd: 240, radius: 24, as: 'fab', plane: 'bomber', desc: 'Massive shockwave, then lingering heat that burns infantry, including garrisons.' },
  storm:    { name: 'Storm Shadow Strike', cd: 240, radius: 14, as: 'b2', plane: 'bomber', line: 60, n: 10, dmg: 190, r: 8, desc: 'Ten cruise-missile warheads fall along a 60 m line.' },
};

// The Phantom's three calls. airliner: metres per tick, start distance, blast. ambush: squads that fight for `secs` then vanish.
// car: a Car Bomb unit appears `from` metres short of the target and drives in; it vanishes if it has not hit after `secs`.
export const HERO_CALL = {
  airliner: { speed: 3.2, lead: 220, alt: 70, r: 14, dmg: 600, fire: { r: 8, secs: 5, dps: 16 } },
  ambush: { units: ['s_guerrilla', 's_rpg', 's_guerrilla', 's_rpg'], secs: 10 },
  car: { unit: 's_carbomb', from: 30, secs: 15 },
};
export const RESIGN_TICKS = 60;   // a unit Fook Mie talks into resigning stands idle this long, then is gone

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
    build: ['v_power', 'v_barracks', 'v_supply', 'v_factory', 'v_airfield', 'v_shipyard', 'v_patriot', 'v_uplink', 'v_particle', 'v_cc'],
    roles: { cc: 'v_cc', power: 'v_power', supply: 'v_supply', barracks: 'v_barracks', factory: 'v_factory', airfield: 'v_airfield', shipyard: 'v_shipyard', defense: 'v_patriot', income: 'v_uplink', super: 'v_particle', builder: 'v_dozer', truck: 'v_chinook', squad: 'v_ranger', scout: 'v_drone' },
    aiArmy: ['v_ranger', 'v_tank', 'v_ranger', 'v_avenger', 'v_tank', 'v_comanche'], aiNavy: ['v_rhib', 'v_frigate', 'v_frigate'],
    tree: [
      { id: 'v_pathfinder', tier: 1, name: 'Pathfinder Training', desc: 'Unlocks the Pathfinder Sniper at the Barracks.', unlock: 'v_pathfinder' },
      { id: 'v_vet', tier: 1, name: 'Armor Veterancy', desc: 'Tanks leave the War Factory as Veterans.', vetBuild: 'tank' },
      { id: 'v_a10', tier: 3, name: 'A-10 Strafing Run', desc: POWERS.a10.desc, power: 'a10' },
      { id: 'v_para', tier: 3, req: 'v_pathfinder', name: 'Paratrooper Drop', desc: POWERS.paradrop.desc, power: 'paradrop' },
      { id: 'v_fastpdl', tier: 3, req: 'v_vet', name: 'Rapid Point Defense', desc: 'Point-defense lasers recharge 40% faster.', flag: 'fastPdl' },
      { id: 'v_ac130', tier: 5, req: 'v_para', name: 'AC-130 Gunship', desc: POWERS.ac130.desc, power: 'ac130' },
      { id: 'v_a10x2', tier: 5, req: 'v_a10', name: 'A-10 Wingman', desc: 'A second A-10 follows the first.', flag: 'a10x2' },
    ],
  },
  redhammer: {
    id: 'redhammer', name: 'China', doctrine: 'Heavy armor and overwhelming firepower',
    blurb: 'Heavy tanks, Inferno Cannons and J-11 fighters. Units fight 15% faster in a horde of five or more.',
    hull: 0x5d6a48, dark: 0x3d4631, usesPower: true, horde: true,
    build: ['r_power', 'r_barracks', 'r_supply', 'r_factory', 'r_airfield', 'r_shipyard', 'r_gatling', 'r_silo', 'r_cc'],
    roles: { cc: 'r_cc', power: 'r_power', supply: 'r_supply', barracks: 'r_barracks', factory: 'r_factory', airfield: 'r_airfield', shipyard: 'r_shipyard', defense: 'r_gatling', super: 'r_silo', builder: 'r_dozer', truck: 'r_truck', squad: 'r_conscript', scout: 'r_scout' },
    aiArmy: ['r_conscript', 'r_tank', 'r_conscript', 'r_tank', 'r_inferno', 'r_overlord', 'r_mig'], aiNavy: ['r_corvette'],
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
    build: ['s_barracks', 's_supply', 's_factory', 's_shipyard', 's_stinger', 's_tunnel', 's_market', 's_scud', 's_cc'],
    roles: { cc: 's_cc', supply: 's_supply', barracks: 's_barracks', factory: 's_factory', shipyard: 's_shipyard', defense: 's_stinger', tunnel: 's_tunnel', income: 's_market', super: 's_scud', builder: 's_worker', truck: 's_truck', squad: 's_guerrilla', scout: 's_technical' },
    aiArmy: ['s_guerrilla', 's_technical', 's_rpg', 's_scorpion', 's_technical', 's_buggy', 's_tractor'], aiNavy: ['s_mboat', 's_dboat', 's_dboat'],
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
  // Russia and Europe: full playable armies whose line-up is a placeholder until the player's own unit lists arrive.
  ursa: {
    id: 'ursa', name: 'Russia', doctrine: 'Massed armor and rocket artillery',
    blurb: 'T-90s, BMP-3s, TOS-1A thermobaric rockets, Su-27s and Ka-52 gunships. Hero: IT’S HIM!, on his bear.',
    hull: 0x6f7668, dark: 0x454b41, usesPower: true,
    build: ['u_power', 'u_barracks', 'u_supply', 'u_factory', 'u_airfield', 'u_shipyard', 'u_pantsir', 'u_iskander', 'u_cc'],
    roles: { cc: 'u_cc', power: 'u_power', supply: 'u_supply', barracks: 'u_barracks', factory: 'u_factory', airfield: 'u_airfield', shipyard: 'u_shipyard', defense: 'u_pantsir', super: 'u_iskander', builder: 'u_dozer', truck: 'u_truck', squad: 'u_rifle', scout: 'u_bmp' },
    aiArmy: ['u_rifle', 'u_tank', 'u_rpg', 'u_bmp', 'u_tank', 'u_tos', 'u_tunguska', 'u_ka52'], aiNavy: ['u_corvette'],
    tree: [
      { id: 'u_guards', tier: 1, name: 'Guards Training', desc: 'Infantry leave the Barracks as Veterans.', vetBuild: 'infantry' },
      { id: 'u_armorvet', tier: 1, name: 'Tank Academy', desc: 'Tanks leave the War Factory as Veterans.', vetBuild: 'tank' },
      { id: 'u_barrage', tier: 3, name: 'Artillery Barrage', desc: POWERS.barrage.desc, power: 'barrage' },
      { id: 'u_vdv', tier: 3, req: 'u_guards', name: 'VDV Airdrop', desc: POWERS.vdv.desc, power: 'vdv' },
      { id: 'u_trophy', tier: 3, req: 'u_armorvet', name: 'War Trophies', desc: 'Earn 20% of the cost of every enemy unit you destroy.', flag: 'bounty' },
      { id: 'u_odab', tier: 5, req: 'u_barrage', name: 'ODAB Fuel-Air Bomb', desc: POWERS.odab.desc, power: 'odab' },
      { id: 'u_barrage2', tier: 5, req: 'u_barrage', name: 'Barrage II', desc: 'Artillery Barrage fires 20 shells.', flag: 'barrage2' },
    ],
  },
  aegis: {
    id: 'aegis', name: 'Europe', doctrine: 'Few, expensive, well-protected units',
    blurb: 'Leopard 2s, Pumas, Gepards, PzH 2000 artillery, Eurofighters and Tiger gunships. Hero: Leonidas and his spear.',
    hull: 0x6c7b84, dark: 0x444f57, usesPower: true,
    build: ['e_power', 'e_barracks', 'e_supply', 'e_factory', 'e_airfield', 'e_shipyard', 'e_iris', 'e_lance', 'e_cc'],
    roles: { cc: 'e_cc', power: 'e_power', supply: 'e_supply', barracks: 'e_barracks', factory: 'e_factory', airfield: 'e_airfield', shipyard: 'e_shipyard', defense: 'e_iris', super: 'e_lance', builder: 'e_dozer', truck: 'e_truck', squad: 'e_rifle', scout: 'e_puma' },
    aiArmy: ['e_rifle', 'e_tank', 'e_milan', 'e_puma', 'e_tank', 'e_gepard', 'e_pzh', 'e_tiger'], aiNavy: ['e_fremm'],
    tree: [
      { id: 'e_crew', tier: 1, name: 'Crew Training', desc: 'Tanks leave the War Factory as Veterans.', vetBuild: 'tank' },
      { id: 'e_infvet', tier: 1, name: 'Professional Army', desc: 'Infantry leave the Barracks as Veterans.', vetBuild: 'infantry' },
      { id: 'e_barrage', tier: 3, name: 'Artillery Barrage', desc: POWERS.barrage.desc, power: 'barrage' },
      { id: 'e_para', tier: 3, req: 'e_infvet', name: 'Airborne Drop', desc: POWERS.eupara.desc, power: 'eupara' },
      { id: 'e_fastpdl', tier: 3, req: 'e_crew', name: 'Rapid Point Defense', desc: 'Point-defense lasers recharge 40% faster.', flag: 'fastPdl' },
      { id: 'e_storm', tier: 5, req: 'e_barrage', name: 'Storm Shadow Strike', desc: POWERS.storm.desc, power: 'storm' },
      { id: 'e_barrage2', tier: 5, req: 'e_barrage', name: 'Barrage II', desc: 'Artillery Barrage fires 20 shells.', flag: 'barrage2' },
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
//   spy                 metres of permanent vision around enemy buildings; spyFrom: seconds before it starts; spySeen: only buildings already found
//   grant               promotions owned from the start;  hack: overrides for Cash Hack
//   discount            { infantry, tank } cost multipliers
//   cloak               every infantry squad and light vehicle hides when it stands still
//   toxin               damage multiplier for the side's toxin clouds;  superCd: superweapon countdown multiplier
export const GENERALS = {
  airforce: { faction: 'vanguard', name: 'General Drudgereport.com', title: 'Air Force General', desc: 'F-15E Strike Eagles with bunker-buster bombs, a Stealth Comanche upgrade, and a B-2 carpet bomb in place of the A-10 run.',
    trains: { v_airfield: ['v_f15'] }, upgrades: { v_airfield: ['v_stealthrotor'] }, swap: { a10: 'b2' } },
  marine: { faction: 'vanguard', name: 'General Maddox', title: 'Marine Corps General', desc: 'Infantry and LAV-25s cross water. Adds the LAV-25 (TOW missile upgrade), SEAL Teams at the Barracks and the Mk V Combat Boat at the Naval Yard.',
    trains: { v_factory: ['v_lav'], v_barracks: ['v_seal'], v_shipyard: ['v_mkv'] }, upgrades: { v_factory: ['v_tow'] }, amph: true },
  cyber: { faction: 'redhammer', name: "Secretary Yuec'an Tsie Mie", title: 'Cyber General', desc: 'From 5:00 on, keeps a permanent watch on every enemy building you have found, and on what stands next to it. Starts with Cash Hack (first use at 3:00), which steals more and recharges faster. Infantry and tanks cost 12% more.',
    spy: 18, spyFrom: 300, spySeen: true, grant: ['r_hack'], hack: { amount: 2000, cd: 180 }, discount: { infantry: 1.12, tank: 1.12 } },
  mass: { faction: 'redhammer', name: 'General Tsao, Chicken', title: 'Mass Assault General', desc: 'Tanks and infantry cost 8% less.',
    discount: { infantry: 0.92, tank: 0.92 } },
  stealth: { faction: 'sandstorm', name: 'EWSAMA BEN ALLADIN', title: 'Stealth General', desc: 'Infantry and light vehicles vanish when they stand still. Adds Suicide Bombers that charge and break tanks, and FPV Attack Drones that dive on infantry, light vehicles and helicopters.',
    trains: { s_barracks: ['s_bomber', 's_fpv'] }, cloak: true },
  wmd: { faction: 'sandstorm', name: 'Nuclear Nadal', title: 'WMD General', desc: 'Scud Launchers, stronger toxin clouds, the Anthrax Beta upgrade, and a faster Scud Storm.',
    trains: { s_factory: ['s_scudtruck'] }, upgrades: { s_market: ['s_anthrax'] }, toxin: 1.25, superCd: 0.8 },
  // ---- Russia and Europe (rules first written for batch 12; tune with the sweep)
  //   discount.all / discount.bldg   every unit / every building;   hpMult   health of everything this side builds
  //   loot    share of the price of every enemy unit and building destroyed, paid in cash
  //   laser   damage multiplier for laser weapons;   tankHp   health multiplier for tanks;   vet   'tank': tanks are built as Veterans
  wagner: { faction: 'ursa', name: 'Wagner Group', title: 'Wagner Group', desc: 'Cheap manufacturing: every unit and building costs 12% less and has 15% less health. Adds the Convict Squad, the cheapest infantry in the game.',
    trains: { u_barracks: ['u_convict'] }, discount: { all: 0.88, bldg: 0.88 }, hpMult: 0.85 },
  vacation: { faction: 'ursa', name: 'Vacation Command Group', title: 'Vacation Command Group', desc: 'Modern hardware: the T-14 Armata and the Su-57. Steals cash: 6% of the price of every enemy unit and building it destroys.',
    trains: { u_factory: ['u_armata'], u_airfield: ['u_su57'] }, loot: 0.06 },
  lasergen: { faction: 'aegis', name: 'Laser General', title: 'Laser General', desc: 'Laser weapons do 25% more damage. Adds the Laser Leopard and the Laser Point Defense upgrade for Leopard and Panther tanks.',
    trains: { e_factory: ['e_laserleo'] }, upgrades: { e_factory: ['e_aps'] }, laser: 1.25 },
  panzer: { faction: 'aegis', name: 'Panzer General', title: 'Panzer General', desc: 'Tanks cost 10% less, have 15% more health and are built as Veterans. Adds the KF51 Panther heavy tank.',
    trains: { e_factory: ['e_panther'] }, discount: { tank: 0.9 }, tankHp: 1.15, vet: 'tank' },
};
export const generalsOf = (faction) => Object.keys(GENERALS).filter(g => GENERALS[g].faction === faction);
export const generalOf = (T) => (T && T.general && GENERALS[T.general]) || null;
export function trainsOf(T, btype) { const base = BLDGS[btype].trains || [], g = generalOf(T); return g && g.trains && g.trains[btype] ? base.concat(g.trains[btype]) : base; }
export function upgradesOf(T, btype) { const base = BLDGS[btype].upgrades || [], g = generalOf(T); return g && g.upgrades && g.upgrades[btype] ? base.concat(g.upgrades[btype]) : base; }
export function unitCost(T, type) {
  const d = UNITS[type], g = generalOf(T); let c = d.cost;
  if (g && g.discount) { if (g.discount.all) c *= g.discount.all; else if (d.infantry && g.discount.infantry) c *= g.discount.infantry; else if (d.tank && g.discount.tank) c *= g.discount.tank; }
  return Math.round(c / 10) * 10;
}
// What a building costs this team (a general may make buildings cheaper).
export function bldgCost(T, type) { const g = generalOf(T), c = BLDGS[type].cost || 0; return g && g.discount && g.discount.bldg ? Math.round(c * g.discount.bldg / 10) * 10 : c; }
// The power a promotion node gives this team (a general may swap one, e.g. A-10 -> B-2).
export function nodePower(T, n) { const g = generalOf(T); return n.power && g && g.swap && g.swap[n.power] ? g.swap[n.power] : n.power; }
