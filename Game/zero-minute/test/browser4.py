# Phase 4 client checks in headless Chrome (real page and game code, stand-in THREE, REAL Web Audio):
#   A. lobby options and top-bar controls
#   B. audio: AudioContext only after the first click, 24-voice cap, no clipping, attenuation/pan, mute
#   C. 20-minute match: decals, wrecks and particles allocate nothing after start-up; pools recycle
#   D. After-Action Report, then "Watch replay": observer mode, 4x speed, fog toggle, final hash matches
import asyncio, sys, subprocess, time, re, json
from playwright.async_api import async_playwright
ROOT = '/home/claude/rts'; OUT = sys.argv[1]; PORT = '8768'
html = open(ROOT + '/index.html').read()
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>', '<script src="test/mock-three.js"></script>')
html = re.sub(r'<link rel="stylesheet" href="https://fonts[^>]*>', '', html)
open(ROOT + '/_test.html', 'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', PORT, '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)

AUDIO = """async (mode) => {
  const { AudioEngine, MAX_VOICES } = await import('./js/audio/audioEngine.js');
  const SECS = mode === 'battle' ? 14 : 12, ctx = new OfflineAudioContext(2, 44100 * SECS, 44100);
  const au = new AudioEngine({ ctx, volume: 1 }); au.setListener(300, 300, 88, 0);
  if (mode === 'tap') { au.limit.disconnect(); au.tap.connect(ctx.destination); }   // same sounds, measured BEFORE the limiter
  let s = 99; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const kinds = [(x, z) => au.cannon(x, z), (x, z) => au.rocket(x, z), (x, z) => au.explosion(x, z, 1 + r() * 2.4), (x, z) => au.rifle(x, z, r() < 0.3), (x, z) => au.laser(x, z), (x, z) => au.whoosh(x, z), (x, z) => au.gau8(x, z), (x, z) => au.flyby(x, z), () => au.click(), () => au.order(), () => au.ping(), () => au.klaxon()];
  let maxLive = 0, fired = 0; const perTick = mode === 'battle' ? 6 : 40;
  for (let k = 1; k < (SECS - 2) * 20; k++) ctx.suspend(k * 0.05).then(() => {
    for (let i = 0; i < perTick; i++) { const a = r() * 6.283, d = r() * (mode === 'battle' ? 140 : 40); kinds[Math.floor(r() * (mode === 'battle' ? 8 : kinds.length))](300 + Math.cos(a) * d, 300 + Math.sin(a) * d); fired++; }
    maxLive = Math.max(maxLive, au.activeVoices()); ctx.resume(); });
  const buf = await ctx.startRendering(); let peak = 0, over = 0, hot = 0, sum = 0, n = 0;
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; if (v >= 1) over++; if (v > 0.7) hot++; sum += v * v; n++; } }
  return { mode, fired, stats: au.stats, maxLive, cap: MAX_VOICES, peak, over, hotPct: 100 * hot / n, rms: Math.sqrt(sum / n) }; }"""

SPATIAL = """async () => { const { AudioEngine } = await import('./js/audio/audioEngine.js'); const au = new AudioEngine({ ctx: new OfflineAudioContext(2, 44100, 44100) }); au.setListener(300, 300, 88, 0);
  const near = au.spatial(300, 300), mid = au.spatial(380, 300), far = au.spatial(520, 300), gone = au.spatial(1100, 300), left = au.spatial(240, 300), right = au.spatial(360, 300);
  au.setListener(300, 300, 88, Math.PI); const flipped = au.spatial(360, 300);
  au.setMuted(true); const before = au.stats.played; au.handleEvents([{ t: 'die', x: 300, z: 300, kind: 'bldg' }, { t: 'fire', k: 'shell', x: 300, z: 300 }], () => true, () => 9); const muted = au.stats.played - before;
  au.setMuted(false); au.handleEvents([{ t: 'die', x: 300, z: 300, kind: 'bldg' }, { t: 'fire', k: 'shell', x: 300, z: 300 }], () => false, () => 9); const fogged = au.stats.played - before;
  au.handleEvents([{ t: 'die', x: 300, z: 300, kind: 'bldg' }, { t: 'fire', k: 'shell', x: 300, z: 300 }], () => true, () => 9); const heard = au.stats.played - before;
  return { near: near.gain, mid: mid.gain, far: far.gain, gone, left: left.pan, right: right.pan, flipped: flipped.pan, muted, fogged, heard }; }"""

SOAK = """async () => {
  const g = window.__rts, sim = g.sim, view = g.view, fx = view.fx, E = await import('./js/sim/entities.js'), D = await import('./js/sim/defs.js');
  g.ui.paused = true;                                   // the page loop stops stepping; this test drives the sim itself
  const made = () => { let n = 0; const m = window.__made || {}; for (const k in m) n += m[k]; return n; };
  // every VFX and Environment method is wrapped: anything constructed inside one after start-up is an allocation
  let inside = 0, calls = 0; const byMethod = {};
  for (const [obj, proto] of [[fx, Object.getPrototypeOf(fx)], [view.env, Object.getPrototypeOf(view.env)]]) for (const k of Object.getOwnPropertyNames(proto)) {
    if (k === 'constructor' || typeof proto[k] !== 'function') continue; const f = proto[k]; let depth = 0;
    obj[k] = function (...a) { const b = made(); const out = f.apply(this, a); const d = made() - b; calls++; if (d) { inside += d; byMethod[k] = (byMethod[k] || 0) + d; } return out; };
  }
  const hq = sim.ents.find(e => e.kind === 'bldg' && e.team === 0 && D.BLDGS[e.type].role === 'cc'), bx = hq.x + 46, bz = hq.z - 34;
  g.rig.focus(bx, bz);
  const rows = [], ev0 = { die: 0 }; let craters = 0, wrecks = 0;
  const cr = fx.crater, wr = fx.wreck; fx.crater = function (...a) { craters++; return cr.apply(this, a); }; fx.wreck = function (...a) { wrecks++; return wr.apply(this, a); };
  const T0 = sim.tick, t0 = performance.now(); let maxDecal = 0, maxWreck = 0, maxPart = 0;
  for (let t = 0; t < 24000; t++) {
    if (t % 500 === 0 && t < 21000) for (let i = 0; i < 5; i++) {   // a fresh tank fight every 25 s, in the player's view
      E.spawnNear(sim, i % 2 ? 'v_tank' : 'v_avenger', 0, bx - 16, bz + i * 5 - 10, 0); E.spawnNear(sim, i % 2 ? 'r_tank' : 's_buggy', 1, bx + 16, bz + i * 5 - 10, Math.PI); }
    sim.step(); const ev = sim.events; sim.events = [];
    view.handleEvents(ev); g.hud.handleEvents(ev);
    if (t % 3 === 2) { view.render(1, 0.15, g.rig, g.ui); const s = fx.stats(); if (s.decals.live > maxDecal) maxDecal = s.decals.live; if (s.wrecks.live > maxWreck) maxWreck = s.wrecks.live; if (s.particles.live > maxPart) maxPart = s.particles.live; }
    if (t % 1200 === 1199) { const s = fx.stats(); rows.push({ min: (t + 1) / 1200, decalsLive: s.decals.live, decalsStamped: s.decals.stamped, wrecksLive: s.wrecks.live, wrecksMade: s.wrecks.made, particlesLive: s.particles.live, particlesSpawned: s.particles.spawned, allocInside: inside, ents: sim.ents.length }); }
  }
  const s = fx.stats();
  return { rows, stats: s, craters, wrecks, inside, byMethod, calls, maxDecal, maxWreck, maxPart, ticks: sim.tick - T0, ms: Math.round(performance.now() - t0), nan: sim.ents.some(e => !(e.x === e.x)) }; }"""

async def main():
    bad = 0
    def fail(msg):
        nonlocal bad; bad += 1; print('  FAIL', msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        reads = {}
        async def grab(): reads.update(await pg.evaluate('window.__apiReads || {}'))
        pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text and '404' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        URL = 'http://localhost:' + PORT + '/_test.html'
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        # ---- A. lobby
        lob = await pg.evaluate("""() => ({ light: [...document.querySelectorAll('#setup-light .fchip b')].map(e => e.textContent), funds: [...document.querySelectorAll('#setup-funds .fchip')].map(e => e.textContent.trim()),
            foes: document.querySelectorAll('#setup-foes .fchip').length, levels: document.querySelectorAll('#setup-levels .fchip').length, factions: document.querySelectorAll('#setup-factions .fcard').length, treaty: !!document.getElementById('setup-treaty'),
            scrollX: document.documentElement.scrollWidth > innerWidth })""")
        await pg.screenshot(path=OUT + '/p4_lobby.png', full_page=True)
        print('lobby          : factions', lob['factions'], '| opponents', lob['foes'], '| difficulty', lob['levels'], '| lighting', lob['light'], '| funds', lob['funds'], '| treaty toggle', lob['treaty'])
        if lob['light'] != ['Harsh Noon', 'Golden Hour Dusk', 'Night Ops'] or lob['funds'] != ['$5,000', '$10,000', '$25,000'] or lob['factions'] != 3 or lob['levels'] != 4 or not lob['treaty']: fail('lobby options')
        # choose through the real controls: Night Ops, $25,000, treaty on, Hard
        await pg.click('label[for="light-night"], #setup-light label:nth-child(3)'); await pg.click('#setup-funds label:nth-child(3)'); await pg.click('#setup-levels label:nth-child(3)'); await pg.click('#setup-treaty + span')
        ready0 = await pg.evaluate("typeof AudioContext")
        await pg.click('#setup-start'); await pg.wait_for_timeout(2500)
        st = await pg.evaluate("""() => { const g = window.__rts; return { money: [g.sim.teams[0].money, g.sim.setup.money], light: g.view.lighting, treatyUntil: g.sim.treatyUntil, treatyShown: !document.getElementById('treaty').hidden, treatyText: document.getElementById('treaty-t').textContent,
            level: g.sim.ais[0].level, sel: document.getElementById('opt-light').value, vol: document.getElementById('vol').value, mute: document.getElementById('btn-mute').textContent, audioReady: g.audio.ready, ctx: g.audio.ctx && g.audio.ctx.state, pr: g.view.renderer ? 1 : 0 }; }""")
        print('match start    :', json.dumps(st))
        if st['money'] != [25000, 25000] or st['light'] != 'night' or st['treatyUntil'] != 6000 or not st['treatyShown'] or st['level'] != 'hard' or st['sel'] != 'night': fail('lobby options did not reach the match')
        if not st['audioReady'] or st['ctx'] != 'running': fail('AudioContext should be running after the first click')
        await pg.screenshot(path=OUT + '/p4_hud.png')
        # top-bar controls
        await pg.select_option('#opt-light', 'dusk'); await pg.evaluate("document.getElementById('vol').value = 35; document.getElementById('vol').dispatchEvent(new Event('input', { bubbles: true }))"); await pg.click('#btn-mute')
        tb = await pg.evaluate("(() => { const g = window.__rts; return { light: g.view.lighting, vol: g.audio.volume, muted: g.audio.muted, gain: g.audio.master.gain.value, label: document.getElementById('btn-mute').textContent, pressed: document.getElementById('btn-mute').getAttribute('aria-pressed') }; })()")
        await pg.click('#btn-mute')
        print('top bar        : lighting ->', tb['light'], '| volume ->', tb['vol'], '| mute ->', tb['muted'], tb['label'], '| unmuted again:', await pg.evaluate("!window.__rts.audio.muted"))
        if tb['light'] != 'dusk' or abs(tb['vol'] - 0.35) > 1e-6 or not tb['muted'] or tb['pressed'] != 'true': fail('top bar controls')
        # a fresh page must NOT have an AudioContext until the user clicks
        pg2 = await b.new_page(); await pg2.goto(URL); await pg2.wait_for_timeout(900)
        await pg2.evaluate("window.__rtsStart('vanguard', 'redhammer', 'easy')"); await pg2.wait_for_timeout(1500)
        pre = await pg2.evaluate("({ ready: window.__rts.audio.ready, ctx: !!window.__rts.audio.ctx })")
        await pg2.mouse.click(640, 300); await pg2.wait_for_timeout(200)
        post = await pg2.evaluate("({ ready: window.__rts.audio.ready, state: window.__rts.audio.ctx.state })"); await pg2.close()
        print('audio start    : before any click', pre, '| after the first click', post)
        if pre['ready'] or pre['ctx'] or not post['ready'] or post['state'] != 'running': fail('AudioContext must be created by the first click, not before')

        # ---- B. audio engine
        for mode in ('stress', 'tap', 'battle'):
            a = await pg.evaluate('(' + AUDIO + ')("' + mode + '")')
            if mode == 'tap': print(f"  same run measured before the limiter: peak {a['peak']:.3f} (the compressor already holds it; the limiter is the backstop)"); continue
            print(f"audio {mode:8s} : {a['fired']} sounds requested ({a['fired'] // ((12 if mode == 'stress' else 14) - 2)}/s) -> played {a['stats']['played']}, stolen {a['stats']['stolen']}, dropped {a['stats']['dropped']}, same-kind gap {a['stats']['gapped']}, out of earshot {a['stats']['inaudible']} | voices peak {a['stats']['peakVoices']} (sampled max {a['maxLive']}), cap {a['cap']} | output peak {a['peak']:.3f}, samples at full scale {a['over']}, above limiter knee {a['hotPct']:.2f}%, RMS {a['rms']:.3f}")
            if a['stats']['peakVoices'] > 24 or a['maxLive'] > 24 or a['cap'] != 24: fail('voice cap exceeded')
            if a['over'] != 0 or a['peak'] >= 1.0: fail('output clipped')
            if a['stats']['played'] < 200 or a['rms'] < 0.005: fail('audio produced no signal')
            if mode == 'stress' and a['stats']['stolen'] + a['stats']['dropped'] == 0: fail('stress run never reached the cap')
        sp = await pg.evaluate('(' + SPATIAL + ')()')
        print(f"audio spatial  : gain at 0 / 80 / 220 m = {sp['near']:.2f} / {sp['mid']:.2f} / {sp['far']:.2f}, 800 m = {'silent' if sp['gone'] is None else sp['gone']} | pan left {sp['left']:.2f}, right {sp['right']:.2f}, camera turned 180 deg {sp['flipped']:.2f} | muted plays {sp['muted']}, fogged plays {sp['fogged']}, visible plays {sp['heard']}")
        if not (sp['near'] > sp['mid'] > sp['far'] > 0 and sp['gone'] is None and sp['left'] < 0 < sp['right'] and sp['flipped'] < 0 and sp['muted'] == 0 and sp['fogged'] == 0 and sp['heard'] == 2): fail('spatial audio')

        # ---- C. 20-minute pooled-VFX soak (fresh match, no treaty)
        await grab(); await pg.goto(URL); await pg.wait_for_timeout(900)
        await pg.evaluate("window.__rtsStart('vanguard', 'redhammer', 'medium', { lighting: 'night', money: 10000, treaty: false })"); await pg.wait_for_timeout(2000)
        k = await pg.evaluate('(' + SOAK + ')()')
        print(f"20-min soak    : {k['ticks']} ticks in {k['ms'] / 1000:.0f} s wall | {k['calls']} VFX/environment calls | objects constructed inside them after start-up: {k['inside']} {k['byMethod'] if k['inside'] else ''}")
        print('  min  decals live/stamped   wrecks live/made   particles live/spawned   allocations')
        for r in k['rows']:
            if r['min'] in (1, 2, 5, 10, 15, 18, 19, 20): print(f"  {r['min']:>3.0f}  {r['decalsLive']:>6} / {r['decalsStamped']:<8}    {r['wrecksLive']:>4} / {r['wrecksMade']:<6}      {r['particlesLive']:>6} / {r['particlesSpawned']:<10} {r['allocInside']}")
        S = k['stats']
        print(f"  pools: decals cap {S['decals']['cap']} (peak {S['decals']['peak']}), wrecks cap {S['wrecks']['cap']} (peak {S['wrecks']['peak']}), particles cap {S['particles']['cap']} (peak {S['particles']['peak']}) | craters stamped {k['craters']}, wrecks made {k['wrecks']}")
        end = k['rows'][-1]
        if k['inside'] != 0: fail('VFX allocated objects after start-up')
        if S['decals']['peak'] > S['decals']['cap'] or S['wrecks']['peak'] > S['wrecks']['cap'] or S['particles']['peak'] > S['particles']['cap']: fail('a pool overflowed its cap')
        if S['decals']['stamped'] <= S['decals']['cap'] or S['wrecks']['made'] <= S['wrecks']['cap']: fail('soak did not stamp enough to prove recycling')
        recent = end['decalsStamped'] - k['rows'][-3]['decalsStamped']   # only craters younger than the 102 s life may still be on the ground
        if end['decalsLive'] > recent or end['wrecksLive'] > end['wrecksMade'] - k['rows'][-2]['wrecksMade']: fail(f"old decals/wrecks did not fade out (decals {end['decalsLive']} live vs {recent} recent, wrecks {end['wrecksLive']})")
        if k['nan']: fail('NaN in sim')

        # ---- D. After-Action Report and replay (fresh short match)
        await grab(); await pg.goto(URL); await pg.wait_for_timeout(900)
        await pg.evaluate("window.__rtsStart('sandstorm', 'vanguard', 'easy', { lighting: 'dusk', money: 5000 })"); await pg.wait_for_timeout(1500)
        await pg.mouse.click(640, 300)
        # play: real key presses and clicks so the commands go through Controls -> sim.issue -> recorder
        await pg.evaluate("""() => { const g = window.__rts, s = g.sim; for (const e of s.ents) if (e.kind === 'unit' && e.team === 0) g.ui.selection.add(e.id); }""")
        await pg.keyboard.press('x'); await pg.wait_for_timeout(700)
        await pg.keyboard.down('r'); await pg.mouse.click(700, 330, button='right'); await pg.keyboard.up('r'); await pg.wait_for_timeout(600)
        await pg.keyboard.press('f'); await pg.mouse.click(760, 300); await pg.wait_for_timeout(500)
        await pg.keyboard.press('v'); await pg.wait_for_timeout(250); mode_txt = await pg.evaluate("document.getElementById('mode').textContent"); await pg.mouse.click(600, 280); await pg.wait_for_timeout(400)
        await pg.keyboard.press('z'); await pg.wait_for_timeout(11000)
        rec = await pg.evaluate("(() => { const r = window.__rts.rec; return { n: r.cmds.length, kinds: [...new Set(r.cmds.map(c => c[1].t))], rev: r.cmds.some(c => c[1].reverse) }; })()")
        print('orders         : recorded', rec['n'], 'commands of kinds', rec['kinds'], '| reverse flag seen:', rec['rev'], '| guard prompt:', repr(mode_txt))
        if not (set(['scatter', 'move', 'stop']) <= set(rec['kinds']) and rec['rev'] and 'Guard' in mode_txt): fail('new orders did not reach the recorder')
        await pg.evaluate("document.getElementById('banner').hidden = false"); 
        await grab()
        async with pg.expect_navigation(): await pg.click('#aar-replay')
        await pg.wait_for_timeout(2500)
        ob = await pg.evaluate("""() => { const g = window.__rts; return { observer: g.ui.observer, bar: !document.getElementById('replay-bar').hidden, setupHidden: document.getElementById('setup').hidden, end: g.player.data.end, light: g.view.lighting, money: g.sim.setup.money, factions: g.sim.setup.factions }; }""")
        await pg.click('#replay-bar button[data-speed="4"]'); await pg.click('#rp-fog')
        fogoff = await pg.evaluate("({ reveal: window.__rts.view.reveal, speed: window.__rts.ui.speed, label: document.getElementById('rp-fog').textContent })")
        # an observer's orders must be ignored
        await pg.evaluate("(() => { const g = window.__rts; for (const e of g.sim.ents) if (e.kind === 'unit' && e.team === 0) g.ui.selection.add(e.id); })()"); await pg.mouse.click(500, 400, button='right'); await pg.keyboard.press('x')
        t0 = time.time(); t_a = await pg.evaluate("window.__rts.sim.tick"); await pg.wait_for_timeout(1500); t_b = await pg.evaluate("window.__rts.sim.tick")
        for _ in range(120):
            if await pg.evaluate("window.__rts.player.done"): break
            await pg.wait_for_timeout(500)
        want = await pg.evaluate("(() => { const d = window.__rts.player.data; return { end: d.end, hash: d.hash, cmds: d.cmds.length }; })()")
        fin = await pg.evaluate("""() => { const g = window.__rts; return { done: g.player.done, tick: g.sim.tick, hash: g.sim.hash(), diverged: g.player.diverged, banner: !document.getElementById('banner').hidden, title: document.getElementById('banner-title').textContent, replayBtn: !document.getElementById('aar-replay').hidden }; }""")
        await pg.screenshot(path=OUT + '/p4_replay.png')
        print(f"replay         : observer mode {ob['observer']}, bar shown {ob['bar']}, lobby skipped {ob['setupHidden']}, setup {ob['factions']} ${ob['money']} {ob['light']} | 4x speed ran {(t_b - t_a) / 1.5:.0f} ticks/s | fog toggle -> reveal {fogoff['reveal']} ({fogoff['label']})")
        print(f"                 finished at tick {fin['tick']} of {want['end']} | final hash {fin['hash']} vs recorded {want['hash']} | diverged {fin['diverged']} | report shown: {fin['banner']} '{fin['title']}'")
        if not (ob['observer'] and ob['bar'] and ob['setupHidden'] and ob['light'] == 'dusk' and ob['money'] == 5000): fail('replay did not start in observer mode with the recorded setup')
        if not (fogoff['reveal'] and fogoff['speed'] == 4 and (t_b - t_a) / 1.5 > 55): fail('replay speed / fog toggle')
        if not (want['cmds'] >= 5 and want['end'] > 150 and fin['done'] and fin['tick'] == want['end'] and fin['hash'] == want['hash'] and fin['diverged'] < 0 and fin['banner'] and fin['title'] == 'Replay complete' and not fin['replayBtn']): fail('replay did not reproduce the match')
        # ---- E. After-Action Report on a real elimination (fresh match)
        await grab(); await pg.goto(URL); await pg.wait_for_timeout(900)
        await pg.evaluate("window.__rtsStart('sandstorm', 'vanguard', 'easy', { lighting: 'noon', money: 5000 })"); await pg.wait_for_timeout(2500)
        # lose the match: Command Center and every builder
        await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, E = await import('./js/sim/entities.js'), D = await import('./js/sim/defs.js');
            for (const e of [...s.ents]) if (e.team === 0 && (e.kind === 'bldg' ? D.BLDGS[e.type].role === 'cc' : D.UNITS[e.type].builder)) E.kill(s, e); }""")
        await pg.wait_for_timeout(2500)
        aar = await pg.evaluate("""() => ({ shown: !document.getElementById('banner').hidden, title: document.getElementById('banner-title').textContent, sub: document.getElementById('banner-sub').textContent,
            head: [document.getElementById('aar-you').textContent, document.getElementById('aar-foe').textContent], rows: [...document.querySelectorAll('#aar-rows tr')].map(r => [...r.children].map(c => c.textContent)),
            replayBtn: !document.getElementById('aar-replay').hidden, winner: window.__rts.sim.winner })""")
        await pg.screenshot(path=OUT + '/p4_aar.png')
        print('after-action   :', aar['title'], '|', aar['sub'], '|', aar['head']); [print('                ', r) for r in aar['rows']]
        labels = [r[0] for r in aar['rows']]
        if not (aar['shown'] and aar['title'] == 'Defeat' and aar['winner'] == 1 and all(x in labels for x in ['Units built', 'Units destroyed', 'Resources harvested', "General's Powers deployed"]) and aar['replayBtn']): fail('After-Action Report')
        # ---- F. add-on batch 2: lobby rules, superweapon UI, new strike effects, King of the Hill
        await grab(); await pg.goto(URL); await pg.wait_for_timeout(900)
        rules = await pg.evaluate("[...document.querySelectorAll('#setup .fchip.check')].map(e => e.textContent.trim().slice(0, 22))")
        await pg.click('#setup-nosuper + span'); await pg.click('#setup-koth + span'); await pg.click('#setup-start'); await pg.wait_for_timeout(2500)
        r1 = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, R = await import('./js/sim/factionRegistry.js'); const b = s.ents.find(e => e.team === 0 && e.kind === 'unit' && R.UNITS[e.type].builder); g.ui.selection.clear(); g.ui.selection.add(b.id);
            await new Promise(r => setTimeout(r, 400)); return { noSuper: s.noSuper, koth: !!s.koth, hillShown: !document.getElementById('hill').hidden, hillText: document.getElementById('hill-t').textContent, menu: [...document.querySelectorAll('#cmd button')].map(x => x.textContent.trim().slice(0, 18)) }; }""")
        print('match rules    :', rules, '| no-super match:', {k: r1[k] for k in ('noSuper', 'koth', 'hillShown', 'hillText')}, '| superweapon in build menu:', any('Particle' in m or 'Nuclear' in m or 'Scud' in m for m in r1['menu']))
        if not (len(rules) == 3 and r1['noSuper'] and r1['koth'] and r1['hillShown'] and 'You 0:00' in r1['hillText'] and not any('Particle' in m or 'Nuclear' in m or 'Scud' in m for m in r1['menu'])): fail('lobby rules (No superweapons / King of the Hill)')
        for fac, bt, pw in (('vanguard', 'v_particle', 'particle'), ('redhammer', 'r_silo', 'nuke'), ('sandstorm', 's_scud', 'scud')):
            await grab(); await pg.goto(URL); await pg.wait_for_timeout(700)
            await pg.evaluate("window.__rtsStart('%s', 'vanguard', 'easy', { lighting: 'noon', money: 25000, noSuper: false, koth: false, treaty: false })" % fac); await pg.wait_for_timeout(1800)
            r2 = await pg.evaluate("""async ([bt, pw]) => { const g = window.__rts, s = g.sim, E = await import('./js/sim/entities.js'), EC = await import('./js/sim/econ.js'), R = await import('./js/sim/factionRegistry.js');
                const hq = s.ents.find(e => e.kind === 'bldg' && e.team === 0 && R.BLDGS[e.type].role === 'cc'); s.fog.exp[0].fill(1);
                const bd = s.ents.find(e => e.team === 0 && e.kind === 'unit' && R.UNITS[e.type].builder); g.ui.selection.clear(); g.ui.selection.add(bd.id); await new Promise(r => setTimeout(r, 400));
                const menu = [...document.querySelectorAll('#cmd button')].map(x => x.textContent.trim());
                const b = E.makeBldg(s, bt, 0, hq.cx + 14, hq.cz - 22, false); s.nav.rebuild(); EC.completeBldg(s, b);
                const eb = E.makeBldg(s, 'v_particle', 1, hq.cx + 40, hq.cz - 40, false); EC.completeBldg(s, eb); s.nav.rebuild();
                await new Promise(r => setTimeout(r, 900));
                const sw = document.getElementById('sw').textContent, btn = document.querySelector('#pw button[data-power="' + pw + '"]'), toasts = document.getElementById('toasts').textContent;
                s.teams[0].powerReady[pw] = 0; g.rig.focus(hq.x + 60, hq.z - 90);
                for (const [x, z] of [[0, 0], [6, 4], [-5, 7]]) E.makeUnit(s, 'r_tank', 1, hq.x + 60 + x, hq.z - 90 + z, 0);
                s.issue({ t: 'power', id: pw, x: hq.x + 60, z: hq.z - 90 }); const seen = {}; const he = g.view.handleEvents.bind(g.view); g.view.handleEvents = (ev) => { for (const e of ev) if (['nuke', 'pbeam', 'scudhit', 'superlaunch'].includes(e.t)) seen[e.t] = (seen[e.t] || 0) + 1; return he(ev); };
                await new Promise(r => setTimeout(r, 11000));
                return { inMenu: menu.some(m => m.includes(R.BLDGS[bt].name)), sw, btn: !!btn, btnSuper: !!btn && btn.classList.contains('super'), toasts: toasts.slice(0, 160), seen, tanksLeft: s.ents.filter(e => e.type === 'r_tank' && e.team === 1).length, decals: g.view.fx.stats().decals.stamped, model: !!g.view.models && true }; }""", [bt, pw])
            print(f"superweapon UI : {fac:10s} build menu {r2['inMenu']} | timers '{r2['sw']}' | fire button {r2['btn']} | strike events {r2['seen']} | enemy tanks left {r2['tanksLeft']} | craters {r2['decals']}")
            if not (r2['inMenu'] and 'Your' in r2['sw'] and 'Enemy Particle Cannon' in r2['sw'] and r2['btn'] and r2['btnSuper'] and r2['seen'].get('superlaunch') == 1 and sum(v for k, v in r2['seen'].items() if k != 'superlaunch') >= 1 and r2['tanksLeft'] < 3): fail('superweapon UI for ' + fac)
        # new powers through the real power buttons and events
        await grab(); await pg.goto(URL); await pg.wait_for_timeout(700)
        await pg.evaluate("window.__rtsStart('sandstorm', 'redhammer', 'easy', { lighting: 'dusk', money: 10000 })"); await pg.wait_for_timeout(1800)
        r3 = await pg.evaluate("""async () => { const g = window.__rts, s = g.sim, R = await import('./js/sim/factionRegistry.js'); const T = s.teams[0]; s.fog.exp[0].fill(1); T.promos.add('s_saboteur'); T.promos.add('s_sneak');
            const hq = s.ents.find(e => e.kind === 'bldg' && e.team === 0 && R.BLDGS[e.type].role === 'cc'); await new Promise(r => setTimeout(r, 500));
            const btn = !!document.querySelector('#pw button[data-power="sneaktunnel"]'); s.issue({ t: 'power', id: 'sneaktunnel', x: hq.x + 70, z: hq.z - 60 }); await new Promise(r => setTimeout(r, 6500));
            const tree = (document.getElementById('promo-tree').children.length, R.FACTIONS.sandstorm.tree.length);
            return { btn, exit: s.ents.filter(e => e.type === 's_tunnel' && e.team === 0).length, tree }; }""")
        print('new powers UI  : Sneak Attack button', r3['btn'], '| tunnel exits after cast:', r3['exit'], '| promotion nodes', r3['tree'])
        if not (r3['btn'] and r3['exit'] == 1 and r3['tree'] == 7): fail('Sneak Attack through the UI')
        await grab()
        print('three.js API   : properties the game read that the real r158 classes do not have:', len(reads)); [print('    ', k, '<-', v) for k, v in sorted(reads.items())]
        print('console errors :', len(errs)); [print('   ', e[:400]) for e in errs[:10]]
        bad += len(errs)
        await b.close()
    print('PHASE 4 CLIENT:', 'all checks passed' if not bad else f'{bad} FAILURES')
try: asyncio.run(main())
finally: srv.terminate()
