// Bootstrap: make sure Three.js is present (with CDN fallbacks), then start the game.
const fatal = (err) => {
  const box = document.getElementById('fatal');
  if (!box) return;
  box.hidden = false;
  document.getElementById('fatal-text').textContent = (err && (err.stack || err.message)) || String(err);
};
let reported = false;
const once = (err) => { if (!reported) { reported = true; fatal(err); } };
window.addEventListener('error', (e) => once(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => once(e.reason));

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed: ' + src)); document.head.appendChild(s); });
}
async function ensureThree() {
  if (globalThis.THREE) return;
  for (const url of ['https://unpkg.com/three@0.158.0/build/three.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.158.0/three.min.js']) {
    try { await loadScript(url); if (globalThis.THREE) return; } catch (e) { /* try the next host */ }
  }
  throw new Error('Three.js could not be loaded from any CDN. Check the network connection and reload.');
}

try {
  await ensureThree();
  const { boot } = await import('./game.js');
  boot();
  window.__rtsBooted = true; // lobby is up: silences the load watchdog in index.html
} catch (err) { once(err); }
