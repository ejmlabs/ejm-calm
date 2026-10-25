export const vertex = `
attribute vec3 stellarColor;attribute float flux;uniform float pixelRatio;uniform float shell;uniform float fadeNear;uniform float viewRadius;
uniform float referenceDistance;uniform float minFlux;uniform float peak;uniform vec3 regionTint;
uniform float coreSigma;uniform float haloFrom;uniform vec2 haloRadius;uniform float haloPeak;uniform float glareFrom;uniform float glareRadius;uniform float glarePeak;
varying vec3 vColor;varying float vIntensity;varying float vFootprint;varying float vSigma;varying float vMagnitude;varying float vFade;varying float vHaloR;varying float vHaloP;varying float vGlare;
void main(){
 vec4 view=modelViewMatrix*vec4(position,1.0);float distance=length(view.xyz);gl_Position=projectionMatrix*view;
 if(shell>0.5)gl_Position.z=gl_Position.w*0.99999;
 float intensity=shell>0.5?flux:flux*pow(referenceDistance/max(1.0,distance),2.0);
 vMagnitude=2.0-2.5*log(max(minFlux,intensity))/log(10.0);intensity=clamp(intensity,minFlux,peak);
 vColor=stellarColor*mix(vec3(1.0),regionTint,0.1);vIntensity=intensity;
 vSigma=coreSigma*pixelRatio;vHaloR=0.0;vHaloP=0.0;vGlare=0.0;
 float radius=1.65;
 if(vMagnitude<haloFrom){vHaloR=mix(haloRadius.y,haloRadius.x,clamp((vMagnitude+1.0)/max(0.001,haloFrom+1.0),0.0,1.0));vHaloP=haloPeak;radius=max(radius,vHaloR);}
 if(vMagnitude<glareFrom){vGlare=glarePeak;radius=max(radius,glareRadius);}
 vFootprint=max(1.0,radius*2.0)*pixelRatio;gl_PointSize=vFootprint;
 vFade=shell>0.5?1.0:smoothstep(0.0,fadeNear,distance)*(1.0-smoothstep(viewRadius*0.8,viewRadius,distance));
}`;
export const fragment = `
varying vec3 vColor;varying float vIntensity;varying float vFootprint;varying float vSigma;varying float vMagnitude;varying float vFade;varying float vHaloR;varying float vHaloP;varying float vGlare;
void main(){
 vec2 coord=(gl_PointCoord-0.5)*vFootprint;float r=length(coord);float psf=exp(-r*r/(2.0*vSigma*vSigma));
 if(vHaloR>0.0)psf+=vHaloP*exp(-r*r/(vHaloR*vHaloR*0.28));
 if(vGlare>0.0)psf+=vGlare*exp(-r*r/(22.0*22.0*0.35));
 float edge=1.0-smoothstep(vFootprint*0.42,vFootprint*0.5,r);
 gl_FragColor=vec4(vColor*vIntensity*psf*vFade*edge,1.0);
}`;
