import * as THREE from 'three';
import { fork } from './rng.js';
import { SHIP_LAND_MARGIN, type ShipSpec } from './terrain.js';
import { clampClearOfLand, type Shore } from './shore.js';

export type ShipHandle = {
  group: THREE.Group;
  spec: ShipSpec;
  update: (dt: number, time: number, shore: Shore) => void;
  dispose: () => void;
};

function hullGeometry(kind: ShipSpec['kind']): THREE.BufferGeometry {
  const length = kind === 'tall' ? 4.4 : 3.4;
  const beam = kind === 'tall' ? 1.2 : 1.05;
  const depth = 0.85;
  // Pointed bow, tapering stern.
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.quadraticCurveTo(-length / 2, beam * 0.45, -length * 0.2, beam / 2);
  shape.lineTo(length * 0.28, beam / 2 * 0.95);
  shape.quadraticCurveTo(length * 0.42, beam * 0.35, length / 2, 0); // pointed bow
  shape.quadraticCurveTo(length * 0.42, -beam * 0.35, length * 0.28, -beam / 2 * 0.95);
  shape.lineTo(-length * 0.2, -beam / 2);
  shape.quadraticCurveTo(-length / 2, -beam * 0.45, -length / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  // Sink so ~35% sits below the waterline once the group is placed.
  geo.translate(0, depth * 0.2, 0);
  return geo;
}

function makeSail(width: number, height: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, height, 12, 14);
  // Belly curve: deeper mid-cloth billow so it never reads as a flat rectangle.
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const nx = x / (width / 2 + 0.01);
    const ny = y / (height / 2 + 0.01);
    const billow = (1 - ny * ny) * (1 - nx * nx * 0.55) * 0.55;
    const twist = nx * 0.06 * (1 - Math.abs(ny));
    pos.setZ(i, billow);
    pos.setX(i, x + twist);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xe8d9b8, // cream, not flat white
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x2a2418),
    emissiveIntensity: 0.22,
    envMapIntensity: 0.08,
  });
  return new THREE.Mesh(geo, mat);
}

function buildShipMesh(spec: ShipSpec): { group: THREE.Group; sails: THREE.Mesh[]; sailBindZ: Float32Array[]; disposables: Array<{ dispose: () => void }> } {
  const rng = fork(spec.seed, 'mesh');
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const hullGeo = hullGeometry(spec.kind);
  // Darker hull so it reads against bright water glare.
  const hullMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.06, 0.45, 0.12),
    roughness: 0.9,
    metalness: 0.03,
  });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  group.add(hull);
  disposables.push(hullGeo, hullMat);

  // Pale waterline stripe.
  const stripeGeo = new THREE.BoxGeometry(spec.kind === 'tall' ? 3.6 : 2.8, 0.08, spec.kind === 'tall' ? 1.05 : 0.9);
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xc8bba0, roughness: 0.85 });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.set(0.1, 0.42, 0);
  group.add(stripe);
  disposables.push(stripeGeo, stripeMat);

  const mastMat = new THREE.MeshStandardMaterial({ color: 0x3e3226, roughness: 0.88 });
  disposables.push(mastMat);
  const sails: THREE.Mesh[] = [];
  const sailBindZ: Float32Array[] = [];

  // Tall ships: 3 masts; sloops: 1.
  const mastCount = spec.kind === 'tall' ? 3 : 1;
  const mastXs = spec.kind === 'tall' ? [-1.2, 0.15, 1.35] : [0.15];
  for (let m = 0; m < mastCount; m++) {
    const mastH = spec.kind === 'tall' ? 5.2 - Math.abs(m - 1) * 0.45 : 3.8;
    const mastGeo = new THREE.CylinderGeometry(0.055, 0.08, mastH, 6);
    disposables.push(mastGeo);
    const mast = new THREE.Mesh(mastGeo, mastMat);
    const x = mastXs[m]!;
    mast.position.set(x, mastH / 2 + 0.1, 0);
    group.add(mast);

    // Large cream sails facing sideways (local +Z after yaw π/2).
    const sailW = spec.kind === 'tall' ? 2.6 : 2.2;
    const sail = makeSail(sailW, mastH * 0.78);
    sail.position.set(x, mastH * 0.52, 0);
    sail.rotation.y = Math.PI / 2;
    group.add(sail);
    sails.push(sail);
    const bind = new Float32Array(sail.geometry.attributes.position!.count);
    for (let i = 0; i < bind.length; i++) bind[i] = sail.geometry.attributes.position!.getZ(i);
    sailBindZ.push(bind);
    disposables.push(sail.geometry, sail.material as THREE.Material);

    if (spec.kind === 'tall' && m === mastCount - 1) {
      const jib = makeSail(1.6, 2.6);
      jib.position.set(2.1, 1.9, 0);
      jib.rotation.y = Math.PI / 2;
      jib.rotation.z = -0.28;
      group.add(jib);
      sails.push(jib);
      const jbind = new Float32Array(jib.geometry.attributes.position!.count);
      for (let i = 0; i < jbind.length; i++) jbind[i] = jib.geometry.attributes.position!.getZ(i);
      sailBindZ.push(jbind);
      disposables.push(jib.geometry, jib.material as THREE.Material);
    }
  }

  const cabinGeo = new THREE.BoxGeometry(0.85, 0.48, 0.72);
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 0.88 });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(-1.15, 0.58, 0);
  group.add(cabin);
  disposables.push(cabinGeo, cabinMat);

  void rng;
  group.scale.setScalar(spec.scale);
  return { group, sails, sailBindZ, disposables };
}

export type ShipOptions = {
  /** World point the ship drifts around, and how far it may wander from it. */
  anchor?: { x: number; z: number };
  leash?: number;
  /** Only nudge off the coast where this says the shore is cheap to read (nav tile built). */
  shoreReady?: (x: number, z: number) => boolean;
};

export function createShips(specs: ShipSpec[], options: ShipOptions = {}): ShipHandle[] {
  return specs.map((spec) => createShip(spec, options));
}

export function createShip(spec: ShipSpec, options: ShipOptions = {}): ShipHandle {
  {
    const { group, sails, sailBindZ, disposables } = buildShipMesh(spec);
    const anchor = options.anchor ?? { x: 0, z: 0 };
    const leash = options.leash ?? 280;
    let x = spec.x;
    let z = spec.z;
    let heading = spec.heading;
    const drift = 0.35 + (spec.seed % 1000) / 1000 * 0.45;
    const bobPhase = (spec.seed % 97) / 97 * Math.PI * 2;

    return {
      group,
      spec,
      update(dt: number, time: number, shore: Shore) {
        heading += dt * 0.015 * (spec.kind === 'sloop' ? 1 : 0.7);
        const speed = drift * dt;
        x += Math.sin(heading) * speed;
        z += Math.cos(heading) * speed;
        if (!options.shoreReady || options.shoreReady(x, z)) {
          const cleared = clampClearOfLand(x, z, shore, SHIP_LAND_MARGIN * 0.6);
          x = cleared.x;
          z = cleared.z;
        }
        if (Math.hypot(x - anchor.x, z - anchor.z) > leash) {
          heading += Math.PI * 0.6;
          x = anchor.x + (x - anchor.x) * 0.96;
          z = anchor.z + (z - anchor.z) * 0.96;
        }

        const bob = Math.sin(time * 1.1 + bobPhase) * 0.12;
        const roll = Math.sin(time * 0.85 + bobPhase) * 0.05;
        const pitch = Math.sin(time * 1.15 + bobPhase * 1.3) * 0.03;
        // ~35% of the hull below the waterline.
        group.position.set(x, -0.25 + bob, z);
        group.rotation.order = 'YXZ';
        group.rotation.y = heading;
        group.rotation.z = roll;
        group.rotation.x = pitch;

        for (let i = 0; i < sails.length; i++) {
          const sail = sails[i]!;
          const geo = sail.geometry as THREE.PlaneGeometry;
          const pos = geo.attributes.position!;
          const bind = sailBindZ[i]!;
          for (let v = 0; v < pos.count; v++) {
            const uy = pos.getY(v);
            const ux = pos.getX(v);
            const wave = Math.sin(time * 1.6 + uy * 2.2 + i) * 0.06 * (0.35 + Math.abs(ux));
            pos.setZ(v, bind[v]! + wave);
          }
          pos.needsUpdate = true;
        }
      },
      dispose() {
        for (const d of disposables) d.dispose();
      },
    };
  }
}
