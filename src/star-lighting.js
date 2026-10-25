import * as THREE from '../vendor/three/three.module.js';

export class StarLighting {
  constructor(look) {
    this.settings = look.realism.lighting; this.key = ''; this.transition = 0;
    this.lights = Array.from({ length: 2 }, () => ({ position: new THREE.Vector3(), viewPosition: new THREE.Vector3(), direction: new THREE.Vector3(0.8, 0.3, -0.2).normalize(), color: new THREE.Color(1, 1, 1), intensity: 0 }));
    this.previous = this.lights.map((light) => ({ direction: light.direction.clone(), color: light.color.clone(), intensity: 0 }));
  }
  update(system, flight, camera, palette, dt) {
    const key = system?.key ?? 'interstellar';
    if (key !== this.key) {
      this.previous.forEach((item, i) => { item.direction.copy(this.lights[i].direction); item.color.copy(this.lights[i].color); item.intensity = this.lights[i].intensity; });
      this.transition = this.key ? 0 : 6; this.key = key;
    }
    this.transition = Math.min(6, this.transition + dt); const weight = THREE.MathUtils.smoothstep(this.transition, 0, 6);
    const observer = new THREE.Vector3(...flight.position), distance = system ? observer.distanceTo(new THREE.Vector3(...system.position)) : Infinity;
    const reach = this.settings.illuminance.referenceDistance * 3;
    const rangeFade = system ? THREE.MathUtils.smoothstep(reach, reach * 0.55, distance) : 1;
    const stars = rangeFade < 0.999 ? system?.stars ?? [] : [];
    const totalLuminosity = stars.reduce((sum, star) => sum + star.luminosity, 0) || 1;
    const systemIlluminance = THREE.MathUtils.clamp(totalLuminosity * (this.settings.illuminance.referenceDistance / Math.max(distance, 100)) ** 2, ...this.settings.illuminance.clamp);
    const illuminance = stars.length ? THREE.MathUtils.lerp(systemIlluminance, this.settings.interstellarKey, rangeFade) : this.settings.interstellarKey;
    for (let i = 0; i < 2; i++) {
      const light = this.lights[i], star = stars[i];
      const targetDirection = star ? new THREE.Vector3(...star.position).sub(observer).normalize() : this.previous[i].direction;
      const targetColor = star ? new THREE.Color().setRGB(...star.color) : palette.key;
      const targetIntensity = star ? illuminance * star.luminosity / totalLuminosity : i === 0 ? this.settings.interstellarKey : 0;
      light.direction.copy(this.previous[i].direction).lerp(targetDirection, weight).normalize(); light.color.copy(this.previous[i].color).lerp(targetColor, weight);
      light.intensity = this.previous[i].intensity + (targetIntensity - this.previous[i].intensity) * weight;
      light.position.copy(light.direction).multiplyScalar(star ? observer.distanceTo(new THREE.Vector3(...star.position)) : 100000);
      light.viewPosition.copy(light.position).applyMatrix4(camera.matrixWorldInverse);
    }
    return this.lights;
  }
}
