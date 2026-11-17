// Cars: a low-poly mesh factory, arcade driving physics for the player's car,
// and traffic that loops around city blocks. Police cars are the same mesh with
// a light bar.

import { CAR, GRID } from './config.js';
import { clamp, pick, range } from './random.js';

const CAR_COLORS = [0xc94a3a, 0x3a6ac9, 0xe8c84a, 0x4a9a5a, 0xdddddd, 0x8a5ac9, 0x2a2a2e, 0xe07a3a, 0x3a9a9a];
const P = GRID.pitch;

function box(w, h, d, color, opts) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, ...(opts || {}) }),
  );
  mesh.castShadow = true;
  return mesh;
}

/** A car ~4.4 long, 2 wide, facing +Z when angle = 0. */
export function createCarMesh(color, police) {
  const group = new THREE.Group();
  const body = box(2, 0.7, 4.4, color ?? 0xc94a3a);
  body.position.y = 0.55;
  group.add(body);
  const cabin = box(1.7, 0.65, 2.2, 0x1a2a3a, { emissive: 0x0a1a2a });
  cabin.position.set(0, 1.15, -0.3);
  group.add(cabin);
  const stripe = box(2.02, 0.12, 4.42, 0x111111);
  stripe.position.y = 0.72;
  group.add(stripe);
  // Headlights and taillights.
  const hl = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xaa8800 });
  const tl = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x660000 });
  for (const sx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), hl);
    h.position.set(sx, 0.6, 2.21);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), tl);
    t.position.set(sx, 0.6, -2.21);
    group.add(t);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  let lightBar = null;
  let lightL = null;
  let lightR = null;
  if (police) {
    lightBar = box(1.4, 0.22, 0.5, 0x222222);
    lightBar.position.set(0, 1.55, -0.3);
    group.add(lightBar);
    lightL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.52), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000 }));
    lightL.position.set(-0.35, 1.68, -0.3);
    group.add(lightL);
    lightR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.52), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000ff }));
    lightR.position.set(0.35, 1.68, -0.3);
    group.add(lightR);
    // Police livery: white doors.
    const door = box(2.04, 0.5, 1.6, 0xeeeeee);
    door.position.set(0, 0.6, 0);
    group.add(door);
  }
  return {
    group,
    wheels,
    setWheelSpin(angle) {
      for (const w of wheels) w.rotation.x = angle;
    },
    setSteer(angle) {
      wheels[0].rotation.y = angle;
      wheels[1].rotation.y = angle;
    },
    flashLights(phase) {
      if (!lightL || !lightR) return;
      const on = Math.sin(phase * 10) > 0;
      lightL.material.emissive.setHex(on ? 0xff0000 : 0x330000);
      lightR.material.emissive.setHex(on ? 0x000033 : 0x0000ff);
    },
  };
}

/** Arcade car physics: position, heading, speed; collisions resolved by caller. */
export class DriverCar {
  constructor(mesh, x, z, angle) {
    this.mesh = mesh;
    this.pos = { x, z };
    this.angle = angle || 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.wheelSpin = 0;
  }

  update(dt, input, handbrake) {
    const accelIn = input.forward;
    const steerIn = input.strafe;
    const targetSteer = steerIn * CAR.steerMax * (this.speed >= 0 ? 1 : -1);
    const steerRate = CAR.steerSpeed * (1 - Math.min(0.6, Math.abs(this.speed) / CAR.maxSpeed));
    this.steer += clamp(targetSteer - this.steer, -steerRate * dt, steerRate * dt);

    if (accelIn > 0) this.speed += CAR.accel * dt;
    else if (accelIn < 0) {
      if (this.speed > 0.5) this.speed -= CAR.brake * dt;
      else this.speed -= CAR.reverseAccel * dt;
    }
    if (handbrake) this.speed -= Math.sign(this.speed) * CAR.brake * 1.4 * dt;
    // Drag + rolling resistance.
    this.speed -= this.speed * CAR.drag * dt;
    if (Math.abs(this.speed) < 0.15 && accelIn === 0) this.speed = 0;
    this.speed = clamp(this.speed, -CAR.maxReverse, CAR.maxSpeed);

    const turn = this.steer * (this.speed / 4.2) * dt * (this.speed >= 0 ? 1 : -1);
    this.angle += turn * (handbrake ? 1.6 : 1);
    const fx = Math.sin(this.angle);
    const fz = Math.cos(this.angle);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;

    this.mesh.group.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.group.rotation.y = this.angle;
    this.wheelSpin += (this.speed / 0.42) * dt;
    this.mesh.setWheelSpin(this.wheelSpin);
    this.mesh.setSteer(this.steer * 0.8);
    return Math.abs(this.speed);
  }
}

/**
 * Traffic: cars loop around city blocks on the road lanes. Each car owns a
 * rectangular loop around one block; it slows for the car ahead of it.
 */
export class Traffic {
  constructor(scene, city, rand) {
    this.scene = scene;
    this.city = city;
    this.rand = rand;
    this.cars = [];
    this.parked = [];
    this.spawn();
    this.spawnParked();
  }

  loopForBlock(bi, bj, dir) {
    const cx = bi * P;
    const cz = bj * P;
    const lane = GRID.road / 2 - 2.6; // lane offset from the road centre
    const r = P / 2 + lane;
    // Rectangle corners, clockwise or counter-clockwise.
    const pts = [
      { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r },
      { x: cx + r, z: cz + r }, { x: cx - r, z: cz + r },
    ];
    if (dir < 0) pts.reverse();
    return pts;
  }

  spawn() {
    for (let i = 0; i < CAR.trafficCount; i += 1) {
      const bi = Math.floor(this.rand() * 7) - 3;
      const bj = Math.floor(this.rand() * 7) - 3;
      const dir = this.rand() < 0.5 ? 1 : -1;
      const loop = this.loopForBlock(bi, bj, dir);
      const mesh = createCarMesh(pick(this.rand, CAR_COLORS), false);
      this.scene.add(mesh.group);
      const seg = Math.floor(this.rand() * 4);
      const t = this.rand();
      const a = loop[seg];
      const b = loop[(seg + 1) % 4];
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      this.cars.push({
        mesh,
        loop,
        seg,
        t,
        x,
        z,
        angle: Math.atan2(b.x - a.x, b.z - a.z),
        speed: range(this.rand, 7, 11),
        stopped: false,
      });
    }
  }

  spawnParked() {
    for (let i = 0; i < CAR.parkedCount; i += 1) {
      const a = pick(this.rand, this.city.avenues);
      const along = range(this.rand, -GRID.half + 20, GRID.half - 20);
      const side = this.rand() < 0.5 ? 1 : -1;
      const horizontal = this.rand() < 0.5;
      const x = horizontal ? along : a + side * 5.2;
      const z = horizontal ? a + side * 5.2 : along;
      const mesh = createCarMesh(pick(this.rand, CAR_COLORS), false);
      mesh.group.position.set(x, 0, z);
      mesh.group.rotation.y = horizontal ? 0 : Math.PI / 2;
      this.scene.add(mesh.group);
      this.parked.push({ mesh, x, z, angle: mesh.group.rotation.y, taken: false });
    }
  }

  /** Remove a traffic car from the road (it was stolen) and return its state. */
  stealNearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return null;
    this.cars.splice(this.cars.indexOf(best), 1);
    return best;
  }

  /** Remove a parked car (taken by the player). */
  takeParked(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.parked) {
      if (p.taken) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best) return null;
    best.taken = true;
    return best;
  }

  update(dt, obstacles) {
    for (const c of this.cars) {
      // Slow down if something is right ahead.
      let want = c.speed;
      const aheadX = c.x + Math.sin(c.angle) * 9;
      const aheadZ = c.z + Math.cos(c.angle) * 9;
      for (const o of obstacles) {
        if (Math.hypot(o.x - aheadX, o.z - aheadZ) < 4.5) { want = 0; break; }
      }
      c.speed += clamp(want - c.speed, -14 * dt, 8 * dt);
      const a = c.loop[c.seg];
      const b = c.loop[(c.seg + 1) % 4];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      c.t += (c.speed * dt) / segLen;
      if (c.t >= 1) {
        c.t = 0;
        c.seg = (c.seg + 1) % 4;
      }
      const na = c.loop[c.seg];
      const nb = c.loop[(c.seg + 1) % 4];
      c.x = na.x + (nb.x - na.x) * c.t;
      c.z = na.z + (nb.z - na.z) * c.t;
      c.angle = Math.atan2(nb.x - na.x, nb.z - na.z);
      c.mesh.group.position.set(c.x, 0, c.z);
      c.mesh.group.rotation.y = c.angle;
      c.mesh.setWheelSpin(c.t * 40);
    }
  }
}
