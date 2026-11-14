// Dumps a model rig as world-space point clouds per mesh (JSON on stdout), for drawing silhouettes.
// usage: node test/shape.mjs raptor
import { THREE } from './stub-three.mjs';
globalThis.THREE = THREE;
const MF = await import('../js/render/modelFactory.js');
const key = process.argv[2] || 'raptor', rig = (MF.ASSEMBLY[key] || MF.AIRCRAFT[key])(MF.paint('vanguard', 0));
const rot = (p, r) => { let [x, y, z] = p; let c = Math.cos(r.x), s = Math.sin(r.x); [y, z] = [y * c - z * s, y * s + z * c]; c = Math.cos(r.y); s = Math.sin(r.y); [x, z] = [x * c + z * s, -x * s + z * c]; c = Math.cos(r.z); s = Math.sin(r.z); [x, y] = [x * c - y * s, x * s + y * c]; return [x, y, z]; };
const local = (g) => { const out = [];
  if (g.kind === 'buffer') { const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 3) out.push([a[i], a[i + 1], a[i + 2]]); return out; }
  const [p0 = 1, p1 = 1, p2 = 1] = g.params;
  if (g.kind === 'box') { for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) out.push([x * p0, y * p1, z * p2]); }
  else if (g.kind === 'cylinder' || g.kind === 'cone') { const rt = g.kind === 'cone' ? 0 : p0, rb = g.kind === 'cone' ? p0 : p1, h = g.kind === 'cone' ? p1 : p2; for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; out.push([Math.cos(a) * rt, h / 2, Math.sin(a) * rt], [Math.cos(a) * rb, -h / 2, Math.sin(a) * rb]); } }
  else { for (let i = 0; i < 12; i++) for (let j = 0; j <= 6; j++) { const a = i / 12 * 6.283, b = j / 6 * 3.1416; out.push([Math.sin(b) * Math.cos(a) * p0, Math.cos(b) * p0, Math.sin(b) * Math.sin(a) * p0]); } }
  return out; };
const meshes = [];
const walk = (o, chain) => { const c2 = chain.concat([o]); if (o.isMesh) { let pts = local(o.geometry); for (let i = c2.length - 1; i >= 0; i--) { const n = c2[i]; pts = pts.map(p => { const q = rot([p[0] * n.scale.x, p[1] * n.scale.y, p[2] * n.scale.z], n.rotation); return [q[0] + n.position.x, q[1] + n.position.y, q[2] + n.position.z]; }); } meshes.push({ name: o.name, hex: o.material.color.hex, dark: o.material.color.hex < 0x505050, pts }); } for (const c of o.children) walk(c, c2); };
walk(rig.body, []);
console.log(JSON.stringify(meshes));
