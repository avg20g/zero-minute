# Phase 3 client checks in headless Chrome (real page and game code, stand-in THREE):
#   A. which models come from the factory
#   B. A-10 attack pass: cannon decals, rocket smoke trails and blast decals along the flight vector
#   C. an enemy A-10 pass inside the player's fog draws nothing
import asyncio, sys, subprocess, time, re, json
from playwright.async_api import async_playwright
ROOT = '/home/claude/rts'; OUT = sys.argv[1]
html = open(ROOT + '/index.html').read()
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>', '<script src="test/mock-three.js"></script>')
html = re.sub(r'<link rel="stylesheet" href="https://fonts[^>]*>', '', html)
open(ROOT + '/_test.html', 'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
INSTRUMENT = """() => { const g = window.__rts, fx = g.view.fx, L = window.__log = { crater: [], explosion: [], streak: [], tracer: 0, planes: 0, rockets: 0, events: [] };
  for (const k of ['crater', 'explosion', 'streak']) { const f = fx[k].bind(fx); fx[k] = (...a) => { L[k].push(a.map(v => +(+v).toFixed(2))); return f(...a); }; }
  const tr = fx.tracer.bind(fx); fx.tracer = (...a) => { L.tracer++; return tr(...a); };
  const he = g.view.handleEvents.bind(g.view); g.view.handleEvents = (ev) => { for (const e of ev) if (['strafe', 'rocketfire', 'rockethit', 'power'].includes(e.t)) L.events.push({ t: e.t, x: +e.x.toFixed(2), z: +e.z.toFixed(2), team: e.team, tick: g.sim.tick }); return he(ev); };
  const pr = g.view.prop.bind(g.view); const seen = new Set(); g.view.prop = (id, make, stamp) => { if (!seen.has(id)) { seen.add(id); const s = g.sim.strikes.find(p => p.id === id); if (s && s.kind === 'plane') L.planes++; if (s && s.kind === 'rocket') L.rockets++; } return pr(id, make, stamp); }; }"""
async def main():
    bad = 0
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text and '404' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        await pg.goto('http://localhost:8767/_test.html'); await pg.wait_for_timeout(1200)
        levels = await pg.evaluate("[...document.querySelectorAll('#setup-levels .fchip')].map(e => e.textContent.trim())")
        await pg.screenshot(path=OUT + '/p3_setup.png')
        await pg.evaluate("window.__rtsStart('vanguard', 'vanguard', 'hard')"); await pg.wait_for_timeout(1800)
        print('setup          : difficulty tiers', levels, '| match', await pg.evaluate("document.getElementById('brand-sub').textContent"), '| external models', await pg.evaluate("JSON.stringify(window.__rtsModels)"))
        # ---- A. model sources
        src = await pg.evaluate("""async () => { const MF = await import('./js/render/modelFactory.js'), R = await import('./js/sim/factionRegistry.js'); const out = {};
            for (const id in R.UNITS) { const r = MF.createModel({ kind: 'unit', type: id, team: 0, variant: 0 }); (out[r.source] = out[r.source] || []).push(R.UNITS[id].name); }
            const pl = MF.createPlane('a10', 'vanguard', 0); out.a10 = !!(pl.g && pl.body && pl.gun); return out; }""")
        print('model sources  : factory assemblies:', ', '.join(src.get('assembly', [])), '| library:', len(src.get('library', [])), 'other units | A-10 rig', src['a10'])
        if not src['a10'] or len(src.get('assembly', [])) < 7: bad += 1; print('  FAIL model sources')
        # ---- B. player A-10 pass over three enemy tanks, in view
        await pg.evaluate(INSTRUMENT)
        info = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, E = await import('./js/sim/entities.js'), P = await import('./js/sim/powers.js');
            const hq = s.ents.find(e => e.kind === 'bldg' && e.team === 0); const tx = hq.x + 46, tz = hq.z - 6;
            for (const d of [-14, 0, 14]) { const u = E.spawnNear(s, 'r_tank', 1, tx + d * 0.98, tz - d * 0.13); u.order = { t: 'hold' }; }
            s.teams[0].promos.add('v_a10'); g.rig.focus(tx, tz);
            const okCast = P.usePower(s, 0, 'a10', tx, tz); const pl = s.strikes.find(p => p.kind === 'plane');
            return { ok: okCast, tx: pl.tx, tz: pl.tz, dx: pl.dx, dz: pl.dz, tick: s.tick }; }""")
        await pg.wait_for_timeout(8500)
        L = await pg.evaluate("window.__log")
        def frame(pt):  # (along, lateral) relative to the flight vector through the aim point
            rx, rz = pt[0] - info['tx'], pt[1] - info['tz']; return rx * info['dx'] + rz * info['dz'], -rx * info['dz'] + rz * info['dx']
        ev = L['events']; strafe = [e for e in ev if e['t'] == 'strafe']; hits = [e for e in ev if e['t'] == 'rockethit']; fires = [e for e in ev if e['t'] == 'rocketfire']
        # decals are matched to the sim's own impact events by position, so unrelated battle craters do not count
        def decal(e, size): return any(abs(c[0] - e['x']) < 0.02 and abs(c[1] - e['z']) < 0.02 and c[2] == size for c in L['crater'])
        gun = [e for e in strafe if decal(e, 3.4)]; blast = [e for e in hits if decal(e, 7)]
        pts = [frame((e['x'], e['z'])) for e in strafe + hits]
        on_line = all(abs(a[1]) <= 8 and -27 <= a[0] <= 27 for a in pts)
        # each rocket impact must have a smoke streak that ends on it, and no streak segment may be longer than a frame or two of flight
        ends = sum(any(abs(s[3] - h['x']) < 0.6 and abs(s[5] - h['z']) < 0.6 for s in L['streak']) for h in hits)
        seg = [((s[3]-s[0])**2 + (s[4]-s[1])**2 + (s[5]-s[2])**2) ** 0.5 for s in L['streak']]; trail = sum(seg)
        alongs = sorted(round(frame((h['x'], h['z']))[0]) for h in hits)
        res = { 'cannon impacts': len(strafe), 'cannon decals': len(gun), 'rockets launched': len(fires), 'rocket impacts': len(hits), 'blast decals': len(blast), 'rocket models drawn': L['rockets'], 'aircraft drawn': L['planes'],
                'trails ending on impact': ends, 'smoke trail metres': round(trail), 'longest trail gap m': round(max(seg), 1), 'streak segments': len(L['streak']), 'explosions': len(L['explosion']), 'tracers': L['tracer'], 'all impacts on flight line': on_line }
        tanks = await pg.evaluate("window.__rts.sim.ents.filter(e => e.type === 'r_tank' && e.team === 1).map(e => Math.round(e.hp))")
        print('A-10 pass      :', json.dumps(res)); print('                 rocket impacts along track (m):', alongs, '| lateral spread max', round(max(abs(a[1]) for a in pts), 1), 'm | enemy tanks left:', tanks)
        checks = [res['cannon impacts'] == 14 and res['cannon decals'] == 14, res['rockets launched'] == 6 and res['rocket impacts'] == 6 and res['blast decals'] == 6, res['rocket models drawn'] == 6 and res['aircraft drawn'] == 1,
                  res['trails ending on impact'] == 6, 6 * 25 < trail < 6 * 80 and max(seg) < 12, res['explosions'] >= 20, res['tracers'] > 0, on_line, len(tanks) == 0]
        if not all(checks): bad += 1; print('  FAIL A-10 pass checks', checks)
        await pg.screenshot(path=OUT + '/p3_a10.png')
        # ---- C. enemy pass in the player's fog: nothing may be drawn
        await pg.evaluate("() => { const L = window.__log; L.crater.length = L.explosion.length = L.streak.length = L.events.length = 0; L.tracer = L.planes = L.rockets = 0; }")
        fog = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, P = await import('./js/sim/powers.js');
            const hq = s.ents.find(e => e.kind === 'bldg' && e.team === 1); s.teams[1].promos.add('v_a10'); s.teams[1].powerReady.a10 = 0;
            const x = hq.x - 30, z = hq.z + 20; const cast = P.usePower(s, 1, 'a10', x, z);
            return { cast, playerSees: s.fog.visAt(0, x, z) }; }""")
        await pg.wait_for_timeout(8500)
        L2 = await pg.evaluate("window.__log")
        sim_side = len([e for e in L2['events'] if e['t'] in ('strafe', 'rockethit') and e['team'] == 1])
        drawn = len(L2['crater']) + len(L2['explosion']) + len(L2['streak']) + L2['tracer'] + L2['planes'] + L2['rockets']
        print('fogged pass    : enemy cast', fog['cast'], '| player has vision there:', fog['playerSees'], '| sim impacts', sim_side, '| aircraft, rockets, trails, decals, explosions drawn for the player:', drawn)
        if not (fog['cast'] and not fog['playerSees'] and sim_side == 20 and drawn == 0): bad += 1; print('  FAIL fogged pass')
        print('console errors :', len(errs)); [print('   ', e[:400]) for e in errs[:10]]
        bad += len(errs)
        await b.close()
    print('PHASE 3 CLIENT:', 'all checks passed' if not bad else f'{bad} FAILURES')
try: asyncio.run(main())
finally: srv.terminate()
