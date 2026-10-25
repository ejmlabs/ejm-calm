/**
 * GLSL shared by the underwater materials. Every pattern is periodic over
 * 256 m of render-space position plus `uPattern` (the origin modulo 256), so
 * a floating-origin recenter never moves it.
 */
export const GLSL_WATER_COMMON = /* glsl */ `
uniform float uTime;
uniform vec2 uPattern;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uSunDir;
uniform vec3 uSunWater;
uniform float uLight;

const float TAU = 6.2831853;
const float LATTICE = TAU / 256.0;

/** Same curve as three's FogExp2, so these meshes melt into the fogged scene. */
vec3 waterFog( vec3 color, float dist ) {
  float f = 1.0 - exp( -uFogDensity * uFogDensity * dist * dist );
  return mix( color, uFogColor, f );
}

/** Surface slope (dh/dx, dh/dz) from a few swell and ripple trains on the 256 m lattice. */
vec2 rippleSlope( vec2 p, float t ) {
  vec2 s = vec2( 0.0 );
  vec2 k;
  k = vec2( 31.0, 18.0 ) * LATTICE;    s += k * 0.050 * cos( dot( k, p ) + t * 1.2 );
  k = vec2( -12.0, 37.0 ) * LATTICE;   s += k * 0.045 * cos( dot( k, p ) + t * 1.0 );
  k = vec2( 70.0, -41.0 ) * LATTICE;   s += k * 0.028 * cos( dot( k, p ) + t * 1.7 );
  k = vec2( -55.0, -88.0 ) * LATTICE;  s += k * 0.022 * cos( dot( k, p ) + t * 2.1 );
  k = vec2( 150.0, 97.0 ) * LATTICE;   s += k * 0.012 * cos( dot( k, p ) + t * 3.0 );
  k = vec2( -131.0, 160.0 ) * LATTICE; s += k * 0.010 * cos( dot( k, p ) + t * 3.4 );
  return s;
}

vec2 hash22( vec2 p ) {
  return fract( sin( vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 );
}

float hash12( vec2 p ) {
  return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

/** Value noise in [0, 1] that tiles every \`period\` cells. */
float tiledNoise( vec2 p, float period ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash12( mod( i, period ) );
  float b = hash12( mod( i + vec2( 1.0, 0.0 ), period ) );
  float c = hash12( mod( i + vec2( 0.0, 1.0 ), period ) );
  float d = hash12( mod( i + vec2( 1.0, 1.0 ), period ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

/** Bright network where moving cells meet: light focused by the swell above. */
float causticLayer( vec2 p, float period, float t ) {
  p += 0.3 * sin( p.yx * ( TAU / 16.0 ) + t * 0.7 );
  vec2 i = floor( p );
  vec2 f = fract( p );
  float d1 = 8.0;
  float d2 = 8.0;
  for ( int y = -1; y <= 1; y++ ) {
    for ( int x = -1; x <= 1; x++ ) {
      vec2 g = vec2( float( x ), float( y ) );
      vec2 h = hash22( mod( i + g, period ) );
      vec2 o = 0.5 + 0.38 * sin( t * ( 0.55 + 0.4 * h.yx ) + TAU * h );
      vec2 r = g + o - f;
      float d = dot( r, r );
      if ( d < d1 ) {
        d2 = d1;
        d1 = d;
      } else if ( d < d2 ) {
        d2 = d;
      }
    }
  }
  float e = sqrt( d2 ) - sqrt( d1 );
  float line = 1.0 - smoothstep( 0.0, 0.17, e );
  return line * sqrt( line );
}
`;
