# Zero Minute (skirmish RTS)

3D RTS prototype: Three.js (WebGL) + modular ES6. No build step.
Three asymmetric factions share one deterministic 20 Hz simulation and one
pathfinding engine; their differences are data in `js/sim/factionRegistry.js`.
The opponent is a utility AI that plays through its own Fog of War.
Phase 4 adds procedural PBR terrain, three lighting presets, pooled and instanced
effects, synthesised spatial audio, a match lobby, an After-Action Report and
deterministic replays.

## Run locally
ES modules need a web server (opening the file directly will not work):

    python3 -m http.server 8000      # then open http://localhost:8000/play.html

`play.html` is the standalone page. `index.html` is the same page without the
document wrapper, used for the hosted version.

## External models (.glb)
Drop a binary glTF file in `models/` and list it in `models/manifest.json`:

    { "abrams": "abrams.glb",
      "a10": { "file": "a10.glb", "length": 10, "rotY": 90 } }

Keys are the registry `model` names (abrams, battlemaster, overlord, technical,
scoutcar, comanche, drone, ...) plus `a10`. A model is auto-scaled to the unit's
length, turned to face +X and seated on the ground. Nodes whose names contain
`turret`, `rotor`, `tail`+`rotor` or `prop` are animated. A missing or invalid
file falls back to the procedural model. Supported: embedded-buffer GLB,
triangle meshes, node hierarchy, PBR base colour / metallic / roughness and an
embedded base-colour image. Not supported: Draco or meshopt compression, KTX2
textures, skins, animations, external .bin files.

## Layout
    js/sim/     deterministic simulation (no DOM, no Three.js, no Math.random)
      simulationTick.js   the 20 Hz tick: commands, movement, combat, economy,
                          victory rule (no Command Center and no builders),
                          peace treaty, match statistics
      pathfinding.js      A* on a cell grid + clearance classes
      factionRegistry.js  ALL faction data: weapons, units, buildings, upgrades,
                          support powers, promotion trees
      aiController.js     utility AI: perception (aiVisionGrid, aiMemoryMap),
                          scouting, scored economy/counter-building, operations,
                          retreat and focus-fire micro, powers, difficulty tiers
      replayManager.js    ReplayRecorder, ReplayPlayer, verifyReplay
      defs.js map.js move.js air.js fog.js combat.js abilities.js powers.js
      econ.js entities.js
    js/render/
      environmentFX.js    procedural canvas PBR surfaces (cracked sand, striated
                          rock, worn asphalt, dark dirt), terrain splat shader,
                          lighting presets, headlights, searchlights
      vfxManager.js       every particle, decal, wreck, tracer, ring and flash:
                          fixed pools + InstancedMesh, nothing allocated in play
      modelFactory.js     unit/aircraft meshes: external .glb if supplied, else
                          procedural assemblies; merged per animated part and
                          shared between units of a type
      meshdata.js         pure data: prism extrusion, GLB parser (Node-testable)
      models.js           procedural library: buildings, infantry, support vehicles
      view.js terrain.js gfx.js
    js/audio/audioEngine.js  Web Audio synthesis (no sound files), distance
                          attenuation + stereo pan, 24-voice cap, compressor +
                          soft limiter
    js/input/   camera rig, selection, control groups, orders, power targeting
    js/ui/      setup.js (lobby), uiHUD.js (command bar, minimap, promotions,
                After-Action Report, replay bar)
    js/game.js  fixed-timestep loop, audio wiring, replay record / playback

## Controls added in Phase 4
    F then click       attack-move
    V then click       guard area (go there, then hold the spot)
    R + right-click    reverse-move (vehicles keep front armor to the threat)
    X                  scatter          Z   stop
    G                  General's Promotions
The original brief gave A to both attack-move and camera pan, and G to both
guard and promotions, so attack-move is F and guard is V.

## Add-on batch 2
- **Superweapons** ($5,000 each, needs the factory; one per side until batch 9, any number since): Particle Cannon,
  Nuclear Missile Silo, Scud Storm. Completion is announced to both players and
  the building is revealed; the countdown (5:00 until batch 9, 3:30 since) is shown to both and pauses on
  low power; launch sounds a klaxon for both. Lobby rule: No superweapons.
- **General's Powers**: Paratrooper Drop (Vanguard), Cash Hack (Red Hammer,
  only on a supply building you have scouted), Sneak Attack tunnel exit (Sandstorm).
- **King of the Hill** (lobby rule): hold the map centre alone for 3:00. A
  contested hill stops the clock; losing it to the enemy resets yours.
- **AI**: builds and fires its superweapon (Medium, Hard) only at targets in its
  own view, plays the hill, and on Hard reverse-moves damaged armor away from a
  visible threat before turning for the repair bay.

## Batch 3: airfields, map builder, sandbox
- **Airfield** (Vanguard and Red Hammer, 36 m x 20 m): four parking pads, a 32 m runway and a helipad.
  Strike fighters (Raptor, MiG) taxi to the runway, line up, roll, lift off past the 55% mark, fly the
  sortie, then fly an approach, land, roll out and taxi back to re-arm. One aircraft uses the runway
  at a time; others hold on the pad or orbit the approach fix. Helicopters (Comanche, Hind) start on
  the helipad, spool up and climb straight up. Layout lives in `sim/entities.js` (`b.pads`, `b.rw`,
  `b.heli`) and must match `airfield()` in `render/models.js`. State machine: `sim/air.js`.
- **Map builder** (lobby, "Open map builder"): rock plateaus, ramps, roads, Supply Docks, Oil Derricks,
  buildings and your start, all mirrored through the centre. A validator refuses maps with no route
  between the bases, no reachable Supply Dock, objects on cliffs, and so on. Maps are plain "specs"
  (see `sim/map.js`), saved in localStorage and carried inside replays.
- **No enemy** (lobby, opponent skill): sandbox with no AI, no enemy base and no win or lose.
- **Speed**: fog rows use native fills, the navigation flood fill allocates nothing, path search uses a
  1.12 heuristic weight and an 18,000-node budget per tick. `node test/bench.mjs` prints the numbers.

## Batch 4: colours, twin runways, loiter, F-22
- **Team colours**: six choices per side in the lobby (`ui/teamColors.js`). Cosmetic only; stored in replays.
- **Airfield** is now 40 m x 28 m with a 36 m runway on each side of the apron, so two aircraft can take off
  or land at once. Ground handling is slower (taxi 4 m/s, gentler acceleration and braking, longer approach).
- **Loiter**: a jet sent to a point holds a circle over it for 30 s and engages what appears, then goes home.
  After an attack order whose target is already dead it does the same. With **Guard** (V) it holds until its
  missiles are gone, lands, re-arms and returns to the guard point until you press Stop (Z).
- **Raptor** rebuilt from F-22A proportions (`RAPTOR` in `render/modelFactory.js`); `node test/shape.mjs raptor`
  dumps the model for drawing silhouettes.

## Batch 5: generals, Forest River, building types
- **Faction names**: United States, China, ISIS (internal ids are still `vanguard`, `redhammer`, `sandstorm`).
- **Six generals** (two per faction, chosen in the lobby; data in `GENERALS`, `js/sim/factionRegistry.js`):
  - United States: *General Drudgereport.com*, Air Force (F-15E Strike Eagle with 2 bunker-buster bombs and no
    air-to-air weapon, Stealth Comanche upgrade, B-2 carpet bomb in place of the A-10 pass);
    *General Maddox*, Marine Corps (every ground unit crosses water, LAV-25 with a TOW missile upgrade).
  - China: *Secretary Yuec'an Tsie Mie*, Cyber (permanent watch on enemy buildings, Cash Hack from the start,
    $2,500 per use, 150 s recharge); *General Tsao, Chicken*, Mass Assault (tanks and infantry cost 25% less).
    (Both retuned in batch 8.)
  - ISIS: *EWSAMA BEN ALLADIN*, Stealth (units are hidden while they stand still, suicide bomber, FPV attack
    drone); *Nuclear Nadal*, WMD (Scud Launcher vehicle, Anthrax upgrade, toxin damage x1.25, Scud Storm
    recharges 20% faster).
- **Forest River map**: woods ground, about 3,200 trees, a river with two bridges and a ford per side.
  Water blocks ground units unless they are amphibious. Map specs take `biome`, `trees`, `water`, `bridges`.
- **Map builder**: River and Bridge tools, Ground type (desert or woods), and a Building type list
  (10 types). The white-building bug is fixed: a building's number is now its type, not its list position.
- **Aircraft**: faster ground handling (order to wheels-up 3.6 s for the F-22, 6.3 s for the J-11;
  helicopter lift-off 2.2 s). Returning jets fly to an outer fix, then an inner fix, so they always
  arrive lined up with the runway.
- **Models from real dimensions**: F-15E, J-11 (replaces the MiG), B-2, LAV-25, Scud launcher, FPV drone.
- Tests: `node test/batch5.mjs` (52 checks) and section D of `python3 test/browser5.py <outdir>`.

## Batch 6: orders, Chinooks, two maps, free-hand terrain
- **Force attack** (T then click, or Ctrl + right-click): units fire on any spot, unit or building, including
  your own. Command `{ t: 'force', ids, x, z, target }`, order `fattack`. Shots aimed at the ground hurt
  whatever stands within 1.8 m (or the weapon's splash radius). Jets fly the attack run and go home.
- **Move markers** (Shift + right-click, or the Move markers button): up to 12 queued points per unit
  (`u.wps`). A plain order clears them. The HUD draws the route and a numbered flag at each marker.
- **Cancel construction**: select an unfinished building, press Cancel construction: full refund.
- **Build anywhere**: placement no longer needs scouted ground. **No black fog**: unseen ground is dimmed,
  never hidden; enemy units and buildings stay hidden until seen (`noShroud` option, on in the game).
- **Sandbox** (No enemy): the player starts at rank 5 with every promotion and power.
- **Chinook**: the United States collects supplies by helicopter ($800, carries $200, no loading bays, crosses
  water and cliffs; anti-air can shoot it down). One comes free with each Supply Center.
- **Land & repair** (L): helicopters fly to the nearest friendly helipad, land one at a time and regain
  6% health per second. Any new order makes them take off.
- **Maps**: Urban Megacity (paved, 48 buildings, city blocks) and Arctic Refinery (snow, ten oil derricks,
  frozen inlet). Ground types are now desert, woods, city and snow (`BIOMES` in `js/sim/map.js`).
- **Map builder**: Rock, Hill and Water brushes for free-hand terrain (`spec.paint`, up to 400 stamps per
  side), a brush-size slider, and all four ground types.
- **Looks**: each jet has its own finish (F-22 pale grey with a gold canopy, F-15E dark grey with conformal
  tanks, J-11 blue-grey with a pale radome). New Chinook model with tandem rotors.
- **Fix**: a unit beside a building could skip the corner step of its path and push into the wall forever
  (this could freeze an AI builder). Units now only cut a corner when the way ahead is open.
- Tests: `node test/batch6.mjs` (68 checks) and section E of `python3 test/browser5.py <outdir>`.

## Batch 7: garrisons, powers and fog, Battlemaster fix
- **Garrison size**: civilian buildings hold 3 to 8 squads by type (`BLDGS.civ.caps`; it was 2 for all).
- **Taking a garrison out**: select the building you hold, then press U (all), Shift + U (one squad), or
  right-click the ground (all leave and walk there). The Evacuate buttons were unreachable before: a held
  building's command card never showed them. Command `{ t: 'evacuate', id, count, x, z }`.
- **Powers light the fog**: using any support power or superweapon shows its target area (power radius
  + 10 m) to that team for 16 s (`sim.reveals`). Rule change: A-10 rockets can now guide inside it.
- **Powers wreck civilian buildings**: empty ones and enemy-held ones take full power damage
  (`strikeDamage`). Buildings you hold are spared. Ordinary unit fire still leaves empty buildings alone.
- **Captured Oil Derricks** watch about 29 m around them (this already worked; now covered by a test).
- **Battlemaster fix**: the Overlord's Gatling turret and Battle Bunker were built hidden on every
  Battlemaster, and the mesh baker merged hidden parts into the drawn model. They are no longer built,
  and `bakeRig` skips hidden parts.
- Tests: `node test/batch7.mjs` (26 checks) and section F of `python3 test/browser5.py <outdir>`.

## Batch 8: first balance pass
- **Balance harness** (`balance/`): `node balance/run.mjs` plays every pairing of the nine loadouts (three factions
  plus six generals) AI against AI on worker threads; `node balance/report.mjs` writes `balance/report.md` with win
  rates, pairings, start-position bias, match lengths and per-unit figures. `balance/try.sh name '{"UNITS.x.hp":300}'`
  trials a registry change without editing the game (`ZM_TWEAK`).
- **Result** (Hard v Hard, 1,215 matches): loadout win rates went from 19-99% to 37-61%. Numbers and reasons are in
  `balance/CHANGELOG.md`, with what is still uneven.
- **Rule change**: a power a general starts with begins the match on its full recharge (Cyber's Cash Hack is first
  usable at 3:00). Cyber now pays 12% more for infantry and tanks; Mass Assault's discount is 8%.
- Tests: `node test/balance.mjs` (46 checks).

## Batch 9: play notes
Changes asked for after the first play session.
- **Friendly fire** (lobby rule, on by default; `friendlyFire` in the match setup): explosions, gas and fire also hurt
  the side that made them. The unit that fired is spared; direct fire, flashbangs and EMP are unchanged. The AI counts
  its own troops under a blast against a target before using a power.
- **Superweapons**: build as many as you can pay for and power. Each building has its own countdown
  (`b.superReady`), now 3:30 instead of 5:00, and the HUD shows the earliest one and how many you have.
  You can watch them work: the Particle Cannon fires a beam into the sky, the Nuclear Missile climbs out of its
  silo (and the next one rises in the shaft as the countdown runs down), the Scud Storm's nine missiles leave their
  rails one by one and are put back one by one.
- **United States**: AC-130 Gunship (Rank 5, after Paratrooper Drop): circles the zone for 15 s firing a rotary
  cannon and a 105 mm howitzer at what you can see. Recon Drone circles its station instead of hovering. F-22 carries
  four missiles and is the anti-aircraft jet; the F-15E does at least 1.5 times the F-22's damage per sortie to every
  kind of ground target.
- **China**: the silo and its missile are redrawn (white two-stage rocket, red warhead, service tower); the blast
  has a mushroom cloud.
- **ISIS**: Scud noses are long and pointed. The Scud Launcher raises its missile for 2 s, the missile flies a real
  arc, and a new one slides on during the 20 s reload. The Technical fires a machine gun at every salvage level
  (machine gun, heavy machine gun, twin heavy machine guns). Toxin does 1.3 times damage to infantry and 45% damage to light vehicles
  (it did none before).
- **Garrisons**: toxin, fire and heat hurt the squads inside a building exactly as fast as squads in the open, where
  they stand. Nobody is thrown out any more (flashbangs still do that).
- **Stealth General**: the FPV drone dives onto its target (or climbs to a helicopter), and is strong against
  infantry, light vehicles and helicopters. The Suicide Bomber is hidden whenever it stands still, sprints the last
  24 m, and is strong against tanks. Both die in their own blast.
- Tests: `node test/batch9.mjs` (64 checks).

## Replays
A replay is the match setup plus the player's commands with their tick numbers
(a 20-minute match is a few kilobytes). The AI runs inside the simulation, so
it replays itself. "Watch replay" on the After-Action Report stores the
recording in sessionStorage and reloads the page into observer mode: 1x / 2x /
4x speed and a Fog of War toggle. Checkpoint hashes every 10 s detect drift.

## AI rules (enforced by test/ai.mjs)
The AI reads enemy state only through `aiVisionGrid` (the sim's fog grid for its
own team) and `aiMemoryMap` (last seen position + time). It never reads the
other team's money, rank, promotions or fogged entities, issues the same
commands a player can, and receives no bonus cash. Difficulty changes only
behaviour: actions per minute, reaction delay, first-attack patience, and which
tactics (counters, retreat, focus fire, flanking, power combos) are switched on.

## Tests
Node (simulation only):

    node test/phase4.mjs      lobby options, elimination rule, peace treaty,
                              reverse-move, scatter, 20-minute replay + tamper check
    node test/air.mjs         runway take-off and landing, runway sharing, helipad, AI use
    node test/maps.mjs        map tools, validator, AI match on a custom map, sandbox
    node test/batch5.mjs      generals, Forest River, water and bridges, building types
    node test/batch6.mjs      force attack, move markers, cancel build, Chinooks, helipad repair,
                              new maps and brushes
    node test/batch7.mjs      garrison size and exit, powers light fog and wreck buildings
    node test/balance.mjs     balance harness: six fixed matches repeat exactly, report is well formed
    node test/batch9.mjs      friendly fire, many superweapons, AC-130, drone loiter, garrisons, FPV, bomber
    node test/bench.mjs       simulation speed benchmark
    node test/addon.mjs       superweapons, No-Superweapons rule, new powers,
                              King of the Hill, AI use of all of them
    node test/ai.mjs          no-cheat audit, blind swap, scouting, counters, micro, tiers
    node test/a10.mjs         two-stage A-10 pass: cannon line, 6 rockets, armour kills, fog
    node test/models.mjs      silhouette features, matte materials, geometry winding, GLB path
    node test/phase2.mjs      registry, factions, veterancy, garrison clearing, 9 match-ups
    node test/tunnel.mjs  test/powers.mjs  test/fog.mjs
    node test/congestion.mjs  test/squads.mjs  test/game.mjs

Headless Chrome (Python Playwright; pass an output folder for screenshots):

    python3 test/browser5.py out/   map builder with the real mouse, sandbox start, airfield in the page
    python3 test/browser4.py out/   lobby, top bar, audio voice cap + clipping,
                                    20-minute pooled-effects soak, report, replay
    python3 test/browser3.py out/   model sources, A-10 pass visuals, fogged pass
    python3 test/browser2.py out/   three match-ups smoke test
    python3 test/watchdog.py out/   idle lobby must not raise the start-up error

The browser tests run the real page and game code with real Web Audio, but with
`test/mock-three.js` in place of Three.js (the test machine has no GPU access to
the CDN). The stand-in enforces the real r158 API surface listed in
`test/three-api.txt`: reading a property a real class does not have returns
undefined. It does not compile shaders or draw.
