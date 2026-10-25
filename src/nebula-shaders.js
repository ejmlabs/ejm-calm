export const vertex = `precision highp float;in vec3 position;uniform mat4 modelMatrix;uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;out vec3 vPosition;
void main(){vPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
export const fragment = `precision highp float;precision highp sampler3D;
uniform sampler3D densityA;uniform sampler3D densityB;uniform sampler2D jitterMap;
uniform vec3 centers[2];uniform vec3 axes[2];uniform vec2 radii;uniform float count;uniform vec3 cameraPosition;
uniform vec3 oxygen;uniform vec3 hydrogen;uniform vec3 sulphur;uniform vec3 reflection;uniform vec3 extinction;
uniform float erosion;uniform float dustCoverage;uniform float emissionScale;uniform float extinctionScale;uniform float steps;uniform float time;
uniform vec3 embedded[8];uniform float embeddedCount;uniform float lowSlices;
in vec3 vPosition;layout(location=0)out vec4 outEmission;layout(location=1)out vec4 outTransmission;
vec2 hit(vec3 origin,vec3 direction,vec3 center,float radius){vec3 oc=origin-center;float b=dot(oc,direction),h=b*b-dot(oc,oc)+radius*radius;if(h<0.0)return vec2(1e20,-1e20);h=sqrt(h);return vec2(max(0.0,-b-h),-b+h);}
void main(){
 vec3 ray=normalize(vPosition-cameraPosition);float first=1e20,last=-1e20;
 for(int i=0;i<2;i++){if(float(i)>=count)break;vec2 segment=hit(cameraPosition,ray,centers[i],radii[i]);if(segment.y>segment.x){first=min(first,segment.x);last=max(last,segment.y);}}
 if(last<=first){outEmission=vec4(0);outTransmission=vec4(1);return;}
 float samples=lowSlices>0.5?6.0:steps;float stride=(last-first)/samples;
 float jitter=texture(jitterMap,fract(gl_FragCoord.xy/32.0+vec2(fract(time*0.75487766),fract(time*0.56984029)))).r;
 vec3 transmittance=vec3(1),emission=vec3(0);
 // Camera-facing slice fade: slice normal ≈ ray toward the proxy center; fade when grazing.
 vec3 sliceNormal=normalize(cameraPosition-centers[0]);
 float sliceFade=lowSlices>0.5?mix(0.2,1.0,pow(abs(dot(ray,sliceNormal)),1.4)):1.0;
 for(int sampleIndex=0;sampleIndex<48;sampleIndex++){
  if(float(sampleIndex)>=samples)break;
  float distance=first+(float(sampleIndex)+jitter)*stride;vec3 point=cameraPosition+ray*distance,stepEmission=vec3(0),opticalDepth=vec3(0);
  for(int i=0;i<2;i++){
   if(float(i)>=count)break;vec3 p=(point-centers[i])/radii[i];float ellipsoid=dot(p/axes[i],p/axes[i]);if(ellipsoid>=1.0)continue;
   // Soft envelope: no hard sphere rim.
   float envelope=pow(max(0.0,1.0-ellipsoid),2.8);vec4 field=i==0?texture(densityA,p*0.5+0.5):texture(densityB,p*0.5+0.5);
   float density=field.r*envelope;float radius=length(p);
   float core=smoothstep(0.0,0.12,radius)*(1.0-smoothstep(0.28,0.48,radius));
   float shell=smoothstep(0.2,0.38,radius)*(1.0-smoothstep(0.7,0.9,radius));
   float edge=smoothstep(0.55,0.72,radius)*(1.0-smoothstep(0.88,1.0,radius));
   float dust=smoothstep(1.0-dustCoverage-0.05,1.0-dustCoverage+0.1,field.g)*envelope;
   float localReflection=0.0;
   for(int star=0;star<8;star++){if(float(star)>=embeddedCount)break;float gap=length((embedded[star]-point)/radii[i]);localReflection+=exp(-gap*gap/0.1225)*0.55;}
   float nearFade=mix(0.4,1.0,smoothstep(500.0,2800.0,length(cameraPosition-centers[i])));
   vec3 gas=(oxygen*core*1.15+hydrogen*shell+sulphur*edge*0.95+reflection*(field.b*0.2+min(1.0,localReflection)*0.45))*density;
   stepEmission+=gas*emissionScale*stride/radii[i]*nearFade*sliceFade;
   // Dust only darkens/reddens (Beer–Lambert); never adds tan emission.
   opticalDepth+=extinction*dust*extinctionScale*stride/radii[i]*nearFade;
  }
  emission+=transmittance*stepEmission;transmittance*=exp(-opticalDepth);
  if(max(max(transmittance.r,transmittance.g),transmittance.b)<0.02)break;
 }
 outEmission=vec4(min(emission,vec3(0.62)),1);outTransmission=vec4(transmittance,1);
}`;
export const historyVertex = `precision highp float;in vec3 position;in vec2 uv;out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}`;
export const historyFragment = `precision highp float;uniform sampler2D emission;uniform sampler2D transmission;uniform sampler2D oldEmission;uniform sampler2D oldTransmission;uniform float weight;in vec2 vUv;
layout(location=0)out vec4 outEmission;layout(location=1)out vec4 outTransmission;
void main(){outEmission=mix(texture(emission,vUv),texture(oldEmission,vUv),weight);outTransmission=mix(texture(transmission,vUv),texture(oldTransmission,vUv),weight);}`;
