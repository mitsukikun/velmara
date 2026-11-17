// Velmara: the city itself. A 7x7 grid of blocks around avenues, a beach and sea
// to the east, a park, a plaza, and named places the missions use. Buildings are
// boxes with canvas-painted facades; every building registers a collider so the
// player and cars cannot drive through it.

import { GRID, PALETTE } from './config.js';
import { pick, range, rangeInt } from './random.js';
import {
  buildingTexture, grassTexture, roadTexture, sandTexture, sidewalkTexture, waterTexture,
} from './textures.js';

const P = GRID.pitch;
const HALF = GRID.half;

function skyDome() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f7fc9');
  grad.addColorStop(0.45, '#7fb8e0');
  grad.addColorStop(0.72, '#ffd9a0');
  grad.addColorStop(1, '#ffb37a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -40;
  return mesh;
}

function sunDisc() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,244,200,1)');
  grad.addColorStop(0.35, 'rgba(255,220,140,0.9)');
  grad.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(220, 220, 1);
  sprite.position.set(-520, 260, -620);
  return sprite;
}

/** Push a circle (x,z,r) out of every building AABB it overlaps. Returns true on hit. */
export function resolveCircle(pos, radius, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const cx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const cz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const px = Math.min(pos.x - c.x0 + radius, c.x1 - pos.x + radius);
      const pz = Math.min(pos.z - c.z0 + radius, c.z1 - pos.z + radius);
      if (px < pz) pos.x = (pos.x - c.x0 < c.x1 - pos.x) ? c.x0 - radius : c.x1 + radius;
      else pos.z = (pos.z - c.z0 < c.z1 - pos.z) ? c.z0 - radius : c.z1 + radius;
    }
  }
  return hit;
}

export function createCity(scene, rand) {
  const group = new THREE.Group();
  const colliders = [];
  const avenues = [];
  for (let i = -3; i <= 3; i += 1) avenues.push(i * P);

  // --- Lights and sky ---
  scene.add(skyDome());
  scene.add(sunDisc());
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 900);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a6a4a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.9);
  sun.position.set(-180, 260, -120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  scene.add(sun.target);

  // --- Ground: grass base, sand beach, sea to the east ---
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x7a9a5a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 420, HALF * 2 + 120), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(60, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(70, HALF * 2 + 120),
    new THREE.MeshLambertMaterial({ map: sandTexture() }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(HALF + 34, 0, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(320, HALF * 2 + 120),
    new THREE.MeshLambertMaterial({ map: waterTexture() }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(HALF + 69 + 160, -0.4, 0);
  group.add(sea);

  // --- Roads: one plane per avenue, both directions ---
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadLen = HALF * 2 + 16;
  for (const a of avenues) {
    const r1 = new THREE.Mesh(new THREE.PlaneGeometry(GRID.road, roadLen), roadMat.clone());
    r1.material.map = roadTex.clone();
    r1.material.map.repeat.set(1, roadLen / 16);
    r1.material.map.needsUpdate = true;
    r1.rotation.x = -Math.PI / 2;
    r1.position.set(a, 0.02, 0);
    r1.receiveShadow = true;
    group.add(r1);
    const r2 = new THREE.Mesh(new THREE.PlaneGeometry(GRID.road, roadLen), roadMat.clone());
    r2.material.map = roadTex.clone();
    r2.material.map.repeat.set(1, roadLen / 16);
    r2.material.map.needsUpdate = true;
    r2.rotation.x = -Math.PI / 2;
    r2.rotation.z = Math.PI / 2;
    r2.position.set(0, 0.02, a);
    r2.receiveShadow = true;
    group.add(r2);
  }

  // --- Sidewalks: a slab under each block, slightly raised ---
  const walkTex = sidewalkTexture();
  const walkMat = new THREE.MeshLambertMaterial({ map: walkTex });
  for (let i = -3; i <= 3; i += 1) {
    for (let j = -3; j <= 3; j += 1) {
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(GRID.block + 4, GRID.block + 4), walkMat.clone());
      slab.material.map = walkTex.clone();
      slab.material.map.repeat.set(3, 3);
      slab.material.map.needsUpdate = true;
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(i * P, 0.04, j * P);
      slab.receiveShadow = true;
      group.add(slab);
    }
  }

  // --- Buildings ---
  const roofMat = new THREE.MeshLambertMaterial({ color: PALETTE.roof });
  const facadeMats = PALETTE.building.map((color) => {
    const hex = '#' + color.toString(16).padStart(6, '0');
    return new THREE.MeshLambertMaterial({ map: buildingTexture(hex, rand) });
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function addBuilding(cx, cz, w, d, h, matIndex, label) {
    const mesh = new THREE.Mesh(boxGeo, facadeMats[matIndex % facadeMats.length]);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w + 0.6, 0.5, d + 0.6);
    roof.position.set(cx, h + 0.25, cz);
    group.add(roof);
    colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
    if (label) {
      mesh.userData.label = label;
      mesh.userData.labelPos = { x: cx, y: h + 6, z: cz };
    }
    return mesh;
  }

  const special = {
    '0,0': 'plaza',
    '-2,-2': 'park',
    '2,-2': 'bank',
    '-2,2': 'motel',
    '2,2': 'garage',
    '3,3': 'hideout',
    '-3,-3': 'hospital',
  };

  for (let i = -3; i <= 3; i += 1) {
    for (let j = -3; j <= 3; j += 1) {
      const key = i + ',' + j;
      const kind = special[key];
      const cx = i * P;
      const cz = j * P;
      if (kind === 'plaza') continue; // open square, fountain added below
      if (kind === 'park') continue; // grass + trees added below
      if (kind === 'bank') {
        addBuilding(cx, cz, 34, 30, 46, 2, 'VELMARA TRUST');
        continue;
      }
      if (kind === 'motel') {
        addBuilding(cx - 8, cz, 22, 34, 10, 0, 'SUNSET MOTEL');
        addBuilding(cx + 14, cz + 6, 12, 12, 8, 4, null);
        continue;
      }
      if (kind === 'garage') {
        addBuilding(cx, cz - 6, 30, 20, 9, 6, "RICO'S GARAGE");
        continue;
      }
      if (kind === 'hideout') {
        addBuilding(cx, cz, 16, 14, 7, 5, 'HIDEOUT');
        continue;
      }
      if (kind === 'hospital') {
        addBuilding(cx, cz, 30, 26, 18, 3, 'VELMARA GENERAL');
        continue;
      }
      // Ordinary block: four buildings around a small courtyard, or one tower.
      if (rand() < 0.3) {
        addBuilding(cx, cz, range(rand, 26, 34), range(rand, 26, 34), range(rand, 28, 44), rangeInt(rand, 0, 7), null);
      } else {
        const offs = [[-13, -13], [13, -13], [-13, 13], [13, 13]];
        for (const [ox, oz] of offs) {
          if (rand() < 0.12) continue; // occasional gap / courtyard
          addBuilding(cx + ox, cz + oz, range(rand, 18, 22), range(rand, 18, 22), range(rand, 9, 30), rangeInt(rand, 0, 7), null);
        }
      }
    }
  }

  // --- Plaza: fountain + benches feel (fountain = cylinder + water disc) ---
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.2, 20),
    new THREE.MeshLambertMaterial({ color: 0xb8b0a4 }),
  );
  fountain.position.set(0, 0.6, 0);
  fountain.castShadow = true;
  group.add(fountain);
  const fwater = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.2, 0.3, 20),
    new THREE.MeshLambertMaterial({ color: 0x4aa8d8, emissive: 0x1a4a66 }),
  );
  fwater.position.set(0, 1.2, 0);
  group.add(fwater);
  colliders.push({ x0: -8, z0: -8, x1: 8, z1: 8 });

  // --- Park: grass + palms ---
  const parkGrass = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID.block, GRID.block),
    new THREE.MeshLambertMaterial({ map: grassTexture() }),
  );
  parkGrass.rotation.x = -Math.PI / 2;
  parkGrass.position.set(-2 * P, 0.06, -2 * P);
  parkGrass.receiveShadow = true;
  group.add(parkGrass);

  // --- Palms: trunk + crossed leaf planes, scattered on sidewalks and the park ---
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.trunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palm, side: THREE.DoubleSide });
  const palms = [];
  function addPalm(x, z) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    palm.add(trunk);
    for (let k = 0; k < 6; k += 1) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.6), leafMat);
      const a = (k / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.8, 7.2, Math.sin(a) * 1.8);
      leaf.rotation.set(0.5, -a + Math.PI / 2, 0);
      leaf.rotation.x = -0.55;
      leaf.rotation.y = a;
      palm.add(leaf);
    }
    palm.position.set(x, 0, z);
    group.add(palm);
    palms.push(palm);
  }
  for (let i = 0; i < 60; i += 1) {
    const bi = rangeInt(rand, -3, 3);
    const bj = rangeInt(rand, -3, 3);
    const edge = pick(rand, [0, 1, 2, 3]);
    const t = range(rand, -24, 24);
    let x = bi * P;
    let z = bj * P;
    if (edge === 0) { x += t; z += 27; } else if (edge === 1) { x += t; z -= 27; }
    else if (edge === 2) { x += 27; z += t; } else { x -= 27; z += t; }
    addPalm(x, z);
  }
  for (let i = 0; i < 8; i += 1) addPalm(-2 * P + range(rand, -22, 22), -2 * P + range(rand, -22, 22));

  // --- Street lamps at intersections ---
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xcc9900 });
  for (const a of avenues) {
    for (const b of avenues) {
      if ((a + b) % 144 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 8, 6), poleMat);
      pole.position.set(a + 9, 4, b + 9);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
      lamp.position.set(a + 9, 8.2, b + 9);
      group.add(lamp);
    }
  }

  // --- Docks: two piers reaching into the sea, east edge ---
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6a4a30 });
  const dockZ = [P, -P];
  for (const dz of dockZ) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 10), pierMat);
    pier.position.set(HALF + 60, 0.6, dz);
    pier.castShadow = true;
    group.add(pier);
    for (let k = 0; k < 3; k += 1) {
      const crate = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: pick(rand, [0x9a6a3a, 0x6a8a5a, 0x8a5a3a]) }));
      crate.scale.set(3, 3, 3);
      crate.position.set(HALF + 40 + k * 14, 2.1, dz + (k % 2 === 0 ? 2.5 : -2.5));
      crate.castShadow = true;
      group.add(crate);
      colliders.push({ x0: crate.position.x - 1.6, z0: crate.position.z - 1.6, x1: crate.position.x + 1.6, z1: crate.position.z + 1.6 });
    }
  }

  scene.add(group);

  const places = {
    plaza: { x: 0, z: 0 },
    park: { x: -2 * P, z: -2 * P },
    bank: { x: 2 * P, z: -2 * P + 22 },
    motel: { x: -2 * P, z: 2 * P },
    garage: { x: 2 * P, z: 2 * P + 16 },
    hideout: { x: 3 * P, z: 3 * P + 12 },
    hospital: { x: -3 * P, z: -3 * P + 20 },
    docks: { x: HALF + 52, z: P },
    market: { x: -1 * P, z: 1 * P + 10 },
    beach: { x: HALF + 20, z: 0 },
  };

  function isOnRoad(x, z) {
    for (const a of avenues) {
      if (Math.abs(x - a) < GRID.road / 2 + 1 || Math.abs(z - a) < GRID.road / 2 + 1) return true;
    }
    return false;
  }

  function nearestRoadPoint(x, z) {
    let bestA = avenues[0];
    let bestD = Infinity;
    for (const a of avenues) {
      const d = Math.min(Math.abs(x - a), Math.abs(z - a));
      if (d < bestD) { bestD = d; bestA = a; }
    }
    // Snap to the closer of the two avenue families.
    let dx = Infinity;
    let dz = Infinity;
    let ax = 0;
    let az = 0;
    for (const a of avenues) {
      if (Math.abs(x - a) < dx) { dx = Math.abs(x - a); ax = a; }
      if (Math.abs(z - a) < dz) { dz = Math.abs(z - a); az = a; }
    }
    if (dx < dz) return { x: ax, z: Math.max(-HALF, Math.min(HALF, z)) };
    return { x: Math.max(-HALF, Math.min(HALF, x)), z: az };
  }

  return {
    group,
    colliders,
    avenues,
    places,
    bounds: HALF,
    palms,
    isOnRoad,
    nearestRoadPoint,
    resolveCircle: (pos, r) => resolveCircle(pos, r, colliders),
  };
}
