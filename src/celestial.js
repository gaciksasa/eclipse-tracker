// Builds the Sun / Earth / Moon scene and exposes an update() driven by the
// ephemeris snapshot from astronomy.js. 1 scene unit = 1 Earth radius.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  earthVertexShader,
  earthFragmentShader,
  moonVertexShader,
  moonFragmentShader,
  cloudVertexShader,
  cloudFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from './shaders.js';
import { EARTH_RADIUS_KM } from './astronomy.js';

// Real ISS footprint: ~109 m across the solar arrays. World unit = 1 Earth
// radius, so this is the size the model is normalised to.
const ISS_SPAN_M = 109;
const ISS_SPAN_UNITS = ISS_SPAN_M / (EARTH_RADIUS_KM * 1000);

// Everything is true scale: 1 scene unit = 1 mean Earth radius (6371 km).
const EARTH_RADIUS = 1;
const MOON_RADIUS = 0.2727; // 1737.4 km / 6371 km — true Moon/Earth ratio
const SUN_RADIUS = 109.2; // 696000 km / 6371 km — true Sun/Earth ratio
const CLOUD_RADIUS = EARTH_RADIUS * 1.0025; // ~16 km — realistic cloud-top height
const ATMO_RADIUS = EARTH_RADIUS * 1.04;
const STAR_RADIUS = 120000; // beyond the Sun so it stays in the background

// The Sun casts light as parallel rays (physically correct for its distance).
// Only the light's direction matters, so this distance just frames the
// shadow camera; the visible Sun sphere is placed at its true distance.
const SUN_LIGHT_DIST = 200;

export function createWorld(scene, renderer) {
  const loader = new THREE.TextureLoader();
  const tex = (name, colorSpace = THREE.SRGBColorSpace) => {
    const t = loader.load(`textures/${name}`);
    t.colorSpace = colorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };

  // ---- Starfield background -------------------------------------------
  const starTex = tex('stars.jpg');
  const stars = new THREE.Mesh(
    new THREE.SphereGeometry(STAR_RADIUS, 64, 64),
    new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide }),
  );
  scene.add(stars);

  // ---- Earth (custom day/night shader) --------------------------------
  const earthUniforms = {
    dayMap: { value: tex('earth_day.jpg') },
    nightMap: { value: tex('earth_night.jpg') },
    specularMap: { value: tex('earth_specular.jpg', THREE.NoColorSpace) },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    moonPos: { value: new THREE.Vector3() },
    moonRadius: { value: MOON_RADIUS },
    sunAngRadius: { value: 0.00465 },
  };
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 512, 256),
    new THREE.ShaderMaterial({
      uniforms: earthUniforms,
      vertexShader: earthVertexShader,
      fragmentShader: earthFragmentShader,
    }),
  );
  scene.add(earth);

  // Cloud layer: a separate transparent sphere just above the surface.
  const cloudUniforms = {
    cloudsMap: { value: tex('earth_clouds.jpg', THREE.NoColorSpace) },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    opacity: { value: 0.9 },
    moonPos: { value: new THREE.Vector3() },
    moonRadius: { value: MOON_RADIUS },
    sunAngRadius: { value: 0.00465 },
  };
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(CLOUD_RADIUS, 256, 128),
    new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      transparent: true,
      depthWrite: false,
    }),
  );
  scene.add(clouds);

  // Atmospheric glow shell.
  const atmoUniforms = { sunDir: { value: new THREE.Vector3(1, 0, 0) } };
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(ATMO_RADIUS, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: atmoUniforms,
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scene.add(atmosphere);

  // ---- Moon -----------------------------------------------------------
  const moonUniforms = {
    moonMap: { value: tex('moon.jpg') },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    earthPos: { value: new THREE.Vector3(0, 0, 0) },
    earthRadius: { value: EARTH_RADIUS },
    sunAngRadius: { value: 0.00465 },
  };
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(MOON_RADIUS, 128, 128),
    new THREE.ShaderMaterial({
      uniforms: moonUniforms,
      vertexShader: moonVertexShader,
      fragmentShader: moonFragmentShader,
    }),
  );
  scene.add(moon);

  // ---- Sun: directional light for the ISS (Earth/Moon light themselves in
  // their shaders; eclipses are computed analytically, so no shadow maps). ----
  const sunLight = new THREE.DirectionalLight(0xfff8f0, 4.2);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const ambient = new THREE.AmbientLight(0x22262e, 0.6);
  scene.add(ambient);

  // Visible Sun sphere: true size, placed at its true distance every frame.
  // The colour multiplier (>1) overexposes the disc to a brilliant yellow-white
  // (white-hot core, yellow limb) so it reads as a G-type star, not a red disc.
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_RADIUS, 64, 64),
    new THREE.MeshBasicMaterial({
      map: tex('sun.jpg'),
      color: new THREE.Color(9.0, 8.325, 5.85),
    }),
  );
  scene.add(sun);

  // Glowing corona/halo around the Sun so it looks luminous from afar.
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      // Additive blend, so values >1 push the corona brighter (50% boost).
      color: new THREE.Color(1.5, 1.43, 1.2),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sunGlow.scale.setScalar(SUN_RADIUS * 5);
  scene.add(sunGlow);

  // ---- International Space Station (true scale) -----------------------
  // Built in metres, then scaled to world units (1 unit = 1 Earth radius).
  // Real footprint: ~109 m across the solar arrays, ~73 m along the modules.
  const iss = makeISS();
  scene.add(iss);

  // Reusable scratch objects for orienting the tidally-locked Moon each frame.
  const moonBasisX = new THREE.Vector3();
  const moonBasisY = new THREE.Vector3();
  const moonBasisZ = new THREE.Vector3();
  const moonMatrix = new THREE.Matrix4();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const WORLD_UP_ALT = new THREE.Vector3(0, 0, 1);

  // ---------------------------------------------------------------------
  function update(eph, cloudDrift) {
    const sunDir = eph.sun.dir;

    // Earth daily spin about its axis (world +Y) = sidereal time.
    earth.rotation.y = eph.gast;

    // Clouds spin with the Earth plus a slow relative drift.
    clouds.rotation.y = eph.gast + cloudDrift;

    // Shader uniforms.
    earthUniforms.sunDir.value.copy(sunDir);
    cloudUniforms.sunDir.value.copy(sunDir);
    atmoUniforms.sunDir.value.copy(sunDir);

    // Eclipse inputs: Moon position for the Earth shader, and the Sun's true
    // angular radius (asin(Rsun / distance)) shared by both eclipse shaders.
    const sunAng = Math.asin(SUN_RADIUS / eph.sun.world.length());
    earthUniforms.moonPos.value.copy(eph.moon.world);
    earthUniforms.sunAngRadius.value = sunAng;
    cloudUniforms.moonPos.value.copy(eph.moon.world);
    cloudUniforms.sunAngRadius.value = sunAng;
    moonUniforms.sunDir.value.copy(sunDir);
    moonUniforms.sunAngRadius.value = sunAng;

    // Moon at its true position and distance (in Earth radii).
    moon.position.copy(eph.moon.world);

    // Tidal locking: the Moon always turns the SAME hemisphere toward Earth, so
    // from Earth we only ever see the near side. The lunar texture is centred on
    // the near side (0°N/0°E maps to the mesh's local +X), so orient the mesh so
    // local +X points at Earth (the origin) and local +Y (the north pole) stays
    // roughly aligned with world up. Without this the texture is frozen in world
    // space and the wrong face shows as the Moon orbits.
    moonBasisX.copy(eph.moon.world).multiplyScalar(-1).normalize(); // Moon -> Earth
    // Pick a world up not parallel to the facing direction to avoid a degenerate
    // basis when the Moon passes near the celestial pole.
    const up = Math.abs(moonBasisX.dot(WORLD_UP)) > 0.999 ? WORLD_UP_ALT : WORLD_UP;
    moonBasisZ.crossVectors(moonBasisX, up).normalize();
    moonBasisY.crossVectors(moonBasisZ, moonBasisX).normalize();
    moonMatrix.makeBasis(moonBasisX, moonBasisY, moonBasisZ);
    moon.quaternion.setFromRotationMatrix(moonMatrix);

    // Sun sphere + glow at its true position/distance (~23,481 Earth radii).
    sun.position.copy(eph.sun.world);
    sunGlow.position.copy(eph.sun.world);

    // Directional Sun light aimed from the true Sun direction.
    sunLight.position.copy(sunDir).multiplyScalar(SUN_LIGHT_DIST);
    sunLight.target.position.set(0, 0, 0);
  }

  return {
    update,
    earth,
    moon,
    sun,
    sunLight,
    iss,
  };
}

// The ISS. Loads NASA's official photogrammetric glTF model (VTAD) and
// normalises it to the station's true ~109 m span in world units. A simple
// procedural stand-in is shown immediately and while the (large) model streams
// in, so there is always something on screen and an offline fallback.
function makeISS() {
  const g = new THREE.Group();

  // Inner pivot lets us reorient the model without disturbing the outer group,
  // which main.js drives with the SGP4 position/attitude every frame.
  const pivot = new THREE.Group();
  g.add(pivot);

  const placeholder = makeISSPlaceholder();
  pivot.add(placeholder);

  new GLTFLoader().load(
    'models/iss.glb',
    (gltf) => {
      const model = gltf.scene;

      // Normalise: centre on the model's bounding box and scale its longest
      // axis to the real span, regardless of the file's native units.
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = ISS_SPAN_UNITS / maxDim;
      model.position.sub(center).multiplyScalar(scale);
      model.scale.setScalar(scale);

      model.traverse((o) => {
        o.frustumCulled = false;
        if (o.isMesh && o.material) {
          o.material.side = THREE.DoubleSide;
        }
      });

      pivot.remove(placeholder);
      placeholder.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      pivot.add(model);
    },
    undefined,
    (err) => {
      console.warn('ISS model failed to load; using placeholder.', err);
    },
  );

  return g;
}

// Lightweight procedural ISS used until (or instead of) the glTF model:
// a truss, pressurised modules, four solar-array wings and a radiator,
// modelled in metres then shrunk to world units.
function makeISSPlaceholder() {
  const g = new THREE.Group();
  const structMat = new THREE.MeshStandardMaterial({
    color: 0xd8d8d0, metalness: 0.5, roughness: 0.6,
  });
  const foilMat = new THREE.MeshStandardMaterial({
    color: 0xcaa14a, metalness: 0.7, roughness: 0.45,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x25417d, metalness: 0.2, roughness: 0.5,
    emissive: 0x0b1636, emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
  });
  const radiatorMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2, metalness: 0.1, roughness: 0.85, side: THREE.DoubleSide,
  });

  g.add(new THREE.Mesh(new THREE.BoxGeometry(90, 1.8, 1.8), structMat));

  const modules = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 40, 16), foilMat);
  modules.rotation.x = Math.PI / 2;
  g.add(modules);
  const node = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 6, 16), foilMat);
  node.rotation.x = Math.PI / 2;
  g.add(node);

  const wingGeo = new THREE.BoxGeometry(34, 0.15, 11);
  for (const wx of [-37, 37]) {
    for (const wz of [-7, 7]) {
      const wing = new THREE.Mesh(wingGeo, panelMat);
      wing.position.set(wx, 0, wz);
      g.add(wing);
    }
  }

  const radiator = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 8), radiatorMat);
  radiator.position.set(0, 6, 0);
  g.add(radiator);

  g.traverse((o) => { o.frustumCulled = false; });
  g.scale.setScalar(1 / (EARTH_RADIUS_KM * 1000));
  return g;
}

// Soft radial gradient used for the Sun's glowing corona (yellow-white).
function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255, 252, 235, 0.95)');
  g.addColorStop(0.18, 'rgba(255, 244, 200, 0.55)');
  g.addColorStop(0.45, 'rgba(255, 226, 150, 0.18)');
  g.addColorStop(1.0, 'rgba(255, 210, 120, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
