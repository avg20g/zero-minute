// Minimal structural stand-in for THREE: enough to BUILD model rigs in Node and inspect them.
class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } setScalar(s) { return this.set(s, s, s); } copy(v) { return this.set(v.x, v.y, v.z); } }
class Obj {
  constructor() { this.position = new V3(); this.rotation = new V3(); this.scale = new V3(1, 1, 1); this.quaternion = { x: 0, y: 0, z: 0, w: 1 }; this.children = []; this.name = ''; this.visible = true; this.userData = {}; this.parent = null;
    const o = this; this.matrix = { e: null, fromArray(a) { this.e = a; return this; }, decompose(p, q, s) { const a = this.e; p.set(a[12], a[13], a[14]); s.set(Math.hypot(a[0], a[1], a[2]), Math.hypot(a[4], a[5], a[6]), Math.hypot(a[8], a[9], a[10])); return o; } }; }
  add(c) { c.parent = this; this.children.push(c); return this; }
  traverse(f) { f(this); for (const c of this.children) c.traverse(f); }
  clone(deep = true) { const c = new this.constructor(this.geometry, this.material); c.position.copy(this.position); c.rotation.copy(this.rotation); c.scale.copy(this.scale); c.name = this.name; c.visible = this.visible; c.userData = { ...this.userData }; if (deep) for (const k of this.children) c.add(k.clone(true)); return c; }
}
class Group extends Obj { constructor() { super(); this.isGroup = true; } }
class Mesh extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; } }
class Geo { constructor(kind, ...p) { this.kind = kind; this.params = p; } }
class BufferGeometry { constructor() { this.kind = 'buffer'; this.attributes = {}; this.index = null; } setAttribute(n, a) { this.attributes[n] = a; return this; } setIndex(i) { this.index = i; } computeVertexNormals() { this.normalsComputed = true; } }
class Color { constructor(c = 0xffffff) { this.hex = c; } setRGB(r, g, b) { this.rgb = [r, g, b]; return this; } }
export const made = { materials: [] };
class MeshStandardMaterial { constructor(o = {}) { Object.assign(this, o); this.color = new Color(o.color); made.materials.push(this); } }
export const THREE = { __stub: true,
  Group, Mesh, BufferGeometry, Color, MeshStandardMaterial, Vector3: V3,
  BufferAttribute: class { constructor(array, size) { this.array = array; this.itemSize = size; } },
  BoxGeometry: class extends Geo { constructor(...p) { super('box', ...p); } }, CylinderGeometry: class extends Geo { constructor(...p) { super('cylinder', ...p); } },
  SphereGeometry: class extends Geo { constructor(...p) { super('sphere', ...p); } }, ConeGeometry: class extends Geo { constructor(...p) { super('cone', ...p); } },
  Texture: class { constructor(i) { this.image = i; } }, DoubleSide: 2, SRGBColorSpace: 'srgb',
};
