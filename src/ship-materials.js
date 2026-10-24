import * as THREE from '../vendor/three/three.module.js';

export function panelMaterial(parameters, lines) {
  const material = new THREE.MeshPhysicalMaterial(parameters);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vPanelPoint;varying vec3 vPanelNormal;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPanelPoint=position;vPanelNormal=normal;');
    shader.fragmentShader = `varying vec3 vPanelPoint;varying vec3 vPanelNormal;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 panelGrid=abs(fract(vPanelPoint/${lines.spacing}+0.5)-0.5)*${lines.spacing};vec3 panelNormal=abs(vPanelNormal);
float panelDistance=panelNormal.x>panelNormal.y&&panelNormal.x>panelNormal.z?min(panelGrid.y,panelGrid.z):(panelNormal.y>panelNormal.z?min(panelGrid.x,panelGrid.z):min(panelGrid.x,panelGrid.y));
float panelAmount=(1.0-smoothstep(${lines.width},${lines.width}+max(0.0001,fwidth(panelDistance)),panelDistance))*(1.0-smoothstep(7.5,8.5,length(vViewPosition)));
diffuseColor.rgb*=1.0-panelAmount*${lines.albedoDarken};`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+panelAmount*${lines.roughnessAdd},0.04,1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(-dFdx(panelAmount),-dFdy(panelAmount),0.0)*${lines.normalDepth}*0.08);`);
  };
  material.customProgramCacheKey = () => 'courier-panel-grooves'; return material;
}

export class ShipEnvironment {
  constructor(renderer, settings) {
    this.renderer = renderer; this.settings = settings; this.lastWeights = null; this.face = -1;
    this.target = new THREE.WebGLCubeRenderTarget(settings.cubeSize, { type: THREE.HalfFloatType });
    this.camera = new THREE.CubeCamera(0.1, 10, this.target); this.camera.coordinateSystem = renderer.coordinateSystem; this.camera.updateCoordinateSystem(); this.camera.updateMatrixWorld(true);
    this.scene = new THREE.Scene();
    this.material = new THREE.ShaderMaterial({ side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { deep: { value: new THREE.Color() }, band: { value: new THREE.Color() }, gas: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 deep;uniform vec3 band;uniform vec3 gas;varying vec3 vDirection;void main(){vec3 d=normalize(vDirection);float mist=exp(-pow((d.y+d.x*0.3)*3.0,2.0));gl_FragColor=vec4(deep+band*mist+gas*mist*0.08,1.0);}' });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8), this.material); this.scene.add(this.sphere);
    this.prefilter = new THREE.PMREMGenerator(renderer); this.filtered = null;
  }
  step(weights, palette, scene, budget = 2) {
    if (budget <= 0) return;
    if (this.face < 0 && (!this.lastWeights || weights.some((weight, i) => Math.abs(weight - this.lastWeights[i]) > this.settings.refreshWhenRegionShifts))) {
      this.face = 0; this.lastWeights = [...weights]; this.material.uniforms.deep.value.copy(palette.deep);
      this.material.uniforms.band.value.copy(palette.band); this.material.uniforms.gas.value.copy(palette.nebula[0]);
    }
    if (this.face < 0) return;
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target, this.face); this.renderer.clear(); this.renderer.render(this.scene, this.camera.children[this.face]);
    this.face++;
    if (this.face === 6) {
      this.target.texture.needsPMREMUpdate = true; const filtered = this.prefilter.fromCubemap(this.target.texture);
      this.filtered?.dispose(); this.filtered = filtered; scene.environment = filtered.texture; scene.environmentIntensity = this.settings.intensity; this.face = -1;
    }
    this.renderer.setRenderTarget(previous);
  }
  dispose() { this.target.dispose(); this.filtered?.dispose(); this.prefilter.dispose(); this.material.dispose(); this.sphere.geometry.dispose(); }
}
