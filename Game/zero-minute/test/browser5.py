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
        if lob['maps'] != ['Desert Canyon', 'Open Desert', 'Custom map'] or not lob['customDisabled'] or lob['levels'][-1] != 'No enemy': fail('lobby map / opponent options')
        await pg.click('#setup-mapbuild'); await pg.wait_for_timeout(500)
        box = await pg.evaluate("(() => { const r = document.getElementById('mb-canvas').getBoundingClientRect(); return [r.left, r.top, r.width]; })()")
        P = lambda cx, cz: (box[0] + cx / 256 * box[2], box[1] + cz / 256 * box[2])
        st = lambda: pg.evaluate("(() => { const m = [...document.querySelectorAll('#mb-msgs li')].map(l => l.className + ': ' + l.textContent); return { msgs: m, use: !document.getElementById('mb-use').disabled, shown: !document.getElementById('mapbuilder').hidden, setupHidden: document.getElementById('setup').hidden }; })()")
        s0 = await st()
        await pg.screenshot(path=OUT + '/p5_builder_default.png')
        await pg.click('#mb-clear'); s1 = await st()
        await pg.click('#mb-open'); s2 = await st()
        async def dragm(a, c):
            x0, y0 = P(*a); x1, y1 = P(*c); await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move((x0 + x1) / 2, (y0 + y1) / 2); await pg.mouse.move(x1, y1); await pg.mouse.up(); await pg.wait_for_timeout(250)
        await dragm((150, 160), (180, 235))                                  # rock plateau (tool is Rock by default)
        await pg.click('#mb-tools input[value="ramp"] + span'); await dragm((165, 160), (165, 142))
        await pg.click('#mb-tools input[value="derrick"] + span'); x, y = P(150, 120); await pg.mouse.click(x, y); await pg.wait_for_timeout(250)
        await pg.click('#mb-tools input[value="rock"] + span'); await dragm((0, 120), (256, 136)); s3 = await st()      # a wall across the whole map: must be refused
        await pg.click('#mb-undo'); s4 = await st()
        await pg.screenshot(path=OUT + '/p5_builder_custom.png')
        print('map builder    : opens', s0['shown'] and s0['setupHidden'], '| default valid', s0['use'], '| cleared ->', s1['msgs'][0][:60], '| wall ->', s3['msgs'][0][:66], '| undo -> valid', s4['use'])
        if not (s0['shown'] and s0['use'] and not s1['use'] and 'Supply Dock' in s1['msgs'][0] and s2['use'] and not s3['use'] and any('route' in m or 'rock' in m for m in s3['msgs']) and s4['use']): fail('map builder validation flow')
        if not s4['use']: print('   builder messages:', s4['msgs'])
        await pg.click('#mb-use', timeout=3000); await pg.wait_for_timeout(400)
        back = await pg.evaluate("({ setup: !document.getElementById('setup').hidden, builder: document.getElementById('mapbuilder').hidden, custom: document.getElementById('map-custom').checked, saved: !!localStorage.getItem('cz-map') })")
        await pg.click('#setup-levels input[value="hard"] + span'); await pg.click('#setup-start'); await pg.wait_for_timeout(2500)
        g1 = await pg.evaluate("(() => { const s = window.__rts.sim; return { custom: s.map.custom, mesas: s.setup.map.mesas.length, ramps: s.setup.map.ramps.length, derricks: s.map.derricks.length, ai: s.ais.length, ents: s.ents.length, tick: s.tick }; })()")
        await pg.wait_for_timeout(4000); g1b = await pg.evaluate("window.__rts.sim.tick")
        print('custom match   : back in lobby', back, '| in match', g1, '| sim running', g1b > g1['tick'])
        if not (back['setup'] and back['builder'] and back['custom'] and back['saved'] and g1['custom'] and g1['mesas'] == 1 and g1['ramps'] == 1 and g1['derricks'] == 4 and g1['ai'] == 1 and g1b > g1['tick']): fail('custom map did not reach the match')
        # ---- B. sandbox
        await grab(); await pg.goto(URL); await pg.wait_for_timeout(900)
        keep = await pg.evaluate("({ custom: document.getElementById('map-custom').checked, enabled: !document.getElementById('map-custom').disabled })")
        await pg.click('#setup-map input[value="canyon"] + span'); await pg.click('#setup-levels input[value="none"] + span'); await pg.click('#setup-start'); await pg.wait_for_timeout(2500)
        g2 = await pg.evaluate("(() => { const s = window.__rts.sim; return { noEnemy: s.noEnemy, ai: s.ais.length, enemyEnts: s.ents.filter(e => e.team === 1).length, sub: document.getElementById('brand-sub').textContent, custom: s.map.custom }; })()")
        print('sandbox        : saved map remembered', keep, '|', g2)
        if not (keep['custom'] and keep['enabled'] and g2['noEnemy'] and g2['ai'] == 0 and g2['enemyEnts'] == 0 and 'Sandbox' in g2['sub'] and not g2['custom']): fail('No-enemy sandbox')
        # ---- C. airfield in the running page (sandbox match, Vanguard)
        air = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, E = await import('./js/sim/entities.js'), EC = await import('./js/sim/econ.js'), R = await import('./js/sim/factionRegistry.js'), A = await import('./js/sim/air.js');
            const hq = s.ents.find(e => e.kind === 'bldg' && e.team === 0 && R.BLDGS[e.type].role === 'cc'); s.teams[0].money = 30000; s.fog.exp[0].fill(1);
            E.makeBldg(s, 'v_factory', 0, hq.cx + 16, hq.cz - 2); E.makeBldg(s, 'v_power', 0, hq.cx + 28, hq.cz - 2); E.makeBldg(s, 'v_power', 0, hq.cx + 28, hq.cz + 6); const f = E.makeBldg(s, 'v_airfield', 0, hq.cx + 12, hq.cz - 30, false); s.nav.rebuild(); EC.completeBldg(s, f);
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
            const done = await wait(() => { seen.add(jet.as); const v = view(); if (v) { if (jet.as === 'backtaxi') rollAlt = Math.min(rollAlt, v.alt); maxAlt = Math.max(maxAlt, v.alt); if (jet.altK >= 1 && v.gear.visible === false) gearUp = true; } return jet.as === 'parked' && seen.has('rollout'); }, 60000);
            out.states = [...seen]; out.done = !!done; out.maxAlt = +maxAlt.toFixed(1); out.cruise = d.alt; out.gearUp = gearUp; out.taxiAlt = +rollAlt.toFixed(2); out.endAlt = +view().alt.toFixed(2);
            s.issue({ t: 'train', id: f.id, type: 'v_comanche' });
            const heli = await wait(() => s.ents.find(e => e.type === 'v_comanche'), 30000); out.heli = !!heli;
            if (heli) { out.heliStart = { as: heli.as, altK: heli.altK, onPad: Math.hypot(heli.x - f.heli.x, heli.z - f.heli.z) < 0.01 }; await wait(() => heli.altK >= 1, 8000); await new Promise(r => setTimeout(r, 200)); out.heliUp = { altK: heli.altK, viewAlt: +g.view.views.get(heli.id).alt.toFixed(1), cruise: R.UNITS.v_comanche.alt }; }
            return out; }""")
        await pg.screenshot(path=OUT + '/p5_airfield.png')
        print('airfield       : build menu', [m for m in air['menu'] if 'Raptor' in m or 'Comanche' in m], '| jet states', air.get('states'), '| view height parked', air.get('parkedAlt'), 'taxi', air.get('taxiAlt'), 'peak', air.get('maxAlt'), 'of cruise', air.get('cruise'), 'after landing', air.get('endAlt'), '| gear down on pad', air.get('gearDown'), 'up in flight', air.get('gearUp'))
        print('helipad        :', air.get('heliStart'), '->', air.get('heliUp'))
        want = ['taxi', 'backtaxi', 'lineup', 'roll', 'out', 'return', 'final', 'rollout', 'taxiin', 'park', 'parked']
        if not (air.get('done') and all(w in air['states'] for w in want) and air['parkedAlt'] < 2 and air['taxiAlt'] < 2 and abs(air['maxAlt'] - air['cruise']) < 0.5 and air['endAlt'] < 2 and air['gearDown'] and air['gearUp']): fail('jet take-off / landing in the page')
        if not (air.get('heli') and air['heliStart']['as'] == 'spool' and air['heliStart']['altK'] == 0 and air['heliStart']['onPad'] and air['heliUp']['altK'] == 1 and abs(air['heliUp']['viewAlt'] - air['heliUp']['cruise']) < 0.5): fail('helicopter lift-off in the page')
        await grab()
        print('three.js API   : properties the game read that the real r158 classes do not have:', len(reads)); [print('    ', k, '<-', v) for k, v in sorted(reads.items())]
        print('console errors :', len(errs)); [print('   ', e[:400]) for e in errs[:10]]
        bad += len(errs) + len(reads)
        await b.close()
    print('BATCH 3 CLIENT:', 'all checks passed' if not bad else f'{bad} FAILURES')
try: asyncio.run(main())
finally: srv.terminate()
