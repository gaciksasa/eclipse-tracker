// GLSL shader sources for the Earth surface and the atmospheric glow shell.

// Linear -> sRGB, applied manually because raw ShaderMaterial output bypasses
// three.js' automatic output color-space conversion.
const SRGB_ENCODE = /* glsl */ `
  vec3 linearToSRGB(vec3 c) {
    return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92,
               step(c, vec3(0.0031308)));
  }
`;

// Fraction of the Sun's disk blocked by an occluding sphere, as seen from a
// surface point P looking toward the Sun. Uses true angular sizes so it yields
// physically correct umbra/penumbra (and annular vs total) coverage in [0,1].
const ECLIPSE_GLSL = /* glsl */ `
  float eclipseCoverage(vec3 P, vec3 sunDir, float sunAng, vec3 occC, float occR) {
    vec3 d = occC - P;
    float dist = length(d);
    if (dist < 1e-4) return 0.0;
    if (dot(d, sunDir) <= 0.0) return 0.0;            // occluder not toward Sun
    float occAng = asin(clamp(occR / dist, 0.0, 1.0)); // occluder angular radius
    float sep = acos(clamp(dot(d / dist, sunDir), -1.0, 1.0)); // angular sep
    if (sep >= sunAng + occAng) return 0.0;            // disks disjoint
    if (sep <= abs(sunAng - occAng)) {                 // one disk inside the other
      float r = min(sunAng, occAng);
      return (r * r) / (sunAng * sunAng);
    }
    float a = sunAng, b = occAng, c = max(sep, 1e-6);
    float area = a * a * acos(clamp((c*c + a*a - b*b) / (2.0*c*a), -1.0, 1.0))
               + b * b * acos(clamp((c*c + b*b - a*a) / (2.0*c*b), -1.0, 1.0))
               - 0.5 * sqrt(max(0.0, (-c+a+b)*(c+a-b)*(c-a+b)*(c+a+b)));
    return clamp(area / (3.14159265 * a * a), 0.0, 1.0);
  }
`;

export const earthVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  #include <logdepthbuf_pars_vertex>
  bool isPerspectiveMatrix(mat4 m) { return m[2][3] == -1.0; }

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
    #include <logdepthbuf_vertex>
  }
`;

export const earthFragmentShader = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D specularMap;
  uniform vec3 sunDir;       // world space, normalized (direction to Sun)
  uniform vec3 moonPos;      // Moon centre, world space
  uniform float moonRadius;  // Moon radius, world units
  uniform float sunAngRadius;// Sun angular radius (rad)

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  #include <logdepthbuf_pars_fragment>

  ${SRGB_ENCODE}
  ${ECLIPSE_GLSL}

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vWorldNormal);
    float sun = dot(N, sunDir);
    float day = smoothstep(-0.10, 0.20, sun); // soft terminator

    vec3 dayC = texture2D(dayMap, vUv).rgb;
    vec3 nightTex = texture2D(nightMap, vUv).rgb;
    float water = texture2D(specularMap, vUv).r; // white = water

    // Solar eclipse: how much of the Sun the Moon blocks at this surface point.
    // eclipse (0..1) is the physically correct covered fraction, so WHERE and
    // WHEN the shadow falls is accurate. The true penumbra is a very broad, faint
    // gradient the eye barely notices, so for visibility we sharpen and deepen it
    // into a more defined, darker shadow without moving it.
    float eclipse = eclipseCoverage(vWorldPos, sunDir, sunAngRadius, moonPos, moonRadius);
    float shadow = smoothstep(0.10, 0.85, eclipse);
    float sunVis = 1.0 - shadow;

    // The night side reuses the SAME day surface, just darkened, so land and
    // ocean stay perfectly registered. City lights are then added as emission
    // isolated from the night texture, so they sit exactly on that surface.
    vec3 nightBase = dayC * 0.05;
    float dayLit = day * sunVis; // sunlight actually reaching the surface
    vec3 color = mix(nightBase, dayC, dayLit);

    float lum = dot(nightTex, vec3(0.299, 0.587, 0.114));
    float lightMask = smoothstep(0.05, 0.18, lum); // keep only the bright lights
    vec3 cityLights = nightTex * lightMask;
    color += cityLights * (1.0 - day) * 2.2;

    // Specular sun glint on oceans (Blinn-Phong), killed under the Moon's shadow.
    // A tight, high-exponent lobe keeps it a realistic glitter rather than a
    // large blown-out wash over the sub-solar ocean.
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(sunDir + V);
    float glint = pow(max(dot(N, H), 0.0), 200.0) * water * day * sunVis;
    color += vec3(1.0, 0.95, 0.82) * glint * 0.5;

    // Thin atmosphere rim toward the lit limb.
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    color += vec3(0.30, 0.55, 1.0) * rim * clamp(sun + 0.30, 0.0, 1.0) * sunVis * 0.55;

    gl_FragColor = vec4(linearToSRGB(color), 1.0);
  }
`;

// Moon surface with its own sunlight + a lunar-eclipse term: when the Earth
// blocks the Sun the disc darkens and turns coppery ("blood moon").
export const moonVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  #include <logdepthbuf_pars_vertex>
  bool isPerspectiveMatrix(mat4 m) { return m[2][3] == -1.0; }

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
    #include <logdepthbuf_vertex>
  }
`;

export const moonFragmentShader = /* glsl */ `
  uniform sampler2D moonMap;
  uniform vec3 sunDir;
  uniform vec3 earthPos;      // Earth centre, world space
  uniform float earthRadius;  // Earth radius, world units
  uniform float sunAngRadius; // Sun angular radius (rad)

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  #include <logdepthbuf_pars_fragment>

  ${SRGB_ENCODE}
  ${ECLIPSE_GLSL}

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vWorldNormal);
    float diff = clamp(dot(N, sunDir), 0.0, 1.0);
    vec3 base = texture2D(moonMap, vUv).rgb;

    // Lunar eclipse: fraction of the Sun the Earth blocks at this Moon point.
    float eclipse = eclipseCoverage(vWorldPos, sunDir, sunAngRadius, earthPos, earthRadius);

    vec3 sunlit = base * diff;
    // In the umbra the Moon is lit only by red light refracted through Earth's
    // atmosphere -> dim coppery glow rather than pure black.
    vec3 coppery = base * diff * vec3(0.42, 0.10, 0.04) * 1.6;
    vec3 color = mix(sunlit, coppery, eclipse) + base * 0.012; // tiny ambient

    gl_FragColor = vec4(linearToSRGB(color), 1.0);
  }
`;

// Separate cloud layer, rendered on a sphere slightly above the surface.
export const cloudVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  #include <logdepthbuf_pars_vertex>
  bool isPerspectiveMatrix(mat4 m) { return m[2][3] == -1.0; }

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
    #include <logdepthbuf_vertex>
  }
`;

export const cloudFragmentShader = /* glsl */ `
  uniform sampler2D cloudsMap;
  uniform vec3 sunDir;
  uniform float opacity;
  uniform vec3 moonPos;       // Moon centre, world space
  uniform float moonRadius;   // Moon radius, world units
  uniform float sunAngRadius; // Sun angular radius (rad)

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  #include <logdepthbuf_pars_fragment>

  ${SRGB_ENCODE}
  ${ECLIPSE_GLSL}

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vWorldNormal);
    float sun = dot(N, sunDir);
    float day = smoothstep(-0.10, 0.25, sun);

    float raw = texture2D(cloudsMap, vUv).r; // white = cloud
    // Sharpen: lift dense cloud, cut thin grey haze so formations read crisply
    // (the 8K map otherwise renders as a soft, washed-out overlay).
    float cloud = smoothstep(0.10, 0.70, raw);

    // Subtle relief: clouds are bright white in full sun and cool/darken a
    // little toward the terminator, giving a 3D feel instead of a flat sheet.
    float shade = clamp(sun * 0.65 + 0.55, 0.35, 1.0);
    vec3 col = mix(vec3(0.62, 0.68, 0.80), vec3(1.0), shade);

    // The Moon's shadow that falls on the surface must also fall on the clouds:
    // darken cloud tops under the umbra/penumbra with the same sharpened curve
    // as the ground, so the eclipse shadow reads as one continuous patch.
    float eclipse = eclipseCoverage(vWorldPos, sunDir, sunAngRadius, moonPos, moonRadius);
    float sunVis = 1.0 - smoothstep(0.10, 0.85, eclipse);
    col *= 0.06 + 0.94 * sunVis;

    // Fade clouds out on the night side so they don't leave dark patches.
    float alpha = cloud * opacity * clamp(day + 0.05, 0.05, 1.0);
    col *= clamp(day + 0.03, 0.0, 1.0);

    gl_FragColor = vec4(linearToSRGB(col), alpha);
  }
`;

export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  #include <logdepthbuf_pars_vertex>
  bool isPerspectiveMatrix(mat4 m) { return m[2][3] == -1.0; }

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
    #include <logdepthbuf_vertex>
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 sunDir;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  #include <logdepthbuf_pars_fragment>

  ${SRGB_ENCODE}

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Rendered on the back side: outward normals point away from the camera, so
    // dot(N,V) grows negative toward the planet-hugging edge. -dot makes the
    // glow brightest just above the horizon and fade to zero up the shell.
    float depth = max(-dot(N, V), 0.0);
    // Gentle, wide falloff (no sharp band). The glow is anchored to zero exactly
    // at the shell's silhouette (depth = 0) and ramps in over a wide range, then
    // an extra smooth outer feather stretches the fade so the boundary between
    // atmosphere and vacuum is imperceptible rather than a defined ring.
    float limb = pow(depth, 1.05) * smoothstep(0.0, 0.32, depth);
    limb *= smoothstep(0.0, 0.10, depth); // extra feather right at the edge

    // Sun elevation for this parcel of air: >0 sunlit, ~0 at the terminator.
    float s = dot(N, sunDir);
    float lit = smoothstep(-0.35, 0.18, s);

    // Forward (Mie) scattering toward the Sun. Sunlight only grazes thick air —
    // and reddens — on the limb we are looking THROUGH toward the Sun, so the
    // warm arc is directional: one sunrise/sunset toward the Sun, never a full
    // ring around both terminator crossings at once.
    float forward = pow(max(dot(-V, sunDir), 0.0), 3.0);

    // Twilight reddening: a wide, soft band near the terminator, gated by the
    // forward term so it only blooms on the sunward limb.
    float warmBand = exp(-pow(s / 0.26, 2.0));
    float warm = clamp(warmBand * forward, 0.0, 1.0);

    vec3 blue = vec3(0.32, 0.56, 1.0);
    vec3 sunrise = vec3(1.0, 0.46, 0.18);
    vec3 col = mix(blue, sunrise, warm);

    float base = limb * lit * 2.6;              // soft blue rim on the lit limb
    float arc = limb * lit * warm * 7.5;        // warm sunrise arc toward the Sun
    float bloom = forward * limb * lit * 4.2;   // extra blaze straight at the Sun
    float intensity = base + arc + bloom;

    gl_FragColor = vec4(linearToSRGB(col * intensity), clamp(intensity, 0.0, 1.0));
  }
`;
