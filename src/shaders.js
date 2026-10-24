export const starVertex = `
attribute float size;
attribute vec3 tint;
varying vec3 vTint;
uniform float pixelRatio;
void main() {
  vTint = tint;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = clamp(size * pixelRatio * (0.65 + 550.0 / max(100.0, -view.z)), 0.8, 8.0 * pixelRatio);
}`;
export const starFragment = `
varying vec3 vTint;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float core = exp(-r * r * 13.0);
  float halo = exp(-r * r * 3.0) * 0.18;
  gl_FragColor = vec4(vTint, core + halo);
}`;

export const planetVertex = `
varying vec3 vNormal;
varying vec3 vPoint;
varying vec3 vView;
void main() {
  vPoint = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-view.xyz);
  gl_Position = projectionMatrix * view;
}`;
export const planetFragment = `
uniform vec3 colorA;
uniform vec3 colorB;
uniform vec3 colorC;
uniform vec3 lightDirection;
uniform float phase;
varying vec3 vNormal;
varying vec3 vPoint;
varying vec3 vView;
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
void main() {
  vec3 p = normalize(vPoint);
  float cloud = noise(p * 5.5 + phase) * 0.65 + noise(p * 17.0 + phase) * 0.35;
  float bands = sin(p.y * 30.0 + cloud * 8.0 + phase) * 0.5 + 0.5;
  vec3 surface = mix(colorA, colorB, smoothstep(0.23, 0.8, cloud * 0.7 + bands * 0.3));
  surface = mix(surface, colorC, smoothstep(0.61, 0.85, cloud) * 0.5);
  float lit = smoothstep(-0.13, 0.85, dot(normalize(vNormal), normalize(lightDirection)));
  float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vView))), 3.7);
  vec3 color = surface * (0.065 + lit * 0.95) + colorC * rim * (0.12 + lit * 0.3);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const ringVertex = `
varying vec3 vPoint;
void main() { vPoint = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const ringFragment = `
varying vec3 vPoint;
uniform vec3 tint;
uniform float innerRadius;
uniform float outerRadius;
void main() {
  float radius = length(vPoint.xy);
  float t = (radius - innerRadius) / (outerRadius - innerRadius);
  float lines = 0.65 + 0.15 * sin(t * 130.0) * exp(-pow(fwidth(t) * 130.0, 2.0))
    + 0.08 * sin(t * 410.0) * exp(-pow(fwidth(t) * 410.0, 2.0));
  float gap = 1.0 - smoothstep(0.014, 0.03, abs(t - 0.59));
  float edge = smoothstep(0.0, 0.045, t) * (1.0 - smoothstep(0.92, 1.0, t));
  float alpha = edge * (0.32 + lines * 0.27) * (1.0 - gap * 0.8);
  gl_FragColor = vec4(tint * (0.58 + lines * 0.4), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const atmosphereFragment = `
uniform vec3 tint;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vView))), 4.0);
  gl_FragColor = vec4(tint, rim * 0.2);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const dustVertex = `
attribute float size;
attribute vec3 tint;
uniform vec3 travel;
uniform float boxSize;
uniform float pixelRatio;
varying vec3 vTint;
varying float vFade;
void main() {
  vec3 local = mod(position - travel + boxSize * 0.5, boxSize) - boxSize * 0.5;
  float edge = max(max(abs(local.x), abs(local.y)), abs(local.z)) / (boxSize * 0.5);
  vFade = (1.0 - smoothstep(0.65, 1.0, edge)) * smoothstep(2.0, 10.0, length(local));
  vTint = tint;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
  gl_PointSize = size * pixelRatio;
}`;
export const dustFragment = `
varying vec3 vTint;
varying float vFade;
void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  if (radius > 1.0) discard;
  gl_FragColor = vec4(vTint, exp(-radius * radius * 4.0) * vFade * 0.25);
}`;

export const skyVertex = `
varying vec3 vDirection;
void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const skyFragment = `
uniform vec3 baseColor;
uniform vec3 mistColor;
uniform float seedPhase;
varying vec3 vDirection;
void main() {
  vec3 d = normalize(vDirection);
  float band = exp(-pow((d.y + d.x * 0.3 - d.z * 0.13 + 0.06) * 3.2, 2.0));
  float folds = 0.5 + 0.22 * sin(d.x * 11.0 + sin(d.z * 7.0) + seedPhase) + 0.18 * sin(d.z * 18.0 + d.y * 12.0);
  float dust = 0.6 + 0.4 * sin(d.x * 27.0 + sin(d.z * 13.0) * 3.0 + seedPhase);
  vec3 color = baseColor + mistColor * band * folds * (0.45 + dust * 0.55);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
