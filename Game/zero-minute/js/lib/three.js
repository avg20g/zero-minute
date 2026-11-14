// Three.js is loaded as a classic script (global THREE) by index.html.
// Every module imports it from here so there is one place to swap the build.
const THREE = globalThis.THREE;
if (!THREE) throw new Error('Three.js failed to load');
export default THREE;
