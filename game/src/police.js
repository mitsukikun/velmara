// The wanted system: stars 0-5, police cars that chase and ram, and foot cops
// who get out and shoot at higher levels. Wanted decays when the player stays
// clean and out of sight; a chase is "evading" while no cop is close.

import { POLICE, WANTED_CRIME } from './config.js';
import { clamp, range } from './random.js';
import { createCarMesh } from './vehicles.js';
import { createPerson } from './characters.js';

export class Police {
  constructor(scene, city, rand, hooks) {
    this.scene = scene;
    this.city = city;
    this.rand = rand;
    this.hooks = hooks; // { onPlayerHit(damage, from), onBusted() }
    this.wanted = 0;
    this.cars = [];
    this.cops = [];
    this.cleanTimer = 0;
    this.decayTimer = 0;
    this.evading = false;
    this.sirenOn = false;
  }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    if (this.wanted > before) {
      this.cleanTimer = 0;
      this.hooks.onWantedUp?.(this.wanted, reason);
    }
  }

  clearWanted() {
    this.wanted = 0;
    this.cleanTimer = 0;
  }

  crime(name) {
    const n = WANTED_CRIME[name] || 1;
    this.addWanted(n, name);
  }

  /** How many police cars the current wanted level should field. */
  wantedCars() {
    if (this.wanted === 0) return 0;
    return Math.min(POLICE.maxCars, 1 + this.wanted);
  }

  wantedCops() {
    if (this.wanted < 3) return 0;
    return Math.min(POLICE.copCount, this.wanted - 1);
  }

  spawnCarNear(x, z) {
    const angle = this.rand() * Math.PI * 2;
    const dist = range(this.rand, 55, 80);
    let sx = x + Math.sin(angle) * dist;
    let sz = z + Math.cos(angle) * dist;
    const road = this.city.nearestRoadPoint(sx, sz);
    sx = road.x;
    sz = road.z;
    const mesh = createCarMesh(0x1a1a22, true);
    mesh.group.position.set(sx, 0, sz);
    this.scene.add(mesh.group);
    const car = {
      mesh,
      x: sx,
      z: sz,
      angle: Math.atan2(x - sx, z - sz),
      speed: 0,
      ramCooldown: 0,
      stuckTimer: 0,
    };
    this.cars.push(car);
    return car;
  }

  spawnCopNear(x, z) {
    const angle = this.rand() * Math.PI * 2;
    const dist = range(this.rand, 18, 30);
    const sx = x + Math.sin(angle) * dist;
    const sz = z + Math.cos(angle) * dist;
    const person = createPerson({ rand: this.rand, shirt: 0x1a2a4a, pants: 0x1a1a22, cap: true, vest: true, gun: true });
    person.group.position.set(sx, 0, sz);
    this.scene.add(person.group);
    const cop = {
      person,
      x: sx,
      z: sz,
      angle: 0,
      phase: 0,
      shootTimer: range(this.rand, 0.5, 1.5),
      health: 100,
    };
    this.cops.push(cop);
    return cop;
  }

  removeCar(car) {
    this.scene.remove(car.mesh.group);
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  removeCop(cop) {
    this.scene.remove(cop.person.group);
    this.cops.splice(this.cops.indexOf(cop), 1);
  }

  update(dt, player, time) {
    // Keep the right number of units on the street.
    while (this.cars.length < this.wantedCars()) this.spawnCarNear(player.x, player.z);
    while (this.cars.length > this.wantedCars()) this.removeCar(this.cars[this.cars.length - 1]);
    while (this.cops.length < this.wantedCops()) this.spawnCopNear(player.x, player.z);
    while (this.cops.length > this.wantedCops()) this.removeCop(this.cops[this.cops.length - 1]);

    // Chase cars: steer toward the player, ram on contact.
    let nearestCop = Infinity;
    for (const car of this.cars) {
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      nearestCop = Math.min(nearestCop, dist);
      const wantAngle = Math.atan2(dx, dz);
      let diff = wantAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
      const targetSpeed = dist > 90 ? POLICE.carSpeed + 6 : POLICE.carSpeed;
      car.speed += clamp(targetSpeed - car.speed, -20 * dt, 12 * dt);
      car.x += Math.sin(car.angle) * car.speed * dt;
      car.z += Math.cos(car.angle) * car.speed * dt;
      car.mesh.group.position.set(car.x, 0, car.z);
      car.mesh.group.rotation.y = car.angle;
      car.mesh.setWheelSpin(car.speed * dt * 2.4);
      car.mesh.flashLights(time);
      // Building collision: slide along walls, slow down.
      const before = { x: car.x, z: car.z };
      if (this.city.resolveCircle(car, 2.2)) {
        car.speed *= 0.5;
        car.angle += (this.rand() < 0.5 ? 1 : -1) * 0.6;
      }
      car.ramCooldown -= dt;
      if (dist < 3.4 && car.ramCooldown <= 0) {
        car.ramCooldown = 1.2;
        this.hooks.onPlayerHit?.(POLICE.ramDamage, 'police car');
        this.hooks.onRam?.(before);
      }
      // Teleport back if hopelessly far or stuck off-road.
      if (dist > 220) {
        const road = this.city.nearestRoadPoint(player.x + range(this.rand, -60, 60), player.z + range(this.rand, -60, 60));
        car.x = road.x;
        car.z = road.z;
        car.speed = 10;
      }
    }

    // Foot cops: run at the player and shoot inside range.
    for (const cop of [...this.cops]) {
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      nearestCop = Math.min(nearestCop, dist);
      cop.angle = Math.atan2(dx, dz);
      if (dist > 8) {
        cop.x += Math.sin(cop.angle) * POLICE.copSpeed * dt;
        cop.z += Math.cos(cop.angle) * POLICE.copSpeed * dt;
        cop.phase += dt * 10;
      }
      cop.person.group.position.set(cop.x, 0, cop.z);
      cop.person.group.rotation.y = cop.angle;
      cop.person.animate(cop.phase, dist > 8, dist <= POLICE.copShootRange);
      cop.shootTimer -= dt;
      if (dist <= POLICE.copShootRange && cop.shootTimer <= 0) {
        cop.shootTimer = range(this.rand, 0.9, 1.6);
        const hitChance = clamp(0.55 - dist / 60, 0.15, 0.5);
        this.hooks.onCopShot?.(cop);
        if (this.rand() < hitChance) this.hooks.onPlayerHit?.(POLICE.copDamage, 'police');
      }
    }

    // Wanted decay: clean for a while and out of sight.
    this.evading = nearestCop > 55 && this.wanted > 0;
    if (this.wanted > 0) {
      this.cleanTimer += dt;
      if (this.cleanTimer > POLICE.decayDelay && this.evading) {
        this.decayTimer += dt;
        if (this.decayTimer > POLICE.decayInterval) {
          this.decayTimer = 0;
          this.wanted -= 1;
          this.hooks.onWantedDown?.(this.wanted);
        }
      } else {
        this.decayTimer = 0;
      }
    } else {
      this.cleanTimer = 0;
    }
    this.sirenOn = this.cars.length > 0;
  }
}
