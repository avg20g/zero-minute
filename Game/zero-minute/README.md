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
- **Superweapons** (one per side, $5,000, needs the factory): Particle Cannon,
  Nuclear Missile Silo, Scud Storm. Completion is announced to both players and
  the building is revealed; the 5:00 countdown is shown to both and pauses on
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
