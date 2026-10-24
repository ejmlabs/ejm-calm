export const surfaceVertex = `
varying vec3 vNormal;varying vec3 vPoint;varying vec3 vViewPoint;varying vec2 vUv;
void main(){vUv=uv;vPoint=position;vNormal=normalize(normalMatrix*normal);vec4 view=modelViewMatrix*vec4(position,1.0);vViewPoint=view.xyz;gl_Position=projectionMatrix*view;}`;
export const surfaceFragment = `
uniform sampler2D albedoMap;uniform sampler2D surfaceMap;uniform sampler2D normalMap;uniform sampler2D ringMap;uniform mat3 normalMatrix;
uniform float ready;uniform float kind;uniform float normalTaps;uniform vec2 texel;uniform float relief;uniform float radius;
uniform vec3 fallbackColor;uniform vec3 lightPositions[2];uniform vec3 lightColors[2];uniform vec2 lightIntensity;uniform vec3 ambient;
uniform vec3 atmosphere;uniform float atmosphereDensity;uniform float sunsetWidth;uniform vec3 sunsetColor;uniform float sunsetStrength;
uniform float softness;uniform float limbDarkening;uniform float emissionStrength;uniform float glintRoughness;uniform float glintStrength;uniform float time;
uniform float ringActive;uniform vec2 ringBounds;uniform mat3 surfaceToRing;uniform vec3 ringLights[2];
uniform vec4 parentSphere;uniform float moon;
varying vec3 vNormal;varying vec3 vPoint;varying vec3 vViewPoint;varying vec2 vUv;
float hg(float cosine,float g){return (1.0-g*g)/(12.56637*pow(max(0.01,1.0+g*g-2.0*g*cosine),1.5));}
vec2 spherical(vec3 p){p=normalize(p);return vec2(atan(p.z,-p.x)/6.2831853,asin(p.y)/3.14159265+0.5);}
float sphereShadow(vec3 point,vec3 light){vec3 delta=point-parentSphere.xyz;float t=-dot(delta,light);float d=length(delta+light*max(0.0,t));return 1.0-(1.0-smoothstep(parentSphere.w*0.97,parentSphere.w*1.02,d))*step(0.0,t)*moon;}
float ringShadow(vec3 point,vec3 direction){
 if(ringActive<0.5||abs(direction.z)<0.01)return 1.0;
 vec3 p=surfaceToRing*point;float t=-p.z/direction.z;vec3 hit=p+direction*max(0.0,t);float r=length(hit.xy);
 float u=(r-ringBounds.x)/(ringBounds.y-ringBounds.x);if(u<=0.0||u>=1.0||t<=0.0)return 1.0;
 float tau=texture2D(ringMap,vec2(u,0.5)).r*1.4;
 return exp(-tau/max(0.04,abs(direction.z)));
}
vec3 specularGGX(vec3 n,vec3 v,vec3 l,float roughness,float strength){
 vec3 h=normalize(v+l);float nv=max(0.001,dot(n,v)),nl=max(0.0,dot(n,l)),nh=max(0.0,dot(n,h)),vh=max(0.0,dot(v,h));
 float a=roughness*roughness,a2=a*a,d=a2/(3.14159265*pow(nh*nh*(a2-1.0)+1.0,2.0));
 float k=pow(roughness+1.0,2.0)/8.0,g=nv/(nv*(1.0-k)+k)*nl/(nl*(1.0-k)+k);
 float f=0.02+0.98*pow(1.0-vh,5.0);return vec3(min(4.0,d*g*f/max(0.001,4.0*nv*nl))*strength*nl);
}
void main(){
 vec4 base=texture2D(albedoMap,vUv),surface=texture2D(surfaceMap,vUv);vec3 p=normalize(vPoint),view=normalize(-vViewPoint);
 vec3 albedo=mix(fallbackColor,base.rgb,ready);vec3 objectNormal=mix(p,texture2D(normalMap,vUv).xyz*2.0-1.0,ready);
 if(normalTaps>0.5&&relief>0.0&&ready>0.5){
   float right=texture2D(albedoMap,vUv+vec2(texel.x,0)).a,left=texture2D(albedoMap,vUv-vec2(texel.x,0)).a,up=texture2D(albedoMap,vUv+vec2(0,texel.y)).a;
   float down=normalTaps>3.5?texture2D(albedoMap,vUv-vec2(0,texel.y)).a:base.a;
   float phi=vUv.x*6.2831853,lat=(vUv.y-0.5)*3.14159265;vec3 tangent=vec3(sin(phi),0,cos(phi)),bitangent=vec3(cos(phi)*sin(lat),cos(lat),-sin(phi)*sin(lat));
   objectNormal-=tangent*(right-left)*relief*1.8+bitangent*(up-down)*relief*1.8;
 }
 vec3 n=normalize(normalMatrix*objectNormal),result=albedo*ambient*0.015;float daylight=0.0;
 for(int i=0;i<2;i++){
   vec3 l=normalize(lightPositions[i]-vViewPoint);float strength=lightIntensity[i];float ndl=dot(n,l),day=smoothstep(-softness,softness,ndl);daylight=max(daylight,day*step(0.01,strength));
   float visibility=ringShadow(p,ringLights[i])*sphereShadow(vViewPoint,l);
   float diffuse=max(0.0,ndl)*day;float limb=kind==2.0?mix(1.0-limbDarkening,1.0,pow(max(0.0,dot(n,view)),0.5)):1.0;
   float cloudShadow=1.0;
   if(kind==1.0&&ready>0.5){vec2 offset=vec2(l.x,l.y)*0.025;cloudShadow-=texture2D(surfaceMap,vUv+offset+vec2(time*0.0004/6.2831853,0)).b*0.35;}
   result+=albedo*lightColors[i]*strength*diffuse*visibility*cloudShadow*limb;
   float ocean=kind==1.0?surface.r:0.0,ice=kind==3.0?0.4:0.0;
   if((ocean+ice)>0.01)result+=specularGGX(n,view,l,ocean>0.1?glintRoughness:0.3,ocean>0.1?glintStrength:ice)*lightColors[i]*strength*visibility;
   float sunset=exp(-pow(ndl/max(0.001,sunsetWidth),2.0))*atmosphereDensity;
   float rim=pow(1.0-max(0.0,dot(normalize(vNormal),view)),3.0);
   result+=sunsetColor*sunset*sunsetStrength*rim*strength;
 }
 if(kind==4.0)result+=vec3(1.0,0.145,0.024)*surface.g*emissionStrength*mix(1.0,0.1,daylight);
 gl_FragColor=vec4(result,1.0);
}`;

export const atmosphereFragment = `
uniform vec3 tint;uniform float thickness;uniform float density;uniform float exponent;uniform float scatterG;uniform float backlitBoost;
uniform vec3 lightPositions[2];uniform vec3 lightColors[2];uniform vec2 lightIntensity;varying vec3 vNormal;varying vec3 vViewPoint;
float hg(float c,float g){return (1.0-g*g)/(12.56637*pow(max(0.015,1.0+g*g-2.0*g*c),1.5));}
void main(){
 vec3 n=normalize(vNormal),v=normalize(-vViewPoint);float cosine=max(0.0,dot(n,v));float limb=sqrt(max(0.001,1.0-1.0/pow(1.0+thickness,2.0)));
 float path=exp(-pow((cosine-limb)/(limb*0.65),2.0))*smoothstep(0.0,limb*0.22,cosine);vec3 emission=vec3(0);
 for(int i=0;i<2;i++){vec3 l=normalize(lightPositions[i]-vViewPoint);float day=smoothstep(-0.18,0.3,dot(n,l));float scatter=hg(dot(-l,v),scatterG);
 emission+=tint*lightColors[i]*lightIntensity[i]*path*density*(day*0.35+scatter*backlitBoost*0.12);}
 gl_FragColor=vec4(emission,1.0);
}`;

export const cloudFragment = `
uniform sampler2D surfaceMap;uniform float ready;uniform float time;uniform vec3 lightPositions[2];uniform vec3 lightColors[2];uniform vec2 lightIntensity;
varying vec3 vNormal;varying vec3 vViewPoint;varying vec2 vUv;
void main(){float cloud=texture2D(surfaceMap,vUv+vec2(time*0.0004/6.2831853,0)).b*ready;vec3 color=vec3(0.015);
for(int i=0;i<2;i++){vec3 l=normalize(lightPositions[i]-vViewPoint);color+=lightColors[i]*max(0.0,dot(normalize(vNormal),l))*lightIntensity[i];}
gl_FragColor=vec4(vec3(0.91,0.93,0.96)*color,cloud*0.9);}`;

export const ringVertex = `varying vec3 vPoint;varying vec3 vViewPoint;varying vec3 vNormal;void main(){vPoint=position;vNormal=normalize(normalMatrix*normal);vec4 view=modelViewMatrix*vec4(position,1.0);vViewPoint=view.xyz;gl_Position=projectionMatrix*view;}`;
export const ringFragment = `
uniform sampler2D densityMap;uniform vec3 colors[4];uniform vec2 bounds;uniform float radius;uniform float scatterG;uniform float backlitBoost;
uniform vec3 localLights[2];uniform vec3 lightPositions[2];uniform vec3 lightColors[2];uniform vec2 lightIntensity;
varying vec3 vPoint;varying vec3 vViewPoint;varying vec3 vNormal;
float hg(float c,float g){return (1.0-g*g)/(12.56637*pow(max(0.01,1.0+g*g-2.0*g*c),1.5));}
void main(){
 float r=length(vPoint.xy),u=(r-bounds.x)/(bounds.y-bounds.x),width=fwidth(u);vec4 data=texture2D(densityMap,vec2(u,0.5));
 float edge=smoothstep(0.0,max(0.03,width*2.0),u)*(1.0-smoothstep(0.92,1.0,u));vec3 view=normalize(-vViewPoint),normal=normalize(vNormal);
 float mu=max(0.04,abs(dot(normal,view))),tau=data.r*1.4;float alpha=(1.0-exp(-tau/mu))*edge;
 vec3 particle=mix(colors[0],colors[1],data.g);particle=mix(particle,colors[2],data.b*0.4);particle=mix(particle,colors[3],(1.0-data.g)*0.18);vec3 light=vec3(0.015);
 for(int i=0;i<2;i++){
   vec3 local=normalize(localLights[i]);float t=max(0.0,-dot(vPoint,local));float closest=length(vPoint+local*t);
   float shadow=1.0-(1.0-smoothstep(radius*0.97,radius*1.03,closest))*step(0.001,t);
   vec3 l=normalize(lightPositions[i]-vViewPoint);float scatter=hg(dot(-l,view),scatterG)*backlitBoost;
   light+=lightColors[i]*lightIntensity[i]*(abs(dot(normal,l))*0.7+scatter)*shadow;
 }
 gl_FragColor=vec4(particle*light,alpha);
}`;
