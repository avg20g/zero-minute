// Permissive stand-in for THREE used only to smoke-test game/UI logic without WebGL.
(function () {
  const NAMES = new Set('ACESFilmicToneMapping AdditiveBlending BackSide BoxGeometry BufferAttribute BufferGeometry CanvasTexture CircleGeometry Color ConeGeometry CylinderGeometry DataTexture DirectionalLight DoubleSide DynamicDrawUsage Euler Fog Group HemisphereLight IcosahedronGeometry InstancedMesh LineBasicMaterial LineSegments LinearFilter Matrix4 Mesh MeshBasicMaterial MeshStandardMaterial NormalBlending PCFSoftShadowMap PMREMGenerator PerspectiveCamera PlaneGeometry PointLight Points Quaternion RGBAFormat RepeatWrapping RingGeometry SRGBColorSpace Scene ShaderMaterial SphereGeometry UnsignedByteType Vector3 WebGLRenderer Texture SpotLight InstancedBufferAttribute LinearMipmapLinearFilter Matrix3 FrontSide'.split(' '));
  function chain(label) {
    const store = {};
    const p = new Proxy(function () {}, {
      get(t, k) {
        if (k === Symbol.toPrimitive) return () => 0;
        if (typeof k === 'symbol' || k === 'then') return undefined;
        if (k in store) return store[k];
        return (store[k] = chain(label + '.' + String(k)));
      },
      set(t, k, v) { store[k] = v; return true; },
      has() { return true; },
      apply() { return p; },
      construct() { const m = window.__made || (window.__made = {}); m[label] = (m[label] || 0) + 1; return chain(label + '()'); },
    });
    return p;
  }
  // ---- real Three.js r158 API surface (extracted from the real library in a browser; see three-api.txt) ----
  // Objects created with `new THREE.X()` only expose properties and methods that the real class has.
  // Reading anything else returns undefined, exactly as the real library would, so calling it throws.
  const API = {}, reads = (window.__apiReads = {});
  for (const line of `Group<Object3D||isGroup
BufferAttribute|onUploadCallback needsUpdate setUsage copy copyAt copyArray applyMatrix3 applyMatrix4 applyNormalMatrix transformDirection set getComponent setComponent getX setX getY setY getZ setZ getW setW setXY setXYZ setXYZW onUpload clone toJSON|isBufferAttribute name array itemSize count normalized usage updateRange{offset,count} gpuType version
Mesh<Object3D|copy updateMorphTargets getVertexPosition raycast|isMesh geometry@BufferGeometry material@MeshBasicMaterial
MeshBasicMaterial<Material|copy|isMeshBasicMaterial color@Color map lightMap lightMapIntensity aoMap aoMapIntensity specularMap alphaMap envMap combine reflectivity refractionRatio wireframe wireframeLinewidth wireframeLinecap wireframeLinejoin fog
InstancedMesh<Mesh|computeBoundingBox computeBoundingSphere copy getColorAt getMatrixAt raycast setColorAt setMatrixAt updateMorphTargets dispose|isInstancedMesh instanceMatrix@InstancedBufferAttribute instanceColor count boundingBox boundingSphere
CylinderGeometry<BufferGeometry|copy|parameters{radiusTop,radiusBottom,height,radialSegments,heightSegments,openEnded,thetaStart,thetaLength}
SphereGeometry<BufferGeometry|copy|parameters{radius,widthSegments,heightSegments,phiStart,phiLength,thetaStart,thetaLength}
InstancedBufferAttribute<BufferAttribute|copy toJSON|isInstancedBufferAttribute meshPerAttribute
BufferGeometry<EventDispatcher|getIndex setIndex getAttribute setAttribute deleteAttribute hasAttribute addGroup clearGroups setDrawRange applyMatrix4 applyQuaternion rotateX rotateY rotateZ translate scale lookAt center setFromPoints computeBoundingBox computeBoundingSphere computeTangents computeVertexNormals normalizeNormals toNonIndexed toJSON clone copy dispose|isBufferGeometry id name type index attributes{} morphAttributes{} morphTargetsRelative groups boundingBox boundingSphere drawRange{start,count} userData{}
Matrix4|set identity clone copy copyPosition setFromMatrix3 extractBasis makeBasis extractRotation makeRotationFromEuler makeRotationFromQuaternion lookAt multiply premultiply multiplyMatrices multiplyScalar determinant transpose setPosition invert scale getMaxScaleOnAxis makeTranslation makeRotationX makeRotationY makeRotationZ makeRotationAxis makeScale makeShear compose decompose makePerspective makeOrthographic equals fromArray toArray isMatrix4|elements
RingGeometry<BufferGeometry|copy|parameters{innerRadius,outerRadius,thetaSegments,phiSegments,thetaStart,thetaLength}
Quaternion|x y z w set clone copy setFromEuler setFromAxisAngle setFromRotationMatrix setFromUnitVectors angleTo rotateTowards identity invert conjugate dot lengthSq length normalize multiply premultiply multiplyQuaternions slerp slerpQuaternions random equals fromArray toArray fromBufferAttribute toJSON|isQuaternion
MeshStandardMaterial<Material|copy|isMeshStandardMaterial defines{STANDARD} color@Color roughness metalness map lightMap lightMapIntensity aoMap aoMapIntensity emissive@Color emissiveIntensity emissiveMap bumpMap bumpScale normalMap normalMapType normalScale@Vector2 displacementMap displacementScale displacementBias roughnessMap metalnessMap alphaMap envMap envMapIntensity wireframe wireframeLinewidth wireframeLinecap wireframeLinejoin flatShading fog
Euler|x y z order set clone copy setFromRotationMatrix setFromQuaternion setFromVector3 reorder equals fromArray toArray|isEuler
ConeGeometry<CylinderGeometry||
ShaderMaterial<Material|copy toJSON|isShaderMaterial defines{} uniforms{} uniformsGroups vertexShader fragmentShader linewidth wireframe wireframeLinewidth fog lights clipping extensions{derivatives,fragDepth,drawBuffers,shaderTextureLOD} defaultAttributeValues{color,uv,uv1} index0AttributeName uniformsNeedUpdate glslVersion
Scene<Object3D|copy toJSON|isScene background environment fog backgroundBlurriness backgroundIntensity overrideMaterial
PlaneGeometry<BufferGeometry|copy|parameters{width,height,widthSegments,heightSegments}
DataTexture<Texture||isDataTexture
Color|set setScalar setHex setRGB setHSL setStyle setColorName clone copy copySRGBToLinear copyLinearToSRGB convertSRGBToLinear convertLinearToSRGB getHex getHexString getHSL getRGB getStyle offsetHSL add addColors addScalar sub multiply multiplyScalar lerp lerpColors lerpHSL setFromVector3 applyMatrix3 equals fromArray toArray fromBufferAttribute toJSON|isColor r g b
CanvasTexture<Texture||isCanvasTexture
BoxGeometry<BufferGeometry|copy|parameters{width,height,depth,widthSegments,heightSegments,depthSegments}
WebGLRenderer|coordinateSystem outputColorSpace physicallyCorrectLights outputEncoding useLegacyLights|isWebGLRenderer domElement debug{checkShaderErrors,onShaderError} autoClear autoClearColor autoClearDepth autoClearStencil sortObjects clippingPlanes localClippingEnabled toneMapping toneMappingExposure capabilities{isWebGL2,drawBuffers,getMaxAnisotropy,getMaxPrecision,precision,logarithmicDepthBuffer,maxTextures,maxVertexTextures,maxTextureSize,maxCubemapSize,maxAttributes,maxVertexUniforms,maxVaryings,maxFragmentUniforms,vertexTextures,floatFragmentTextures,floatVertexTextures,maxSamples} extensions{has,init,get} properties{get,remove,update,dispose} renderLists{get,dispose} shadowMap state info{memory,render,programs,autoReset,reset,update} xr getContext getContextAttributes forceContextLoss forceContextRestore getPixelRatio setPixelRatio getSize setSize getDrawingBufferSize setDrawingBufferSize getCurrentViewport getViewport setViewport getScissor setScissor getScissorTest setScissorTest setOpaqueSort setTransparentSort getClearColor setClearColor getClearAlpha setClearAlpha clear clearColor clearDepth clearStencil dispose renderBufferDirect compile compileAsync setAnimationLoop render getActiveCubeFace getActiveMipmapLevel getRenderTarget setRenderTargetTextures setRenderTargetFramebuffer setRenderTarget readRenderTargetPixels copyFramebufferToTexture copyTextureToTexture copyTextureToTexture3D initTexture resetState
Texture<EventDispatcher|image updateMatrix clone copy toJSON dispose transformUv needsUpdate encoding|isTexture id name source@Source mipmaps mapping channel wrapS wrapT magFilter minFilter anisotropy format internalFormat type offset@Vector2 repeat@Vector2 center@Vector2 rotation matrixAutoUpdate matrix@Matrix3 generateMipmaps premultiplyAlpha flipY unpackAlignment colorSpace userData{} version onUpdate isRenderTargetTexture needsPMREMUpdate
SpotLight<Light|power dispose copy|isSpotLight target@Object3D distance angle penumbra decay map shadow
PointLight<Light|power dispose copy|isPointLight distance decay shadow
PerspectiveCamera<Camera|copy setFocalLength getFocalLength getEffectiveFOV getFilmWidth getFilmHeight setViewOffset clearViewOffset updateProjectionMatrix toJSON|isPerspectiveCamera fov zoom near far focus aspect view filmGauge filmOffset
PMREMGenerator|fromScene fromEquirectangular fromCubemap compileCubemapShader compileEquirectangularShader dispose|
Matrix3|set identity copy extractBasis setFromMatrix4 multiply premultiply multiplyMatrices multiplyScalar determinant invert transpose getNormalMatrix transposeIntoArray setUvTransform scale rotate translate makeTranslation makeRotation makeScale equals fromArray toArray clone isMatrix3|elements
LineSegments<Line|computeLineDistances|isLineSegments
LineBasicMaterial<Material|copy|isLineBasicMaterial color@Color map linewidth linecap linejoin fog
IcosahedronGeometry<PolyhedronGeometry||
HemisphereLight<Light|copy|isHemisphereLight groundColor@Color
Fog|clone toJSON|isFog name color@Color near far
DirectionalLight<Light|dispose copy|isDirectionalLight target@Object3D shadow
CircleGeometry<BufferGeometry|copy|parameters{radius,segments,thetaStart,thetaLength}
Vector3|set setScalar setX setY setZ setComponent getComponent clone copy add addScalar addVectors addScaledVector sub subScalar subVectors multiply multiplyScalar multiplyVectors applyEuler applyAxisAngle applyMatrix3 applyNormalMatrix applyMatrix4 applyQuaternion project unproject transformDirection divide divideScalar min max clamp clampScalar clampLength floor ceil round roundToZero negate dot lengthSq length manhattanLength normalize setLength lerp lerpVectors cross crossVectors projectOnVector projectOnPlane reflect angleTo distanceTo distanceToSquared manhattanDistanceTo setFromSpherical setFromSphericalCoords setFromCylindrical setFromCylindricalCoords setFromMatrixPosition setFromMatrixScale setFromMatrixColumn setFromMatrix3Column setFromEuler setFromColor equals fromArray toArray fromBufferAttribute random randomDirection isVector3|x y z
Vector2|width height set setScalar setX setY setComponent getComponent clone copy add addScalar addVectors addScaledVector sub subScalar subVectors multiply multiplyScalar divide divideScalar applyMatrix3 min max clamp clampScalar clampLength floor ceil round roundToZero negate dot cross lengthSq length manhattanLength normalize angle angleTo distanceTo distanceToSquared manhattanDistanceTo setLength lerp lerpVectors equals fromArray toArray fromBufferAttribute rotateAround random isVector2|x y
Vector4|width height set setScalar setX setY setZ setW setComponent getComponent clone copy add addScalar addVectors addScaledVector sub subScalar subVectors multiply multiplyScalar applyMatrix4 divideScalar setAxisAngleFromQuaternion setAxisAngleFromRotationMatrix min max clamp clampScalar clampLength floor ceil round roundToZero negate dot lengthSq length manhattanLength normalize setLength lerp lerpVectors equals fromArray toArray fromBufferAttribute random isVector4|x y z w
Object3D<EventDispatcher|onBeforeRender onAfterRender applyMatrix4 applyQuaternion setRotationFromAxisAngle setRotationFromEuler setRotationFromMatrix setRotationFromQuaternion rotateOnAxis rotateOnWorldAxis rotateX rotateY rotateZ translateOnAxis translateX translateY translateZ localToWorld worldToLocal lookAt add remove removeFromParent clear attach getObjectById getObjectByName getObjectByProperty getObjectsByProperty getWorldPosition getWorldQuaternion getWorldScale getWorldDirection raycast traverse traverseVisible traverseAncestors updateMatrix updateMatrixWorld updateWorldMatrix toJSON clone copy|isObject3D id name type parent children up@Vector3 position@Vector3 rotation@Euler quaternion@Quaternion scale@Vector3 modelViewMatrix@Matrix4 normalMatrix@Matrix3 matrix@Matrix4 matrixWorld@Matrix4 matrixAutoUpdate matrixWorldNeedsUpdate matrixWorldAutoUpdate layers@Layers visible castShadow receiveShadow frustumCulled renderOrder animations userData{}
Material<EventDispatcher|alphaTest onBuild onBeforeRender onBeforeCompile customProgramCacheKey setValues toJSON clone copy dispose needsUpdate|isMaterial id name type blending side vertexColors opacity transparent alphaHash blendSrc blendDst blendEquation blendSrcAlpha blendDstAlpha blendEquationAlpha blendColor@Color blendAlpha depthFunc depthTest depthWrite stencilWriteMask stencilFunc stencilRef stencilFuncMask stencilFail stencilZFail stencilZPass stencilWrite clippingPlanes clipIntersection clipShadows shadowSide colorWrite precision polygonOffset polygonOffsetFactor polygonOffsetUnits dithering alphaToCoverage premultipliedAlpha forceSinglePass visible toneMapped userData{} version
Light<Object3D|dispose copy toJSON|isLight color@Color intensity
Camera<Object3D|copy getWorldDirection updateMatrixWorld updateWorldMatrix clone|isCamera matrixWorldInverse@Matrix4 projectionMatrix@Matrix4 projectionMatrixInverse@Matrix4 coordinateSystem
Layers|set enable enableAll toggle disable disableAll test isEnabled|mask
Line<Object3D|copy computeLineDistances raycast updateMorphTargets|isLine geometry@BufferGeometry material@LineBasicMaterial
PolyhedronGeometry<BufferGeometry|copy|parameters{vertices,indices,radius,detail}
OrthographicCamera<Camera|copy setViewOffset clearViewOffset updateProjectionMatrix toJSON|isOrthographicCamera zoom view left right top bottom near far
Source|needsUpdate toJSON|isSource id data version
EventDispatcher|addEventListener hasEventListener removeEventListener dispatchEvent|`.split('\n')) {
    const [head, proto, own] = line.split('|'), [name, parent] = head.split('<'), e = (API[name] = { x: parent, proto: new Set(proto.split(' ').filter(Boolean)), own: {} });
    for (const tok of (own || '').split(' ').filter(Boolean)) {
      let m; if ((m = tok.match(/^(\w+)@(\w+)$/))) e.own[m[1]] = { type: m[2] }; else if ((m = tok.match(/^(\w+)\{(.*)\}$/))) e.own[m[1]] = { keys: m[2] ? m[2].split(',') : [] }; else e.own[tok] = 1;
    }
  }
  function lookup(cls, k) { for (let c = cls; c && API[c]; c = API[c].x) { const e = API[c]; if (Object.prototype.hasOwnProperty.call(e.own, k)) return e.own[k]; if (e.proto.has(k)) return 1; } return undefined; }
  function miss(what) { if (!reads[what]) { const st = (new Error().stack || '').split('\n').find(l => /\/js\//.test(l)) || ''; reads[what] = st.replace(/^.*\/js\//, 'js/').replace(/\)?$/, ''); } }
  function plain(label, keys) {
    const store = {};
    return new Proxy({}, { get(t, k) { if (typeof k === 'symbol') return undefined; if (k in store) return store[k]; if (!keys.includes(k)) { miss(label + '.' + k); return undefined; } return (store[k] = chain(label + '.' + k)); }, set(t, k, v) { store[k] = v; return true; }, has(t, k) { return k in store || keys.includes(k); } });
  }
  const ARGS = { Mesh: ['geometry', 'material'], InstancedMesh: ['geometry', 'material', 'count'], Line: ['geometry', 'material'], LineSegments: ['geometry', 'material'], BufferAttribute: ['array', 'itemSize'], InstancedBufferAttribute: ['array', 'itemSize'] };
  function inst(cls, label, args) {
    const store = {};
    if (args && ARGS[cls]) ARGS[cls].forEach((k, i) => { if (args[i] !== undefined) store[k] = args[i]; });
    if (args && /Material$/.test(cls) && args[0] && typeof args[0] === 'object') { for (const k in args[0]) { if (lookup(cls, k) === undefined) miss(cls + ' option ' + k); const d = lookup(cls, k); if (!(d && d.type)) store[k] = args[0][k]; } }
    const p = new Proxy(function () {}, {
      get(t, k) {
        if (k === Symbol.toPrimitive) return () => 0;
        if (typeof k === 'symbol' || k === 'then') return undefined;
        if (k in store) return store[k];
        const d = lookup(cls, k);
        if (d === undefined) { miss(cls + '.' + k); return undefined; }
        if (d.type) return (store[k] = API[d.type] ? inst(d.type, label + '.' + k) : chain(label + '.' + k));
        if (d.keys) return (store[k] = d.keys.length ? plain(cls + '.' + k, d.keys) : chain(label + '.' + k));
        return (store[k] = chain(label + '.' + k));
      },
      set(t, k, v) { store[k] = v; return true; },   // adding your own fields to a Three object is legal
      has(t, k) { return k in store || lookup(cls, k) !== undefined; },
      apply() { miss(label + ' called as a function'); return chain(label + '()'); },
    });
    return p;
  }
  function klass(name) { return new Proxy(function () {}, { construct(t, args) { const m = window.__made || (window.__made = {}); m[name] = (m[name] || 0) + 1; return inst(name, name + '()', args); }, get(t, k) { if (typeof k === 'symbol') return undefined; return chain(name + '.' + String(k)); } }); }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    setScalar(s) { this.x = this.y = this.z = s; return this; }
    normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    // crude top-down camera so picking/overlay code paths run with finite numbers
    project(cam) { const r = window.__rts && window.__rts.rig; const tx = r ? r.tx : 70, tz = r ? r.tz : 400, d = r ? r.dist : 88; this.x = (this.x - tx) / (d * 0.75); this.y = -(this.z - tz) / (d * 0.45); this.z = 0.5; return this; }
    unproject(cam) { const r = window.__rts && window.__rts.rig; const tx = r ? r.tx : 70, tz = r ? r.tz : 400, d = r ? r.dist : 88; const nx = this.x, ny = this.y; this.x = tx + nx * d * 0.75; this.z = tz - ny * d * 0.45; this.y = 0; cam.position.x = this.x; cam.position.y = 100; cam.position.z = this.z; return this; }
  }
  window.THREE = new Proxy({ Vector3, __mock: true }, {
    get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol') return undefined; if (!NAMES.has(k)) throw new Error('mock THREE has no export ' + String(k)); return (t[k] = API[k] ? klass(k) : chain(k)); },
  });
})();
