# Regression test for "THE GAME COULD NOT START": sit on the lobby well past the watchdog time.
import asyncio, sys, subprocess, time, re
from playwright.async_api import async_playwright
ROOT = '/home/claude/rts'
html = open(ROOT + '/index.html').read()
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>', '<script src="test/mock-three.js"></script>')
html = re.sub(r'<link rel="stylesheet" href="https://fonts[^>]*>', '', html)
wait = int(re.search(r'\}, (\d+)\);\n</script>', html).group(1))
open(ROOT + '/_test.html', 'w').write('<!doctype html><html><head><meta charset="utf-8"></head><body><style>[hidden]{display:none!important}</style>' + html + '</body></html>')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8768', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox']); pg = await b.new_page()
        await pg.goto('http://localhost:8768/_test.html'); await pg.wait_for_timeout(wait + 3000)
        idle = await pg.evaluate("({ fatal: !document.getElementById('fatal').hidden, lobby: !document.getElementById('setup').hidden, cards: document.querySelectorAll('#setup-factions .fcard').length, booted: !!window.__rtsBooted })")
        await pg.click('#setup-start'); await pg.wait_for_timeout(2500)
        run = await pg.evaluate("({ fatal: !document.getElementById('fatal').hidden, running: !!window.__rtsRunning, tick: window.__rts ? window.__rts.sim.tick : -1 })")
        print(f'lobby left idle {(wait + 3000) / 1000:.0f} s (watchdog at {wait / 1000:.0f} s):', idle, '| then started:', run)
        print('WATCHDOG:', 'ok' if (not idle['fatal'] and idle['lobby'] and idle['cards'] == 3 and not run['fatal'] and run['running'] and run['tick'] > 10) else 'FAIL')
        await b.close()
try: asyncio.run(main())
finally: srv.terminate()
