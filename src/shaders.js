const noise = `
float hash3(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){return noise3(p)*0.57+noise3(p*2.03+7.0)*0.29+noise3(p*4.13+13.0)*0.14;}
`;
const output = `
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
`;
export const starVertex = `
attribute float size;attribute vec3 tint;attribute float halo;
uniform float pixelRatio;uniform float shell;uniform vec3 palette[4];uniform float fadeNear;uniform float viewRadius;
varying vec3 vTint;varying float vFade;varying float vCore;varying float vHalo;
void main(){
 vec4 view=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*view;
 if(shell>0.5)gl_Position.z=gl_Position.w*0.99999;
 float distance=length(view.xyz);vFade=shell>0.5?1.0:smoothstep(0.0,fadeNear,distance)*(1.0-smoothstep(viewRadius*0.8,viewRadius,distance));
 vTint=palette[int(clamp(floor(tint.x*4.0),0.0,3.0))]*tint.y;
 float pixels=halo>0.0?halo:size;vCore=size/pixels;vHalo=step(0.01,halo);gl_PointSize=pixels*pixelRatio;
}`;
export const starFragment = `
varying vec3 vTint;varying float vFade;varying float vCore;varying float vHalo;
void main(){float r=length(gl_PointCoord-0.5)*2.0;float core=exp(-r*r*3.0/max(0.002,vCore*vCore));
 float glow=exp(-r*r*5.0)*vHalo*0.22;gl_FragColor=vec4(vTint,(core+glow)*vFade);${output}}
`;
export const planetVertex = `
varying vec3 vNormal;varying vec3 vPoint;varying vec3 vView;
void main(){vPoint=position;vec4 point=vec4(position,1.0);vec3 n=normal;
 #ifdef USE_INSTANCING
 point=instanceMatrix*point;n=mat3(instanceMatrix)*n;
 #endif
 vNormal=normalize(normalMatrix*n);vec4 view=modelViewMatrix*point;vView=normalize(-view.xyz);gl_Position=projectionMatrix*view;
}`;
export const planetFragment = `
uniform vec3 colors[4];uniform vec3 atmosphere;uniform vec3 lightDirection;uniform vec3 keyColor;uniform vec3 fillColor;
uniform float phase;uniform float bands;uniform float turbulence;uniform float kind;uniform float nightSide;uniform float terminator;
uniform float atmosphereIntensity;uniform float emissive;uniform float ringActive;uniform vec2 ringBounds;uniform mat3 surfaceToRing;uniform vec3 ringLight;
varying vec3 vNormal;varying vec3 vPoint;varying vec3 vView;
${noise}
void main(){
 vec3 p=normalize(vPoint),n=normalize(vNormal),view=normalize(vView);vec3 surface;vec3 emission=vec3(0.0);float detail=fbm(p*6.0+phase);
 if(kind<0.5){
   vec3 cell=fract(p*14.0+phase)-0.5;float crater=length(cell);
   float bowl=1.0-smoothstep(0.15,0.24,crater);float rim=smoothstep(0.20,0.235,crater)*(1.0-smoothstep(0.235,0.28,crater));
   surface=mix(colors[0],colors[1],detail);surface=mix(surface,colors[2],bowl*0.45);surface=mix(surface,colors[3],rim*0.35);
 }else if(kind<1.5){
   float continents=fbm(p*3.6+phase);float land=smoothstep(0.53,0.59,continents);
   surface=mix(colors[0],colors[1],smoothstep(0.40,0.55,continents));surface=mix(surface,colors[3],land);
   float clouds=smoothstep(0.58,0.72,fbm(p*8.0+phase+20.0));surface=mix(surface,colors[2],clouds*0.88);
 }else if(kind<2.5){
   float latitude=asin(p.y)/3.14159265+0.5;float longitude=atan(p.z,p.x);
   float warp=(noise3(vec3(longitude*1.7,p.y*3.0,phase))-0.5)*turbulence*0.65;
   float ribbon=latitude*bands+warp;float stripe=0.5+0.5*sin(ribbon*6.2831853);
   surface=mix(colors[0],colors[1],smoothstep(0.12,0.85,stripe));surface=mix(surface,colors[2],smoothstep(0.76,0.97,stripe)*0.62);
   surface=mix(surface,colors[3],(1.0-noise3(vec3(floor(ribbon),phase,3.0)))*0.2);
   for(int i=0;i<2;i++){
     float lon=atan(sin(longitude-phase-float(i)*2.4),cos(longitude-phase-float(i)*2.4));
     vec2 oval=vec2(lon/(0.24-float(i)*0.06),(p.y-(i==0?-0.22:0.38))/(0.065-float(i)*0.015));
     float storm=exp(-dot(oval,oval)*1.8);float swirl=sin(length(oval)*13.0+detail*2.0)*0.5+0.5;
     surface=mix(surface,mix(colors[3],colors[2],swirl),storm*0.8);
   }
 }else if(kind<3.5){
   float fractures=abs(noise3(p*19.0+phase)-0.5);float cracks=1.0-smoothstep(0.012,0.045,fractures);
   surface=mix(colors[0],colors[1],detail);surface=mix(surface,colors[2],pow(detail,3.0)*0.5);surface=mix(surface,colors[3],cracks*0.65);
 }else{
   float seams=1.0-smoothstep(0.018,0.055,abs(fbm(p*15.0+phase)-0.49));
   surface=mix(colors[2],colors[0],detail);surface=mix(surface,colors[1],pow(detail,4.0));emission=colors[3]*seams*emissive;
 }
 float ndl=dot(n,normalize(lightDirection));float day=smoothstep(-terminator,terminator,ndl);
 float diffuse=day*(0.25+0.75*max(0.0,ndl));float shadow=1.0;
 if(ringActive>0.5&&abs(ringLight.z)>0.015){
   vec3 rp=surfaceToRing*p;float t=-rp.z/ringLight.z;float r=length((rp+ringLight*max(0.0,t)).xy);
   float band=smoothstep(ringBounds.x-0.03,ringBounds.x+0.03,r)*(1.0-smoothstep(ringBounds.y-0.05,ringBounds.y+0.05,r));shadow=1.0-band*step(0.0,t)*0.42;
 }
 float limb=pow(1.0-max(0.0,dot(n,view)),4.0);float backlight=pow(max(0.0,-dot(normalize(lightDirection),view)),2.0);
 vec3 result=surface*(keyColor*diffuse*shadow+fillColor*nightSide)+emission*(1.0-day);
 result+=atmosphere*limb*atmosphereIntensity*(day*0.40+backlight*0.12);gl_FragColor=vec4(result,1.0);${output}
}`;
export const atmosphereFragment = `
uniform vec3 tint;uniform vec3 lightDirection;uniform float thickness;uniform float intensity;varying vec3 vNormal;varying vec3 vView;
void main(){
 vec3 n=normalize(vNormal),view=normalize(vView);float cosine=max(0.0,dot(n,view));float limb=sqrt(max(0.001,1.0-1.0/pow(1.0+thickness,2.0)));
 float density=exp(-pow((cosine-limb)/(limb*0.6),2.0))*smoothstep(0.0,limb*0.25,cosine);
 float day=smoothstep(-0.15,0.35,dot(n,normalize(lightDirection)));float back=pow(max(0.0,-dot(normalize(lightDirection),view)),2.0);
 gl_FragColor=vec4(tint*1.6,density*intensity*(day*0.6+back*0.25));${output}
}`;
export const ringVertex = `varying vec3 vPoint;void main(){vPoint=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
export const ringFragment = `
uniform vec3 colors[4];uniform float innerRadius;uniform float outerRadius;uniform float opacity;uniform float bands;uniform float phase;
uniform vec2 gaps;uniform vec3 localLight;uniform float planetRadius;uniform float shadows;varying vec3 vPoint;
float hash1(float n){return fract(sin(n*127.1+phase)*43758.5453);}
float noise1(float n){float i=floor(n),f=fract(n);return mix(hash1(i),hash1(i+1.0),f*f*(3.0-2.0*f));}
void main(){
 float t=(length(vPoint.xy)-innerRadius)/(outerRadius-innerRadius);float width=fwidth(t);
 float broad=noise1(t*bands);float fine=sin(t*bands*18.0+phase)*exp(-pow(width*bands*18.0,2.0));
 float gap=1.0;for(int i=0;i<2;i++){gap*=smoothstep(0.008,0.035,abs(t-gaps[i]));}
 float edge=smoothstep(0.0,0.055,t)*(1.0-smoothstep(0.84,1.0,t));
 vec3 tint=mix(colors[0],colors[1],broad);tint=mix(tint,colors[2],smoothstep(0.65,0.9,broad));tint=mix(tint,colors[3],(1.0-broad)*0.35);
 float ray=max(0.0,-dot(vPoint,localLight));float closest=length(vPoint+localLight*ray);
 float shadow=(1.0-smoothstep(planetRadius*0.96,planetRadius*1.04,closest))*step(0.001,ray)*shadows;
 gl_FragColor=vec4(tint*(0.9-shadow*0.8),edge*gap*opacity*(0.45+broad*0.5+fine*0.05));${output}
}`;
export const dustVertex = `
attribute vec3 base;attribute float size;uniform vec3 travel;uniform float boxSize;uniform vec2 resolution;uniform vec3 velocity;uniform float streak;uniform float pixelRatio;
varying vec2 vUv;varying float vFade;
void main(){
 vec3 local=mod(base-travel+boxSize*0.5,boxSize)-boxSize*0.5;float edge=max(max(abs(local.x),abs(local.y)),abs(local.z))/(boxSize*0.5);
 vFade=(1.0-smoothstep(0.75,1.0,edge))*smoothstep(2.0,10.0,length(local));vUv=uv;
 vec4 center=projectionMatrix*modelViewMatrix*vec4(local,1.0);vec4 end=projectionMatrix*modelViewMatrix*vec4(local+velocity*streak,1.0);
 vec2 delta=(end.xy/max(0.001,end.w)-center.xy/max(0.001,center.w))*resolution*0.5;
 float pixels=clamp(length(delta),size*pixelRatio,9.0*pixelRatio);vec2 axis=length(delta)>0.01?normalize(delta):vec2(0.0,1.0);
 vec2 offset=vec2(-axis.y,axis.x)*position.x*size*pixelRatio+axis*position.y*pixels;center.xy+=offset*2.0/resolution*center.w;gl_Position=center;
}`;
export const dustFragment = `
uniform vec3 tint;uniform float opacity;varying vec2 vUv;varying float vFade;
void main(){vec2 p=vUv*2.0-1.0;float alpha=exp(-p.x*p.x*4.0)*pow(max(0.0,1.0-p.y*p.y),1.5);
 gl_FragColor=vec4(tint,alpha*vFade*opacity);${output}}
`;
export const skyVertex = `
uniform mat4 inverseProjection;uniform mat3 cameraRotation;varying vec3 vDirection;varying vec2 vUv;
void main(){vUv=uv;vec4 ray=inverseProjection*vec4(position.xy,1.0,1.0);vDirection=cameraRotation*ray.xyz;gl_Position=vec4(position.xy,0.99999,1.0);}`;
export const skyFragment = `
uniform vec3 baseColor;uniform vec3 horizonColor;uniform vec3 mistColor;uniform vec3 bandNormal;uniform float bandOpacity;
uniform float seedPhase;uniform float grain;uniform float vignette;uniform float softness;uniform vec3 bandGlow;varying vec3 vDirection;varying vec2 vUv;${noise}
void main(){
 vec3 d=normalize(vDirection);float latitude=dot(d,bandNormal);float band=exp(-pow(latitude*3.7,2.0));
 float folds=fbm(d*3.0+seedPhase);float lanes=noise3(d*8.5+seedPhase*1.7);
 float riftA=smoothstep(0.52,0.72,noise3(d*5.2+vec3(seedPhase,2.1,0.4)));
 float riftB=smoothstep(0.58,0.78,noise3(d*7.1+vec3(0.7,seedPhase,-1.3)));
 float rifts=max(riftA*0.85,riftB*0.55)*smoothstep(0.08,0.0,abs(latitude));
 float dust=smoothstep(0.28,0.62,lanes)*(1.0-rifts);
 vec3 glow=bandGlow*band*bandOpacity*(0.55+folds*1.1)*(0.45+dust*0.55);
 vec3 result=mix(baseColor,horizonColor,pow(1.0-abs(d.y),3.0)*0.4)+glow*(1.0-rifts*0.92)+mistColor*band*bandOpacity*0.18*(1.0-rifts);
 float shade=1.0-vignette*smoothstep(softness,1.4,length(vUv*2.0-1.0));gl_FragColor=vec4(result*shade,1.0);${output}
 float dither=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5;gl_FragColor.rgb+=dither*grain;
}`;
export const nebulaVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
export const nebulaFragment = `
uniform sampler2D densityMap;uniform vec3 core;uniform vec3 mid;uniform vec3 edge;uniform float opacity;uniform float nearFade;uniform float softness;
varying vec2 vUv;
void main(){
 vec3 field=texture2D(densityMap,vUv).rgb;vec2 p=vUv*2.0-1.0;float envelope=pow(max(0.0,1.0-dot(p,p)),2.5);
 float density=smoothstep(0.12,0.85,field.r)*envelope;density*=mix(1.0,0.45+field.g,1.0-softness);
 vec3 tint=mix(edge,mid,smoothstep(0.10,0.50,field.r));tint=mix(tint,core,smoothstep(0.52,0.88,field.r));
 gl_FragColor=vec4(tint*1.5,density*opacity*nearFade);${output}
}`;
