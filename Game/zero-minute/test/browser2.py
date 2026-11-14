# Phase 2 client smoke test: real page + real game code, stand-in THREE (no WebGL needed).
import asyncio, sys, subprocess, time, re
from playwright.async_api import async_playwright
ROOT = '/home/claude/rts'; OUT = sys.argv[1]
html = open(ROOT + '/index.html').read()
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>', '<script src="test/mock-three.js"></script>')
html = re.sub(r'<link rel="stylesheet" href="https://fonts[^>]*>', '', html)
open(ROOT + '/_test.html', 'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
FF = """(n) => { const g = window.__rts; for (let i = 0; i < n; i++) { g.sim.step(); const ev = g.sim.events; g.sim.events = []; g.view.handleEvents(ev); g.hud.handleEvents(ev); } return g.sim.tick; }"""
async def run(p, mine, foe, shots):
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = await b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []
    pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text and '404' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
    await pg.goto('http://localhost:8766/_test.html'); await pg.wait_for_timeout(1200)
    cards = await pg.evaluate("document.querySelectorAll('#setup-factions .fcard').length")
    if shots: await pg.screenshot(path=OUT + '/p2_setup.png')
    await pg.click(f'label.fcard:has(#fac-{mine})'); await pg.click(f'label.fchip:has(#foe-{foe})'); await pg.click('label.fchip:has(#lvl-easy)'); await pg.click('#setup-start')
    await pg.wait_for_timeout(1500)
    out = {'cards': cards, 'running': await pg.evaluate('!!window.__rts'), 'fatal': await pg.evaluate("document.getElementById('fatal').hidden ? '' : document.getElementById('fatal-text').textContent.slice(0,400)")}
    if not out['running']: print(mine, foe, out, errs[:5]); await b.close(); return 1
    out['matchup'] = await pg.evaluate("document.getElementById('brand-sub').textContent")
    # builder -> build menu
    await pg.evaluate("""() => { const g = window.__rts, U = g.sim.ents.find(e => e.kind==='unit' && e.team===0 && g.hud.buttons); g.ui.selection.clear();
        for (const e of g.sim.ents) if (e.kind==='unit' && e.team===0) { g.ui.selection.add(e.id); break; } }""")
    await pg.evaluate("""() => { const g = window.__rts; g.ui.selection.clear(); const b = g.sim.ents.find(e => e.kind==='unit' && e.team===0 && g.hud.F.roles.builder === e.type); g.ui.selection.add(b.id); }""")
    await pg.wait_for_timeout(300)
    out['buildMenu'] = await pg.evaluate("[...document.querySelectorAll('#cmd .cbtn .nm')].map(e => e.textContent).join(', ')")
    if shots: await pg.screenshot(path=OUT + f'/p2_{mine}_build.png')
    # promotions: grant XP through the sim's own path, open with G, spend points
    await pg.evaluate("""async () => { const g = window.__rts; const m = await import('./js/sim/entities.js'); m.addGeneralXp(g.sim, 0, 5000); }""")
    await pg.evaluate(FF, 2); await pg.wait_for_timeout(300)
    await pg.keyboard.press('KeyG'); await pg.wait_for_timeout(300)
    out['promoOpen'] = await pg.evaluate("!document.getElementById('promo').hidden")
    out['nodes'] = await pg.evaluate("document.querySelectorAll('#promo-tree .node').length")
    for _ in range(6):
        btn = await pg.query_selector('#promo-tree button[data-node]')
        if not btn: break
        await btn.click(); await pg.evaluate(FF, 2); await pg.wait_for_timeout(250)
    if shots: await pg.screenshot(path=OUT + f'/p2_{mine}_promo.png')
    out['promos'] = await pg.evaluate("[...window.__rts.sim.teams[0].promos].join(',')")
    await pg.keyboard.press('KeyG'); await pg.wait_for_timeout(200)
    out['promoClosed'] = await pg.evaluate("document.getElementById('promo').hidden")
    # support power: click button, move reticle, click target
    pws = await pg.evaluate("[...document.querySelectorAll('#pw .pbtn')].map(b => b.dataset.power)")
    out['powers'] = pws
    if pws:
        await pg.click(f'#pw .pbtn[data-power="{pws[0]}"]'); await pg.mouse.move(640, 300); await pg.wait_for_timeout(250)
        out['reticle'] = await pg.evaluate("JSON.stringify(window.__rts.ui.power)")
        out['modeText'] = await pg.evaluate("document.getElementById('mode').textContent")
        if shots: await pg.screenshot(path=OUT + f'/p2_{mine}_power.png')
        await pg.mouse.click(640, 300); await pg.evaluate(FF, 3); await pg.wait_for_timeout(300)
        out['cooldown'] = await pg.evaluate(f"window.__rts.sim.teams[0].powerReady['{pws[0]}'] > window.__rts.sim.tick")
        out['strikesOrUnits'] = await pg.evaluate("window.__rts.sim.strikes ? window.__rts.sim.strikes.length : -1")
    # play on: scripted economy + 5 minutes of sim through the real event handlers
    await pg.evaluate("""() => { const g = window.__rts, s = g.sim, F = g.hud.F, T = s.teams[0]; T.money += 20000;
        const bld = s.ents.find(e => e.kind==='unit' && e.team===0 && e.type===F.roles.builder);
        const plan = [[F.roles.power, 44, 212], [F.roles.supply, 60, 204], [F.roles.barracks, 48, 186], [F.roles.factory, 62, 184], [F.roles.defense, 84, 170], [F.roles.airfield, 34, 170]].filter(p => p[0]);
        window.__plan = plan; window.__bid = bld.id; }""")
    for i in range(6):
        await pg.evaluate("""(i) => { const g = window.__rts, p = window.__plan[i]; if (p) g.sim.issue({ t: 'build', id: window.__bid, type: p[0], cx: p[1], cz: p[2] }); }""", i)
        await pg.evaluate(FF, 420)
    await pg.evaluate("""() => { const g = window.__rts, s = g.sim; for (const b of s.ents) if (b.kind==='bldg' && b.team===0 && b.done) for (const t of (g.hud.F && (s.byId.get(b.id), [])) ) {} }""")
    await pg.evaluate("""async () => { const g = window.__rts, s = g.sim; const R = await import('./js/sim/factionRegistry.js');
        for (const b of s.ents) if (b.kind==='bldg' && b.team===0 && b.done) for (const t of (R.BLDGS[b.type].trains || [])) { s.issue({ t: 'train', id: b.id, type: t }); } }""")
    await pg.evaluate(FF, 1500)
    # select everything, hover, overlay paths
    await pg.evaluate("() => { const g = window.__rts; g.ui.selection.clear(); for (const e of g.sim.ents) if (e.team===0) g.ui.selection.add(e.id); }")
    await pg.mouse.move(600, 320); await pg.wait_for_timeout(500)
    out['army'] = await pg.evaluate("window.__rts.sim.ents.filter(e => e.kind==='unit' && e.team===0).map(e => e.type).join(',')")
    await pg.evaluate("() => { const g = window.__rts; g.ui.selection.clear(); const u = g.sim.ents.filter(e => e.kind==='unit' && e.team===0).pop(); if (u) g.ui.selection.add(u.id); }")
    await pg.wait_for_timeout(300)
    out['unitButtons'] = await pg.evaluate("[...document.querySelectorAll('#cmd .cbtn .nm')].map(e => e.textContent).join(', ')")
    await pg.evaluate("() => { const g = window.__rts; g.ui.selection.clear(); const b = g.sim.ents.filter(e => e.kind==='bldg' && e.team===0 && e.done).pop(); if (b) g.ui.selection.add(b.id); }")
    await pg.wait_for_timeout(300)
    out['bldgButtons'] = await pg.evaluate("[...document.querySelectorAll('#cmd .cbtn .nm')].map(e => e.textContent).join(', ') || (document.querySelector('#cmd .hint') || {}).textContent")
    await pg.evaluate(FF, 4200); await pg.wait_for_timeout(600)
    out['tick'] = await pg.evaluate('window.__rts.sim.tick'); out['perf'] = await pg.evaluate("document.getElementById('perf').textContent")
    if shots:
        await pg.screenshot(path=OUT + f'/p2_{mine}_late.png')
        await pg.set_viewport_size({'width': 400, 'height': 780}); await pg.wait_for_timeout(400)
        out['phoneOverflow'] = await pg.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
    out['errors'] = len(errs)
    print(mine, 'v', foe, out)
    for e in errs[:12]: print('   ', e[:500])
    await b.close(); return len(errs)
async def main():
    async with async_playwright() as p:
        bad = 0
        for mine, foe, shots in [('vanguard', 'redhammer', True), ('redhammer', 'sandstorm', True), ('sandstorm', 'vanguard', True)]:
            bad += await run(p, mine, foe, shots)
        print('CLIENT SMOKE:', 'clean' if not bad else f'{bad} errors')
try: asyncio.run(main())
finally: srv.terminate()
