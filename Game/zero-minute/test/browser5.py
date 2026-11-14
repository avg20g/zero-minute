# Batch 3 client checks in headless Chrome (real page and game code, stand-in THREE that enforces the r158 API):
#   A. lobby map options and the map builder, driven with the real mouse
#   B. No-enemy sandbox start
#   C. airfield: jets taxi, take off, land; helicopters lift off the helipad; the view follows the sim's height
import asyncio, sys, subprocess, time, re, json
from playwright.async_api import async_playwright
ROOT = '/home/claude/rts'; OUT = sys.argv[1]; PORT = '8771'
html = open(ROOT + '/index.html').read()
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>', '<script src="test/mock-three.js"></script>')
html = re.sub(r'<link rel="stylesheet" href="https://fonts[^>]*>', '', html)
open(ROOT + '/_test.html', 'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', PORT, '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
async def main():
    bad = 0
    def fail(msg):
        nonlocal bad; bad += 1; print('  FAIL', msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        errs = []; reads = {}
        pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text and '404' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        async def grab(): reads.update(await pg.evaluate('window.__apiReads || {}'))
        URL = 'http://localhost:' + PORT + '/_test.html'
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        # ---- A. lobby + map builder
        lob = await pg.evaluate("({ maps: [...document.querySelectorAll('#setup-map .fchip b')].map(e => e.textContent), customDisabled: document.getElementById('map-custom').disabled, levels: [...document.querySelectorAll('#setup-levels .fchip b')].map(e => e.textContent) })")
        print('lobby          : maps', lob['maps'], '| custom disabled until built:', lob['customDisabled'], '| opponent', lob['levels'])
        if lob['maps'] != ['Desert Canyon', 'Open Desert', 'Forest River', 'Urban Megacity', 'Arctic Refinery', 'Custom map'] or not lob['customDisabled'] or lob['levels'][-1] != 'No enemy': fail('lobby map / opponent options')
        await pg.click('#setup-mapbuild'); await pg.wait_for_timeout(500)
        box = await pg.evaluate("(() => { const r = document.getElementById('mb-canvas').getBoundingClientRect(); return [r.left, r.top, r.width]; })()")
        P = lambda cx, cz: (box[0] + cx / 256 * box[2], box[1] + cz / 256 * box[2])
        async def rb():   # the page may have scrolled since the last click: find the canvas again
            nonlocal box; box = await pg.evaluate("(() => { const c = document.getElementById('mb-canvas'); c.scrollIntoView({ block: 'nearest' }); const r = c.getBoundingClientRect(); return [r.left, r.top, r.width]; })()")
        st = lambda: pg.evaluate("(() => { const m = [...document.querySelectorAll('#mb-msgs li')].map(l => l.className + ': ' + l.textContent); return { msgs: m, use: !document.getElementById('mb-use').disabled, shown: !document.getElementById('mapbuilder').hidden, setupHidden: document.getElementById('setup').hidden }; })()")
        s0 = await st()
        mb = await pg.evaluate("({ tools: [...document.querySelectorAll('#mb-tools input')].map(i => i.value), kinds: [...document.querySelectorAll('#mb-kind option')].map(o => o.textContent), biomes: [...document.querySelectorAll('#mb-biome option')].map(o => o.value) })")
        await pg.screenshot(path=OUT + '/p5_builder_default.png')
        await pg.click('#mb-clear'); s1 = await st()
        await pg.click('#mb-open'); s2 = await st()
        async def dragm(a, c):
            await rb(); x0, y0 = P(*a); x1, y1 = P(*c); await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move((x0 + x1) / 2, (y0 + y1) / 2); await pg.mouse.move(x1, y1); await pg.mouse.up(); await pg.wait_for_timeout(250)
        await dragm((150, 160), (180, 235))                                  # rock plateau (tool is Rock by default)
        await pg.click('#mb-tools input[value="ramp"] + span'); await dragm((165, 160), (165, 142))
        await pg.click('#mb-tools input[value="derrick"] + span'); await rb(); x, y = P(150, 120); await pg.mouse.click(x, y); await pg.wait_for_timeout(250)
        # free-hand brushes, drawn with the real mouse: a curved water stroke, a hill, then erase part of the water
        async def strokem(pts):
            await rb(); await rb(); x, y = P(*pts[0]); await pg.mouse.move(x, y); await pg.mouse.down()
            for q in pts[1:]:
                x, y = P(*q); await pg.mouse.move(x, y, steps=4)
            await pg.mouse.up(); await pg.wait_for_timeout(300)
        npaint = lambda: pg.evaluate("JSON.parse(localStorage.getItem('cz-map-probe') || '0')")
        await pg.click('#mb-tools input[value="paintwater"] + span'); await pg.fill('#mb-size', '5'); await strokem([(40, 30), (60, 44), (84, 50), (104, 66)])
        await pg.click('#mb-tools input[value="painthill"] + span'); await pg.fill('#mb-size', '9'); await strokem([(200, 150), (214, 160)])
        sb = await st(); brush_msg = sb['msgs'][0]
        await pg.click('#mb-tools input[value="erase"] + span'); await rb(); x, y = P(40, 30); await pg.mouse.click(x, y); await pg.wait_for_timeout(250); sb2 = await st()
        await pg.select_option('#mb-biome', 'snow'); await pg.wait_for_timeout(250); await pg.screenshot(path=OUT + '/p6_builder_brush.png'); await pg.select_option('#mb-biome', 'desert'); await pg.wait_for_timeout(250)
        await pg.select_option('#mb-kind', '7'); await pg.click('#mb-tools input[value="civ"] + span'); await rb(); x, y = P(120, 150); await pg.mouse.click(x, y); await pg.wait_for_timeout(250)   # a building of a chosen type
        await pg.click('#mb-tools input[value="rock"] + span'); await dragm((0, 120), (256, 136)); s3 = await st()      # a wall across the whole map: must be refused
        await pg.click('#mb-undo'); s4 = await st()
        await pg.screenshot(path=OUT + '/p5_builder_custom.png')
        print('map builder    : opens', s0['shown'] and s0['setupHidden'], '| default valid', s0['use'], '| cleared ->', s1['msgs'][0][:60], '| wall ->', s3['msgs'][0][:66], '| undo -> valid', s4['use'])
        if not (s0['shown'] and s0['use'] and not s1['use'] and 'Supply Dock' in s1['msgs'][0] and s2['use'] and not s3['use'] and any('route' in m or 'rock' in m for m in s3['msgs']) and s4['use']): fail('map builder validation flow')
        if not s4['use']: print('   builder messages:', s4['msgs'])
        await pg.click('#mb-use', timeout=3000); await pg.wait_for_timeout(400)
        back = await pg.evaluate("({ setup: !document.getElementById('setup').hidden, builder: document.getElementById('mapbuilder').hidden, custom: document.getElementById('map-custom').checked, saved: !!localStorage.getItem('cz-map') })")
        # team colours: six swatches a side; the enemy can never share yours
        col0 = await pg.evaluate("({ you: [...document.querySelectorAll('#setup-color-you input')].map(i => i.value), foe: document.querySelectorAll('#setup-color-foe input').length, picked: [document.querySelector('#setup-color-you input:checked').value, document.querySelector('#setup-color-foe input:checked').value] })")
        await pg.click('#setup-color-foe input[value="gold"] + span'); await pg.click('#setup-color-you input[value="gold"] + span')
        clash = await pg.evaluate("[document.querySelector('#setup-color-you input:checked').value, document.querySelector('#setup-color-foe input:checked').value, document.querySelector('#setup-color-foe input[value=gold]').disabled]")
        await pg.click('#setup-color-you input[value="green"] + span'); await pg.click('#setup-color-foe input[value="purple"] + span')
        await pg.click('#setup-levels input[value="hard"] + span'); await pg.click('#setup-start'); await pg.wait_for_timeout(2500)
        col1 = await pg.evaluate("""async () => { const C = await import('./js/ui/teamColors.js'); return { ids: C.TEAM.ids, css: C.TEAM.css, cssVar: getComputedStyle(document.documentElement).getPropertyValue('--blue').trim(), ring: typeof window.__rts.view.ringMatE }; }""")
        print('team colours   : choices', col0['you'], '| default', col0['picked'], '| you pick the enemy colour ->', clash, '| in match', col1['ids'], col1['css'][:2], 'HUD accent', col1['cssVar'])
        if not (len(col0['you']) == 6 and col0['foe'] == 6 and col0['picked'] == ['blue', 'red'] and clash == ['gold', 'red', True] and col1['ids'] == ['green', 'purple'] and col1['css'][0] == '#5fd16f' and col1['cssVar'] == '#5fd16f'): fail('team colours')
        g1 = await pg.evaluate("(() => { const s = window.__rts.sim; window.__paint = (s.setup.map.paint || []).length; window.__hasWater = s.map.hasWater; return { custom: s.map.custom, mesas: s.setup.map.mesas.length, ramps: s.setup.map.ramps.length, derricks: s.map.derricks.length, ai: s.ais.length, ents: s.ents.length, tick: s.tick }; })()")
        await pg.wait_for_timeout(4000); g1b = await pg.evaluate("window.__rts.sim.tick")
        civ = await pg.evaluate("""(() => { const g = window.__rts, s = g.sim, out = { spec: s.setup.map.civs.filter(c => c[2] === 7).length, ents: 0, white: 0, noMap: 0, kinds: [] };
            for (const e of s.ents) { if (e.type !== 'civ') continue; out.ents++; if (!out.kinds.includes(e.variant)) out.kinds.push(e.variant); if (!g.view.views.get(e.id)) out.noMap++; }
            return out; })()""")
        print('brushes        :', brush_msg[:90], '| after erase:', sb2['msgs'][0][:90])
        if not (sb['use'] and 'brush stamps' in brush_msg and brush_msg != sb2['msgs'][0] and sb2['use']): fail('free-hand brushes in the map builder')
        print('builder tools  :', len(mb['tools']), mb['tools'], '|', len(mb['kinds']), 'building types', mb['kinds'], '| ground', mb['biomes'])
        print('custom building: type 7 in the map', civ['spec'], '| civilian buildings in match', civ['ents'], 'kinds', sorted(civ['kinds']), '| buildings the view failed to build', civ['noMap'])
        if not (len(mb['tools']) == 13 and mb['tools'][:3] == ['paintrock', 'painthill', 'paintwater'] and 'bridge' in mb['tools'] and len(mb['kinds']) == 10 and mb['biomes'] == ['desert', 'woods', 'urban', 'snow'] and civ['spec'] == 1 and 7 in civ['kinds'] and civ['noMap'] == 0): fail('map builder building types / white buildings')
        print('custom match   : back in lobby', back, '| in match', g1, '| sim running', g1b > g1['tick'])
        if not (back['setup'] and back['builder'] and back['custom'] and back['saved'] and g1['custom'] and g1['mesas'] == 1 and g1['ramps'] == 1 and g1['derricks'] == 4 and g1['ai'] == 1 and g1b > g1['tick']): fail('custom map did not reach the match')
        pw = await pg.evaluate("({ paint: window.__paint, water: window.__hasWater })")
        print('brush in match :', pw)
        if not (pw['paint'] >= 3 and pw['water']): fail('brush work did not reach the match')
        # ---- B. sandbox
        await grab(); await pg.goto(URL); await pg.wait_for_timeout(900)
        keep = await pg.evaluate("({ custom: document.getElementById('map-custom').checked, enabled: !document.getElementById('map-custom').disabled, colours: [document.querySelector('#setup-color-you input:checked').value, document.querySelector('#setup-color-foe input:checked').value] })")
        await pg.click('#setup-map input[value="canyon"] + span'); await pg.click('#setup-levels input[value="none"] + span'); await pg.click('#setup-start'); await pg.wait_for_timeout(2500)
        g2 = await pg.evaluate("(() => { const s = window.__rts.sim; return { noEnemy: s.noEnemy, ai: s.ais.length, enemyEnts: s.ents.filter(e => e.team === 1).length, sub: document.getElementById('brand-sub').textContent, custom: s.map.custom }; })()")
        print('sandbox        : saved map remembered', keep, '|', g2)
        if not (keep['custom'] and keep['enabled'] and keep['colours'] == ['green', 'purple'] and g2['noEnemy'] and g2['ai'] == 0 and g2['enemyEnts'] == 0 and 'Sandbox' in g2['sub'] and not g2['custom']): fail('No-enemy sandbox')
        # ---- C. airfield in the running page (sandbox match, Vanguard)
        air = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, E = await import('./js/sim/entities.js'), EC = await import('./js/sim/econ.js'), R = await import('./js/sim/factionRegistry.js'), A = await import('./js/sim/air.js');
            const hq = s.ents.find(e => e.kind === 'bldg' && e.team === 0 && R.BLDGS[e.type].role === 'cc'); s.teams[0].money = 30000; s.fog.exp[0].fill(1);
            E.makeBldg(s, 'v_factory', 0, hq.cx + 16, hq.cz - 2); E.makeBldg(s, 'v_power', 0, hq.cx + 28, hq.cz - 2); E.makeBldg(s, 'v_power', 0, hq.cx + 28, hq.cz + 6); const f = E.makeBldg(s, 'v_airfield', 0, hq.cx + 12, hq.cz - 34, false); s.nav.rebuild(); EC.completeBldg(s, f);
            g.rig.focus(f.x, f.z); g.ui.selection.clear(); g.ui.selection.add(f.id); await new Promise(r => setTimeout(r, 500));
            const menu = [...document.querySelectorAll('#cmd button')].map(x => x.textContent.trim().slice(0, 22));
            s.issue({ t: 'train', id: f.id, type: 'v_raptor' });
            const wait = (fn, ms) => new Promise(res => { const t0 = performance.now(); const k = () => { const v = fn(); if (v || performance.now() - t0 > ms) res(v); else setTimeout(k, 50); }; k(); });
            const jet = await wait(() => s.ents.find(e => e.type === 'v_raptor'), 40000); const out = { menu, jet: !!jet };
            if (!jet) return out;
            const view = () => g.view.views.get(jet.id), d = R.UNITS.v_raptor;
            await new Promise(r => setTimeout(r, 300)); out.parkedAlt = +view().alt.toFixed(2); out.gearDown = view().gear.visible !== false;
            s.issue({ t: 'move', ids: [jet.id], x: f.x + 150, z: f.z + 60 });
            const seen = new Set(); let maxAlt = 0, gearUp = false, rollAlt = 99;
            const done = await wait(() => { seen.add(jet.as); const v = view(); if (v) { if (jet.as === 'backtaxi') rollAlt = Math.min(rollAlt, v.alt); maxAlt = Math.max(maxAlt, v.alt); if (jet.altK >= 1 && v.gear.visible === false) gearUp = true; } return jet.as === 'parked' && seen.has('rollout'); }, 110000);
            out.states = [...seen]; out.done = !!done; out.maxAlt = +maxAlt.toFixed(1); out.cruise = d.alt; out.gearUp = gearUp; out.taxiAlt = +rollAlt.toFixed(2); out.endAlt = +view().alt.toFixed(2);
            s.issue({ t: 'train', id: f.id, type: 'v_comanche' });
            const heli = await wait(() => s.ents.find(e => e.type === 'v_comanche'), 30000); out.heli = !!heli;
            if (heli) { out.heliStart = { as: heli.as, altK: heli.altK, onPad: Math.hypot(heli.x - f.heli.x, heli.z - f.heli.z) < 0.01 }; await wait(() => heli.altK >= 1, 12000); await new Promise(r => setTimeout(r, 200)); out.heliUp = { altK: heli.altK, viewAlt: +g.view.views.get(heli.id).alt.toFixed(1), cruise: R.UNITS.v_comanche.alt }; }
            return out; }""")
        await pg.screenshot(path=OUT + '/p5_airfield.png')
        print('airfield       : build menu', [m for m in air['menu'] if 'Raptor' in m or 'Comanche' in m], '| jet states', air.get('states'), '| view height parked', air.get('parkedAlt'), 'taxi', air.get('taxiAlt'), 'peak', air.get('maxAlt'), 'of cruise', air.get('cruise'), 'after landing', air.get('endAlt'), '| gear down on pad', air.get('gearDown'), 'up in flight', air.get('gearUp'))
        print('helipad        :', air.get('heliStart'), '->', air.get('heliUp'))
        want = ['taxi', 'backtaxi', 'lineup', 'roll', 'out', 'return', 'final', 'rollout', 'taxiin', 'park', 'parked']
        if not (air.get('done') and all(w in air['states'] for w in want) and air['parkedAlt'] < 2 and air['taxiAlt'] < 2 and abs(air['maxAlt'] - air['cruise']) < 0.5 and air['endAlt'] < 2 and air['gearDown'] and air['gearUp']): fail('jet take-off / landing in the page')
        if not (air.get('heli') and air['heliStart']['as'] == 'spool' and air['heliStart']['altK'] == 0 and air['heliStart']['onPad'] and air['heliUp']['altK'] == 1 and abs(air['heliUp']['viewAlt'] - air['heliUp']['cruise']) < 0.5): fail('helicopter lift-off in the page')
        # ---- D. batch 5: renamed factions, generals, Forest River
        await grab(); await pg.goto(URL); await pg.wait_for_timeout(900)
        names = await pg.evaluate("({ cards: [...document.querySelectorAll('#setup-factions .fcard b')].map(e => e.textContent), foes: [...document.querySelectorAll('#setup-foes span')].map(e => e.textContent), text: document.getElementById('setup').textContent })")
        gens = {}
        for fac in ['vanguard', 'redhammer', 'sandstorm']:
            await pg.click('#fac-' + fac + ' + span'); await pg.wait_for_timeout(150)
            gens[fac] = await pg.evaluate("[...document.querySelectorAll('#setup-general b')].map(e => e.textContent)")
        print('factions       :', names['cards'][:3], '| opponents', names['foes'], '| old names left in the lobby:', [n for n in ['Vanguard', 'Red Hammer', 'Sandstorm'] if n in names['text']])
        print('generals       :', gens)
        if not (gens['vanguard'] == ['General Drudgereport.com', 'General Maddox'] and gens['redhammer'] == ["Secretary Yuec'an Tsie Mie", 'General Tsao, Chicken'] and gens['sandstorm'] == ['EWSAMA BEN ALLADIN', 'Nuclear Nadal']): fail('general chooser')
        if any(n in names['text'] for n in ['Vanguard', 'Red Hammer', 'Sandstorm']) or 'United States' not in names['text'] or 'China' not in names['foes'] or 'ISIS' not in names['foes']: fail('faction names')
        async def match(fac, gen, level='none'):
            await grab(); await pg.goto(URL); await pg.wait_for_timeout(900)
            await pg.click('#fac-' + fac + ' + span'); await pg.wait_for_timeout(150); await pg.click('#setup-general input[value="' + gen + '"] + span')
            await pg.click('#setup-map input[value="forest"] + span'); await pg.click('#setup-levels input[value="' + level + '"] + span'); await pg.click('#setup-start'); await pg.wait_for_timeout(2500)
        await match('vanguard', 'airforce')
        fr = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, E = await import('./js/sim/entities.js'), EC = await import('./js/sim/econ.js'), R = await import('./js/sim/factionRegistry.js');
            const out = { name: s.map.name, biome: s.map.biome, water: s.map.hasWater, bridges: s.map.bridges.length, trees: s.map.trees.length / 3, general: s.teams[0].general, sub: document.getElementById('brand-sub').textContent };
            const made = window.__made || {}; out.instanced = made.InstancedMesh || 0;
            const hq = s.ents.find(e => e.kind === 'bldg' && e.team === 0 && R.BLDGS[e.type].role === 'cc'); s.teams[0].money = 30000; s.fog.exp[0].fill(1);
            const put = (type, done) => { for (let r = 8; r <= 56; r += 4) for (let dz = -r; dz <= r; dz += 4) for (let dx = -r; dx <= r; dx += 4) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; if (E.canPlace(s, type, hq.cx + dx, hq.cz + dz, 0)) { const b = E.makeBldg(s, type, 0, hq.cx + dx, hq.cz + dz, done); s.nav.rebuild(); return b; } } return null; };
            put('v_power', true); put('v_power', true); put('v_factory', true); const f = put('v_airfield', false);
            out.site = !!f; if (!f) return out; EC.completeBldg(s, f);
            g.rig.focus(f.x, f.z); g.ui.selection.clear(); g.ui.selection.add(f.id); await new Promise(r => setTimeout(r, 500));
            out.menu = [...document.querySelectorAll('#cmd button')].map(x => x.textContent.trim().slice(0, 26));
            out.powers = [...document.querySelectorAll('#powers button, #pw button')].map(x => x.textContent.trim().slice(0, 24));
            s.issue({ t: 'train', id: f.id, type: 'v_f15' });
            const t0 = performance.now(); while (!s.ents.find(e => e.type === 'v_f15') && performance.now() - t0 < 40000) await new Promise(r => setTimeout(r, 100));
            const jet = s.ents.find(e => e.type === 'v_f15'); out.f15 = !!jet; if (jet) { await new Promise(r => setTimeout(r, 300)); out.f15parts = g.view.views.get(jet.id) ? 1 : 0; out.f15ammo = jet.ammo; }
            return out; }""")
        b2 = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, P = await import('./js/sim/powers.js'), E = await import('./js/sim/entities.js');
            const hq = s.ents.find(e => e.kind === 'bldg' && e.team === 0); const tx = hq.x + 40, tz = hq.z; s.teams[0].promos.add('v_a10'); g.rig.focus(tx, tz);
            const out = { a10: P.hasPower(s, 0, 'a10'), b2: P.hasPower(s, 0, 'b2'), cast: P.usePower(s, 0, 'b2', tx, tz), kinds: [] }; const seen = new Set(); let ev = 0;
            const h = g.view.handleEvents.bind(g.view); g.view.handleEvents = (list) => { for (const e of list) if (e.t === 'explosion' || e.t === 'bomblet' || e.t === 'carpet' || e.t === 'blast') ev++; return h(list); };
            const t0 = performance.now(); while (performance.now() - t0 < 14000) { for (const k of s.strikes) seen.add(k.kind); await new Promise(r => setTimeout(r, 100)); }
            out.kinds = [...seen]; out.events = ev; out.left = s.strikes.length; return out; }""")
        print('B-2 carpet bomb: A-10 available', b2['a10'], '| B-2 available', b2['b2'], '| cast', b2['cast'], '| strike stages seen', b2['kinds'], '| blast events drawn', b2['events'], '| strikes left', b2['left'])
        if not (b2['b2'] and not b2['a10'] and b2['cast'] and 'carpet' in b2['kinds'] and b2['left'] == 0): fail('B-2 carpet bomb in the page')
        await pg.screenshot(path=OUT + '/p5_forest.png')
        print('forest river   :', {k: fr[k] for k in ['name', 'biome', 'water', 'bridges', 'trees', 'general', 'sub', 'instanced', 'site']})
        print('air force gen. : airfield menu', fr.get('menu'), '| F-15E built', fr.get('f15'), 'view built', fr.get('f15parts'), 'bombs', fr.get('f15ammo'))
        if not (fr['biome'] == 'woods' and fr['water'] and fr['bridges'] >= 2 and fr['trees'] > 1500 and fr['general'] == 'airforce' and 'United States' in fr['sub'] and 'Drudgereport' in fr['sub']): fail('Forest River match with a general')
        if not (fr.get('site') and any('F-15E' in m for m in fr.get('menu', [])) and any('Stealth' in m or 'stealth' in m for m in fr.get('menu', [])) and fr.get('f15') and fr.get('f15parts', 0) == 1 and fr.get('f15ammo') == 2): fail('Air Force general: F-15E at the airfield')
        await match('sandstorm', 'wmd', 'medium')
        wm = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, R = await import('./js/sim/factionRegistry.js'); const t0 = s.tick; await new Promise(r => setTimeout(r, 5000));
            return { general: s.teams[0].general, foe: R.FACTIONS[s.teams[1].faction].name, foeGeneral: s.teams[1].general, sub: document.getElementById('brand-sub').textContent, ticks: s.tick - t0, scudtruck: R.trainsOf(s.teams[0], 's_factory').includes('s_scudtruck') }; }""")
        print('WMD general    :', wm)
        if not (wm['general'] == 'wmd' and 'ISIS' in wm['sub'] and 'Nuclear Nadal' in wm['sub'] and wm['ticks'] > 40 and wm['scudtruck']): fail('ISIS WMD general vs AI on Forest River')
        # ---- E. batch 6: new maps, no black fog, new orders, sandbox rank
        rows = {}
        for mp, fac, gen in [('urban', 'redhammer', 'mass'), ('arctic', 'vanguard', 'marine')]:
            await grab(); await pg.goto(URL); await pg.wait_for_timeout(900)
            await pg.click('#fac-' + fac + ' + span'); await pg.wait_for_timeout(150); await pg.click('#setup-general input[value="' + gen + '"] + span')
            await pg.click('#setup-map input[value="' + mp + '"] + span'); await pg.click('#setup-levels input[value="medium"] + span'); await pg.click('#setup-start'); await pg.wait_for_timeout(5000)
            rows[mp] = await pg.evaluate("""(() => { const g = window.__rts, s = g.sim, f = g.view.fowCur; let lo = 255, ex = 1; for (let i = 0; i < f.length; i += 37) { if (f[i] < lo) lo = f[i]; if (!s.fog.exp[0][i]) ex = 0; }
                let hidden = 0; for (const e of s.ents) if (e.team === 1 && !s.fog.shouldShow(0, e)) hidden++;
                return { name: s.map.name, biome: s.map.biome, civs: s.map.civs.length, derricks: s.map.derricks.length, water: s.map.hasWater, trees: s.map.trees.length / 3, darkest: Math.round(lo), charted: ex, enemyHidden: hidden, tick: s.tick, sub: document.getElementById('brand-sub').textContent }; })()""")
            await pg.screenshot(path=OUT + '/p6_' + mp + '.png')
        print('urban megacity :', rows['urban']); print('arctic refinery:', rows['arctic'])
        u, a = rows['urban'], rows['arctic']
        if not (u['biome'] == 'urban' and u['civs'] == 48 and not u['water'] and u['tick'] > 40 and a['biome'] == 'snow' and a['derricks'] == 10 and a['water'] and a['trees'] > 800 and a['tick'] > 40): fail('new maps in the page')
        if not (u['darkest'] >= 100 and a['darkest'] >= 100 and u['charted'] and a['charted'] and u['enemyHidden'] > 0 and a['enemyHidden'] > 0): fail('no black fog: all ground dimmed at worst, the enemy still hidden')
        # orders on the Arctic match (United States): real keys and mouse
        od = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, E = await import('./js/sim/entities.js'), R = await import('./js/sim/factionRegistry.js');
            const hq = s.ents.find(e => e.kind === 'bldg' && e.team === 0 && R.BLDGS[e.type].role === 'cc'); s.teams[0].money = 20000;
            const tank = E.spawnNear(s, 'v_tank', 0, hq.x + 40, hq.z - 30), tank2 = E.spawnNear(s, 'v_tank', 0, hq.x + 48, hq.z - 30);
            g.rig.focus(tank.x + 10, tank.z); g.ui.selection.clear(); g.ui.selection.add(tank.id); await new Promise(r => setTimeout(r, 600));
            const p = { x: 0, y: 0 }, scr = (x, z) => { g.view.project(x, 0.5, z, p); const r = document.getElementById('gl').getBoundingClientRect(); return [p.x + r.left, p.y + r.top]; };
            window.__t = { tank, tank2, scr, hq };
            return { btns: [...document.querySelectorAll('#cmd button')].map(b => b.querySelector('.nm').textContent), a: scr(tank.x + 18, tank.z + 2), b: scr(tank.x + 26, tank.z + 12), c: scr(tank.x + 12, tank.z + 16), f: scr(tank.x + 14, tank.z - 8), t2: scr(tank2.x, tank2.z) }; }""")
        await pg.mouse.click(od['a'][0], od['a'][1], button='right'); await pg.wait_for_timeout(250)
        await pg.keyboard.down('Shift'); await pg.mouse.click(od['b'][0], od['b'][1], button='right'); await pg.mouse.click(od['c'][0], od['c'][1], button='right'); await pg.keyboard.up('Shift'); await pg.wait_for_timeout(300)
        wp = await pg.evaluate("({ order: window.__t.tank.order && window.__t.tank.order.t, wps: (window.__t.tank.wps || []).length })")
        await pg.screenshot(path=OUT + '/p6_markers.png')
        await pg.keyboard.press('t'); await pg.wait_for_timeout(150); mode = await pg.evaluate("({ force: window.__rts.ui.force, hint: document.getElementById('mode').textContent })")
        await pg.mouse.click(od['f'][0], od['f'][1]); await pg.wait_for_timeout(300)
        fa = await pg.evaluate("({ order: window.__t.tank.order && window.__t.tank.order.t, id: window.__t.tank.order && window.__t.tank.order.id, wps: (window.__t.tank.wps || []).length, force: window.__rts.ui.force })")
        await pg.keyboard.down('Control'); await pg.mouse.click(od['t2'][0], od['t2'][1], button='right'); await pg.keyboard.up('Control'); await pg.wait_for_timeout(300)
        fb = await pg.evaluate("({ order: window.__t.tank.order && window.__t.tank.order.t, onFriend: window.__t.tank.order && window.__t.tank.order.id === window.__t.tank2.id })")
        await pg.wait_for_timeout(5000); hurt = await pg.evaluate("(() => { const t = window.__t.tank2; return t.hp < t.maxHp; })()")
        print('orders         : buttons', od['btns'], '| move + 2 Shift markers ->', wp, '| T ->', mode['force'], '| click ground ->', fa, '| Ctrl+right-click own tank ->', fb, '| it takes damage', hurt)
        if not (all(n in od['btns'] for n in ['Force attack', 'Move markers']) and wp == {'order': 'move', 'wps': 2} and mode['force'] and 'Force attack' in mode['hint'] and fa['order'] == 'fattack' and fa['id'] == 0 and fa['wps'] == 0 and not fa['force'] and fb['onFriend'] and hurt): fail('force attack / move markers with real input')
        # cancel construction through the command card, Chinook, land and repair button
        cb = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, E = await import('./js/sim/entities.js'), EC = await import('./js/sim/econ.js'), R = await import('./js/sim/factionRegistry.js'), { hq } = window.__t;
            const put = (type, done) => { for (let r = 8; r <= 60; r += 4) for (let dz = -r; dz <= r; dz += 4) for (let dx = -r; dx <= r; dx += 4) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; if (E.canPlace(s, type, hq.cx + dx, hq.cz + dz, 0)) { const b = E.makeBldg(s, type, 0, hq.cx + dx, hq.cz + dz, done); s.nav.rebuild(); return b; } } return null; };
            const doz = s.ents.find(e => e.team === 0 && e.kind === 'unit' && R.UNITS[e.type].builder); let site = null;
            for (let r = 10; r <= 40 && !site; r += 4) if (E.canPlace(s, 'v_power', hq.cx + r, hq.cz - r, 0)) { s.issue({ t: 'build', id: doz.id, type: 'v_power', cx: hq.cx + r, cz: hq.cz - r }); await new Promise(r2 => setTimeout(r2, 400)); site = s.ents.find(e => e.type === 'v_power' && e.team === 0 && !e.done); }
            const m0 = s.teams[0].money; g.ui.selection.clear(); g.ui.selection.add(site.id); await new Promise(r => setTimeout(r, 400));
            const btn = [...document.querySelectorAll('#cmd button')].find(b => b.dataset.act === 'cancelbuild'); const label = btn ? btn.textContent.trim() : ''; if (btn) btn.click(); await new Promise(r => setTimeout(r, 500));
            const out = { label, refunded: s.teams[0].money - m0, gone: !s.byId.get(site.id) };
            put('v_power', true); put('v_power', true); const sc = put('v_supply', false); EC.completeBldg(s, sc); const af = put('v_airfield', false); EC.completeBldg(s, af); await new Promise(r => setTimeout(r, 600));
            const ch = s.ents.find(e => e.type === 'v_chinook' && e.team === 0); out.chinook = !!ch; if (!ch) return out;
            const v = g.view.views.get(ch.id); out.view = !!v; out.rotors = !!(v && v.rotor && v.rotor2);
            ch.hp = 80; g.ui.selection.clear(); g.ui.selection.add(ch.id); await new Promise(r => setTimeout(r, 400));
            out.btns = [...document.querySelectorAll('#cmd button')].map(b => b.querySelector('.nm').textContent);
            window.__ch = ch; return out; }""")
        await pg.keyboard.press('l'); await pg.wait_for_timeout(300)
        lr = await pg.evaluate("""async () => { const ch = window.__ch; const o = ch.order && ch.order.t; const t0 = performance.now(); while (ch.as !== 'pad' && performance.now() - t0 < 40000) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 3000)); return { order: o, as: ch.as, hp: Math.round(ch.hp), max: ch.maxHp, viewAlt: +window.__rts.view.views.get(ch.id).alt.toFixed(2) }; }""")
        print('cancel build   :', {k: cb.get(k) for k in ['label', 'refunded', 'gone']}, '| Chinook view', cb.get('view'), 'two rotors', cb.get('rotors'), '| buttons', cb.get('btns'))
        print('land + repair  : L ->', lr)
        if not ('Cancel construction' in cb['label'] and cb['refunded'] == 800 and cb['gone']): fail('cancel construction from the command card')
        if not (cb.get('chinook') and cb.get('rotors') and 'Land & repair' in cb.get('btns', []) and lr['order'] == 'repair' and lr['as'] == 'pad' and lr['hp'] > 100 and lr['viewAlt'] < 2): fail('Chinook / land and repair in the page')
        # sandbox: full rank and every power button
        await grab(); await pg.goto(URL); await pg.wait_for_timeout(900)
        await pg.click('#fac-redhammer + span'); await pg.click('#setup-map input[value="urban"] + span'); await pg.click('#setup-levels input[value="none"] + span'); await pg.click('#setup-start'); await pg.wait_for_timeout(2500)
        sb6 = await pg.evaluate("(async () => { const g = window.__rts, T = g.sim.teams[0], R = await import('./js/sim/factionRegistry.js'); return { rank: T.rank, promos: T.promos.size, tree: R.FACTIONS[T.faction].tree.length, powers: document.querySelectorAll('#pw button').length, points: T.points }; })()")
        print('sandbox rank   :', sb6)
        if not (sb6['rank'] == 5 and sb6['promos'] == sb6['tree'] and sb6['powers'] >= 1): fail('sandbox full rank in the page')
        # ---- F. batch 7 (same sandbox match: China on Urban Megacity): garrison in and out with the real mouse and keys, power lights the fog
        gz = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, E = await import('./js/sim/entities.js');
            const hq = s.ents.find(e => e.kind === 'bldg' && e.team === 0), civ = s.ents.filter(e => e.type === 'civ' && !e.ruined).sort((a, b) => Math.hypot(a.x - hq.x, a.z - hq.z) - Math.hypot(b.x - hq.x, b.z - hq.z))[0];
            const sq = []; for (let i = 0; i < 4; i++) sq.push(E.spawnNear(s, 'r_conscript', 0, civ.x - 12, civ.z + 9 + i * 2));
            await new Promise(r => setTimeout(r, 300)); s.issue({ t: 'garrison', ids: sq.map(u => u.id), target: civ.id });
            const t0 = performance.now(); while (civ.garrison.length < 4 && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 100));
            g.ui.selection.clear(); g.rig.focus(civ.x, civ.z); await new Promise(r => setTimeout(r, 700));
            const p = { x: 0, y: 0 }, rc = document.getElementById('gl').getBoundingClientRect(), scr = (x, y, z) => { g.view.project(x, y, z, p); return [p.x + rc.left, p.y + rc.top]; };
            window.__g = { civ, sq }; return { inside: civ.garrison.length, cap: E.capacityOf(civ), team: civ.team, at: scr(civ.x, 3, civ.z), ground: scr(civ.x - 16, 0.3, civ.z + 18), gx: civ.x - 16, gz: civ.z + 18, bm: !!g.view.views.get(E.spawnNear(s, 'r_tank', 0, hq.x + 30, hq.z + 30).id) || 'pending' }; }""")
        await pg.mouse.click(gz['at'][0], gz['at'][1]); await pg.wait_for_timeout(500)
        g1s = await pg.evaluate("({ selected: window.__rts.ui.selection.has(window.__g.civ.id), btns: [...document.querySelectorAll('#cmd button')].map(b => b.querySelector('.nm').textContent), info: document.getElementById('info').textContent })")
        await pg.keyboard.press('Shift+U'); await pg.wait_for_timeout(400); one = await pg.evaluate("window.__g.civ.garrison.length")
        await pg.mouse.click(gz['ground'][0], gz['ground'][1], button='right'); await pg.wait_for_timeout(500)
        out = await pg.evaluate("(() => { const { civ, sq } = window.__g; return { left: civ.garrison.length, team: civ.team, walking: sq.filter(u => u.order && u.order.t === 'move').length }; })()")
        await pg.evaluate("(() => { const { civ, sq } = window.__g; window.__rts.sim.issue({ t: 'garrison', ids: [sq[0].id, sq[1].id], target: civ.id }); })()"); await pg.wait_for_timeout(6000)
        await pg.mouse.click(gz['at'][0], gz['at'][1]); await pg.wait_for_timeout(300); back_in = await pg.evaluate("window.__g.civ.garrison.length"); await pg.keyboard.press('u'); await pg.wait_for_timeout(400); allout = await pg.evaluate("window.__g.civ.garrison.length")
        print('garrison UI    : in', gz['inside'], 'of', gz['cap'], '| click selects it', g1s['selected'], g1s['btns'], '| Shift+U ->', one, '| right-click ground ->', out, '| back in', back_in, '| U ->', allout)
        print('   info line   :', ' '.join(g1s['info'].split())[:150])
        if not (gz['inside'] == 4 and gz['cap'] >= 3 and g1s['selected'] and 'Evacuate all' in g1s['btns'] and 'Take out one squad' in g1s['btns'] and ('/' + str(gz['cap'])) in g1s['info'] and one == 3 and out['left'] == 0 and out['team'] == 2 and out['walking'] == 3 and back_in == 2 and allout == 0): fail('garrison exit with real mouse and keys')
        pf = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, P = await import('./js/sim/powers.js'); const tx = 256, tz = 256, i = 128 * 256 + 128;
            const before = { vis: s.fog.vis[0][i], shade: Math.round(g.view.fowCur[i]), err: P.powerError(s, 0, 'barrage', tx, tz) };
            const civ = s.ents.filter(e => e.type === 'civ' && !e.ruined && e.team === 2).sort((a, b) => Math.hypot(a.x - tx, a.z - tz) - Math.hypot(b.x - tx, b.z - tz))[0], hp0 = civ.hp;
            const cast = P.usePower(s, 0, 'barrage', civ.x, civ.z), j = Math.floor(civ.z / 2) * 256 + Math.floor(civ.x / 2); await new Promise(r => setTimeout(r, 9000));
            return { before, cast, lit: s.fog.vis[0][j], shade: Math.round(g.view.fowCur[j]), reveals: s.reveals.length, civHp: [hp0, Math.round(civ.hp)], ruined: civ.ruined }; }""")
        print('power in fog   :', pf)
        if not (pf['before']['vis'] == 0 and pf['before']['shade'] < 130 and pf['before']['err'] is None and pf['cast'] and pf['lit'] == 1 and pf['shade'] > 230 and pf['civHp'][1] < pf['civHp'][0]): fail('power lights the fog and damages an empty building')
        await grab()
        print('three.js API   : properties the game read that the real r158 classes do not have:', len(reads)); [print('    ', k, '<-', v) for k, v in sorted(reads.items())]
        print('console errors :', len(errs)); [print('   ', e[:400]) for e in errs[:10]]
        bad += len(errs) + len(reads)
        await b.close()
    print('BATCH 3-7 CLIENT:', 'all checks passed' if not bad else f'{bad} FAILURES')
try: asyncio.run(main())
finally: srv.terminate()
