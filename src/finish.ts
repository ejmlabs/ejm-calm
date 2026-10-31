import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { radianceFor } from './tone.js';
import { patchShader } from './shader-patch.js';
import { item } from './item.js';

/**
 * The frame's finish, on three's HDR output (`outputBufferType` with `setEffects`): the scene draws into a 4x
 * multisampled half-float target, light past the white point blooms, a grade sets the film look, and the output
 * applies the tone curve (`src/tone.ts`) once. A browser that cannot render multisampled half floats draws straight
 * to the canvas with the same curve per material, without the bloom, the grade or the antialiasing.
 */

/** Display brightness (linear, 0 to 1) from which light blooms: the sun, its glitter on the water, sunlit spray. */
export const BLOOM_FROM = 0.95;
/** Light past the threshold blooms up to this many times the threshold, so the sun glows instead of flooding the sky. */
export const BLOOM_CEILING = 1;
export const BLOOM_STRENGTH = 0.32;
/** Weights of the bloom's five levels, finest first: a glow round bright points, not a veil over the frame. */
export const BLOOM_LEVELS = [1, 0.55, 0.3, 0.15, 0.06];
/** How far the corners darken, as a share of the centre's light. */
export const VIGNETTE = 0.24;

/** Whether this browser draws to multisampled half-float targets, which the finish needs. */
export function finishSupported(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return false;
  try {
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return false;
    const samples: unknown = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
    return samples instanceof Int32Array && (samples[0] ?? 0) >= 4;
  } finally {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/**
 * The grade, in scene radiance before the curve: a touch more colour (the curve greys bright colours), light warmed
 * and shade cooled a little, a soft vignette, and a dither of about half an output step so gradients never band.
 */
function gradeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'CalmGrade',
    uniforms: { tDiffuse: { value: null } },
    vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,
    fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb;
  float luma = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = max( mix( vec3( luma ), c, 1.1 ), 0.0 );
  // Light leans warm and shade leans to the sea's blue.
  float light = smoothstep( 0.04, 1.6, luma );
  c *= mix( vec3( 0.96, 0.99, 1.05 ), vec3( 1.05, 1.0, 0.94 ), light );
  // Following the frame's own shape, from a third of the way out to the corners.
  c *= 1.0 - ${VIGNETTE.toFixed(2)} * smoothstep( 0.33, 1.0, length( vUv - 0.5 ) * 1.4142 );
  // Interleaved gradient noise, relative, so it is about half an 8-bit step after the curve at any brightness.
  float grain = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
  c *= 1.0 + ( grain - 0.5 ) * 0.008;
  gl_FragColor = vec4( c, 1.0 );
}`,
  });
}

export interface Finish {
  /** Follows the output's exposure, so the same display brightness blooms at noon and at dusk. */
  update: (exposure: number) => void;
  dispose: () => void;
}

const grey = new THREE.Color();
const threshold = new THREE.Color();

/** Puts the bloom and the grade on a renderer made with a half-float output buffer. */
export function createFinish(renderer: THREE.WebGLRenderer): Finish {
  // Radius 0 leaves the level weights as given.
  const bloom = new UnrealBloomPass(renderer.getDrawingBufferSize(new THREE.Vector2()), BLOOM_STRENGTH, 0, 1);
  item(bloom.compositeMaterial.uniforms, 'bloomFactors').value = BLOOM_LEVELS;
  // Only the light past the threshold blooms, held under a ceiling: three's pass would bloom the whole of the sun's
  // radiance, hundreds of times the threshold, as one white flood.
  const highPass = patchShader(bloom.materialHighPassFilter.fragmentShader, [
    {
      find: 'gl_FragColor = mix( outputColor, texel, alpha );',
      replace: `gl_FragColor = vec4( min( max( texel.rgb - luminosityThreshold, 0.0 ), vec3( luminosityThreshold * ${BLOOM_CEILING.toFixed(1)} ) ), 1.0 );`,
    },
  ]);
  if (highPass === null) throw new Error('three bloom high pass did not match the expected source');
  bloom.materialHighPassFilter.fragmentShader = highPass;
  const gradePass = new ShaderPass(gradeMaterial());
  renderer.setEffects([bloom, gradePass]);
  return {
    update(exposure) {
      bloom.threshold = radianceFor(grey.setScalar(BLOOM_FROM), exposure, threshold).g;
    },
    dispose() {
      renderer.setEffects([]);
      bloom.dispose();
      gradePass.dispose();
    },
  };
}
