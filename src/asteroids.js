import * as THREE from '../vendor/three/three.module.js';
import { surfaceFbm } from './surface-recipe.js';

export class AsteroidKit {
  constructor(seed, look, tier) {
    this.seed = seed; this.look = look; this.tier = tier; this.names = ['C', 'S', 'M']; this.geometries = []; this.materials = []; this.fields = new Set(); this.dummy = new THREE.Object3D();
    for (const [index, name] of this.names.entries()) {
      this.geometries.push(this.geometry(index, tier)); const spec = look.realism.asteroids.classes[name];
      // Floor emissive so lit albedo reads ≥ #1a1a1a even under dim interstellar key.
      const material = new THREE.MeshStandardMaterial({
        color: '#ffffff', roughness: spec.roughness, metalness: spec.metalness,
        emissive: '#1a1a1a', emissiveIntensity: 0.35,
      });
      this.detailMaterial(material, tier); this.materials.push(material);
    }
  }
  geometry(index, tier) {
    const geometry = new THREE.IcosahedronGeometry(1, this.look.realism.asteroids.detailByTier[tier]), points = geometry.getAttribute('position');
    for (let i = 0; i < points.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(points, i), field = surfaceFbm(point.x * 3, point.y * 3, point.z * 3, this.seed + index * 113, this.look.realism.asteroids.displacementOctaves);
      point.multiplyScalar(1 + (field - 0.5) * this.look.asteroids.shape.displacement * 2); points.setXYZ(i, point.x, point.y, point.z);
    } geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
  }
  detailMaterial(material, tier) {
    material.onBeforeCompile = (shader) => {
      if (!this.look.realism.asteroids.craterNormals[tier]) return;
      shader.vertexShader = `varying vec3 vRockPoint;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockPoint=position;');
      shader.fragmentShader = `varying vec3 vRockPoint;\n${shader.fragmentShader}`.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nfloat crater=length(fract(vRockPoint*11.0)-0.5);float ridge=exp(-pow((crater-0.25)*24.0,2.0));normal=normalize(normal+vec3(-dFdx(ridge),-dFdy(ridge),0.0)*0.12);');
    }; material.customProgramCacheKey = () => `rock-relief-${tier}`; material.needsUpdate = true;
  }
  create(data, origin) {
    const group = new THREE.Group(), record = { group, data, meshes: [] };
    for (let index = 0; index < this.names.length; index++) {
      const entries = data.filter((rock) => rock.composition === this.names[index]); if (!entries.length) continue;
      const mesh = new THREE.InstancedMesh(this.geometries[index], this.materials[index], entries.length), spec = this.look.realism.asteroids.classes[this.names[index]];
      entries.forEach((rock, slot) => {
        this.dummy.position.fromArray(rock.position.map((n, i) => n - origin[i])); this.dummy.rotation.fromArray([...rock.rotation, 'XYZ']);
        this.dummy.scale.set(rock.radius, rock.radius * rock.stretch, rock.radius * 0.8); this.dummy.updateMatrix(); mesh.setMatrixAt(slot, this.dummy.matrix);
        mesh.setColorAt(slot, new THREE.Color(spec.albedo[0]).lerp(new THREE.Color(spec.albedo[1]), rock.tint));
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.userData.rockClass = index; mesh.userData.entries = entries; mesh.computeBoundingSphere(); group.add(mesh); record.meshes.push(mesh);
    }
    this.fields.add(record); group.userData.asteroidRecord = record; this.count(record); return group;
  }
  count(record) {
    const count = this.look.asteroids.count[this.tier], selected = record.data.slice(0, count);
    for (const mesh of record.meshes) mesh.count = selected.filter((rock) => rock.composition === this.names[mesh.userData.rockClass]).length;
  }
  setTier(tier) {
    if (tier === this.tier) return; this.tier = tier;
    const old = this.geometries; this.geometries = this.names.map((_, i) => this.geometry(i, tier));
    this.materials.forEach((material) => this.detailMaterial(material, tier));
    for (const field of this.fields) { for (const mesh of field.meshes) mesh.geometry = this.geometries[mesh.userData.rockClass]; this.count(field); }
    for (const geometry of old) geometry.dispose();
  }
  remove(group) { const record = group.userData.asteroidRecord; if (!record) return; for (const mesh of record.meshes) mesh.dispose(); this.fields.delete(record); }
  dispose() { for (const field of this.fields) this.remove(field.group); for (const geometry of this.geometries) geometry.dispose(); for (const material of this.materials) material.dispose(); }
}
