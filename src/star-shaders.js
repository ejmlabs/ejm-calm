export const vertex = `
attribute vec3 stellarColor;attribute float flux;uniform float pixelRatio;uniform float shell;uniform float fadeNear;uniform float viewRadius;
uniform float referenceDistance;uniform float minFlux;uniform float peak;uniform vec3 regionTint;
uniform float coreSigma;uniform float haloFrom;uniform vec2 haloRadius;uniform float haloPeak;uniform float glareFrom;uniform float glareRadius;uniform float glarePeak;
uniform vec2 resolution;
varying vec3 vColor;varying float vIntensity;varying float vFootprint;varying float vSigma;varying float vMagnitude;varying float vFade;varying float vHaloR;varying float vHaloP;varying float vGlare;varying float vAspect;
void main(){
 vec4 view=modelViewMatrix*vec4(position,1.0);float distance=length(view.xyz);gl_Position=projectionMatrix*view;
 if(shell>0.5)gl_Position.z=gl_Position.w*0.99999;
 float intensity=shell>0.5?flux:flux*pow(referenceDistance/max(1.0,distance),2.0);
 vMagnitude=2.0-2.5*log(max(minFlux,intensity))/log(10.0);intensity=clamp(intensity,minFlux,peak);
 vColor=stellarColor*mix(vec3(1.0),regionTint,0.1);vIntensity=intensity;
 vSigma=coreSigma*pixelRatio;vHaloR=0.0;vHaloP=0.0;vGlare=0.0;vAspect=resolution.x/max(1.0,resolution.y);
 float radius=1.65;
 // Cap halo at 3.5× core sigma so disks stay compact and clear of the HUD.
 float haloCap=vSigma*3.5;
 if(vMagnitude<haloFrom){vHaloR=min(haloCap,mix(haloRadius.y,haloRadius.x,clamp((vMagnitude+1.0)/max(0.001,haloFrom+1.0),0.0,1.0))*pixelRatio);vHaloP=haloPeak;radius=max(radius,vHaloR/pixelRatio);}
 if(vMagnitude<glareFrom){vGlare=glarePeak;radius=max(radius,min(glareRadius,haloCap*1.15/pixelRatio));}
 vFootprint=max(1.0,radius*2.0)*pixelRatio;gl_PointSize=vFootprint;
 vFade=shell>0.5?1.0:smoothstep(0.0,fadeNear,distance)*(1.0-smoothstep(viewRadius*0.8,viewRadius,distance));
}`;
export const fragment = `
uniform vec2 resolution;
varying vec3 vColor;varying float vIntensity;varying float vFootprint;varying float vSigma;varying float vMagnitude;varying float vFade;varying float vHaloR;varying float vHaloP;varying float vGlare;varying float vAspect;
void main(){
 // PSF is circular in pixel space (gl_PointCoord spans a square of gl_PointSize pixels).
 vec2 coord=(gl_PointCoord-0.5)*vFootprint;float r=length(coord);float psf=exp(-r*r/(2.0*vSigma*vSigma));
 if(vHaloR>0.0)psf+=vHaloP*exp(-r*r/(vHaloR*vHaloR*0.28));
 if(vGlare>0.0){float glareR=min(vHaloR>0.0?vHaloR*1.2:vSigma*3.5,vFootprint*0.45);psf+=vGlare*exp(-r*r/(glareR*glareR*0.35));}
 float edge=1.0-smoothstep(vFootprint*0.42,vFootprint*0.5,r);
 // Keep bright cores clear of the bottom HUD band (~10% of frame height).
 float hudClear=smoothstep(0.06,0.12,gl_FragCoord.y/max(1.0,resolution.y));
 gl_FragColor=vec4(vColor*vIntensity*psf*vFade*edge*hudClear,1.0);
}`;
