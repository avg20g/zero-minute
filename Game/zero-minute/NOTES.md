# Working notes (batch 5) - resume here if context is lost
User asks (2026-11-14): 1) aircraft ground handling FASTER (not slower) 2) rename factions: vanguard->United States, redhammer->China, sandstorm->ISIS (ids unchanged)
3) custom (civ) buildings white/textureless in game: fix, add variety, chooser in map builder 4) new woods map: water, bridges, trees
5) six generals (GENERALS in factionRegistry): airforce "General Drudgereport.com" (F-15E w/ 2 bunker bombs no AA, stealth Comanche upgrade, B-2 carpet bomb replaces A-10);
   marine (real name declined -> fictional "General Maddox") amphibious units + LAV-25 IFV with TOW upgrade; cyber "Secretary Yuec'an Tsie Mie" (constant spy, cash hack);
   mass "General Tsao, Chicken" (cheaper tanks+infantry); stealth "EWSAMA BEN ALLADIN" (hidden units, suicide bombers, drones); wmd "Nuclear Nadal" (Scud launcher, anthrax, gas)
6) models from real counterparts; MiG -> J-11 7) ideas list + what I need from user.
Status: see bottom of file (append as done).
- sim+tests for batch5 done (generals, forest map, kinds, air speed). Remaining: browser tests, README, publish, zip, final answer with ideas.
- browser tests updated (browser5 section D, browser3 general fix), README batch 5 done, play.html rebuilt. Remaining: publish, zip, commit to device, final reply.

# Batch 6 (user ask 2026-11-14, after batch 5 published as Version 10)
1) Chinook supply collector for ALL US generals 2) NO buildable bombers 3) helicopters land+repair on command 4) maps: Urban Megacity, Arctic Refinery
5) map builder: free-hand terrain 6) rename Maddox -> user wants "Who tf is Ryan McBeth?" (real person: DECLINED again, keep fictional; tell user briefly)
7) F-22 more distinct from F-15, gold canopy 8) sandbox (noEnemy): all general abilities unlocked, full rank 9) force-attack button (ground / friendly / anything)
10) remove BLACK fog (unexplored shown as grey fog, enemy still hidden) + construction placeable anywhere 11) cancel construction with refund 12) multiple move markers (waypoints)
Status:
- sim done + test/batch6.mjs 50/50: force attack (cmd 'force', order fattack), move markers (move queue:true, u.wps), cancelbuild, canPlace no fog check, sandbox full rank, v_chinook (roles.truck for vanguard, stepChopper in econ.js), heli land/repair (cmd 'landrepair', air.js heli()). TODO: fix old tests (v_truck), UI (buttons/keys/markers), fog render grey, F-22 look + chinook model, maps urban/arctic + biomes, builder brushes, browser tests, publish.
- fixed latent path bug (move.js corner-cut lineClear) that froze AI builder; all 17 node suites pass. NEXT: UI (controls/HUD), fog grey, models, maps, builder.
- UI done (controls force/wp/land, HUD buttons, markers overlay, grey fog, noShroud opt in game.js). NEXT: chinook model + F-22 look, maps urban/arctic + biomes, builder brushes, browser tests, README, publish.
- models done (jets distinct finishes, gold F-22 canopy, chinook w/ rotor2; models.mjs 226). NEXT: maps urban/arctic + biomes (environmentFX BIOME_SURFACES, terrain trees, minimap, setup chips), builder brushes (spec.paint), browser tests, README, publish v11, zip batch6.
- maps URBAN_MAP/ARCTIC_MAP + MAPS list + BIOMES (urban,snow) + brushes (spec.paint, tools paintrock/painthill/paintwater, #mb-size) done; batch6.mjs 68/68; chinook tuned (cost 800 carry 200 load 80). NEXT: browser5.py update (maps list, 13 tools, 4 biomes, section E for batch 6), run all node+browser, README batch 6, play.html, publish v11, zip batch6, commit, final reply (decline McBeth name again; aircraft-batch6.png in scratchpad).
- all tests green (17 node, 5 browser), README + play.html done. Remaining: publish v11, zip batch6, commit to device, send, final reply.
