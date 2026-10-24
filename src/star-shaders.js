export const vertex = `
attribute vec3 stellarColor;attribute float flux;uniform float pixelRatio;uniform float shell;uniform float fadeNear;uniform float viewRadius;
uniform float referenceDistance;uniform float minFlux;uniform float peak;uniform vec3 regionTint;
varying vec3 vColor;varying float vIntensity;varying float vFootprint;varying float vSigma;varying float vMagnitude;varying float vFade;
void main(){
 vec4 view=modelViewMatrix*vec4(position,1.0);float distance=length(view.xyz);gl_Position=projectionMatrix*view;
 if(shell>0.5)gl_Position.z=gl_Position.w*0.99999;
 float intensity=shell>0.5?flux:flux*pow(referenceDistance/max(1.0,distance),2.0);
 vMagnitude=2.0-2.5*log(max(minFlux,intensity))/log(10.0);intensity=clamp(intensity,minFlux,peak);
 vColor=stellarColor*mix(vec3(1.0),regionTint,0.1);vIntensity=intensity;
 vSigma=0.55*pixelRatio;float radius=vMagnitude<0.0?22.0:(vMagnitude<1.5?mix(14.0,6.0,clamp((vMagnitude+1.0)/2.5,0.0,1.0)):1.65);
 vFootprint=max(1.0,radius*2.0)*pixelRatio;gl_PointSize=vFootprint;
 vFade=shell>0.5?1.0:smoothstep(0.0,fadeNear,distance)*(1.0-smoothstep(viewRadius*0.8,viewRadius,distance));
}`;
export const fragment = `
varying vec3 vColor;varying float vIntensity;varying float vFootprint;varying float vSigma;varying float vMagnitude;varying float vFade;
void main(){
 float r=length((gl_PointCoord-0.5)*vFootprint);float psf=exp(-r*r/(2.0*vSigma*vSigma));
 if(vMagnitude<1.5){float radius=mix(14.0,6.0,clamp((vMagnitude+1.0)/2.5,0.0,1.0));psf+=0.03*exp(-r*r/(radius*radius*0.32));}
 if(vMagnitude<0.0)psf+=0.012*exp(-r*r/(22.0*22.0*0.4));
 float edge=1.0-smoothstep(vFootprint*0.35,vFootprint*0.5,r);
 gl_FragColor=vec4(vColor*vIntensity*psf*vFade*edge,1.0);
}`;
