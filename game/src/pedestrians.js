// Pedestrians: they stroll the sidewalks around the blocks, cross at corners,
// and run away from gunfire, speeding cars and police chases. Knocking one down
// with a car is a crime.

import { PED, GRID } from './config.js';
import { clamp, pick, range } from './random.js';
import { createPerson } from './characters.js';

const P = GRID.pitch;

export class Pedestrians {
  constructor(scene, city, rand) {
    this.scene = scene;
    this.city = city;
    this.rand = rand;
    this.list = [];
    for (let i = 0; i < PED.count; i += 1) this.spawnOne(true);
  }

  spawnOne(anywhere) {
    const bi = Math.floor(this.rand() * 7) - 3;
    const bj = Math.floor(this.rand() * 7) - 3;
    const edge = Math.floor(this.rand() * 4);
    const t = range(this.rand, -26, 26);
    let x = bi * P;
    let z = bj * P;
    if (edge === 0) z += 29; else if (edge === 1) z -= 29;
    else if (edge === 2) x += 29; else x -= 29;
    x += (edge < 2 ? t * 0.2 : 0);
    z += (edge >= 2 ? t * 0.2 : 0);
    const person = createPerson({ rand: this.rand });
    person.group.position.set(x, 0, z);
    this.scene.add(person.group);
    const ped = {
      person,
      x,
      z,
      angle: this.rand() * Math.PI * 2,
      speed: PED.walkSpeed * range(this.rand, 0.7, 1.3),
      phase: this.rand() * 10,
      flee: 0,
      down: false,
      downTimer: 0,
      target: null,
    };
    this.list.push(ped);
    return ped;
  }

  /** Pedestrians near (x,z) run away from it for a few seconds. */
  scare(x, z, radius) {
    for (const p of this.list) {
      if (p.down) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.flee = 4;
        p.angle = Math.atan2(p.x - x, p.z - z);
      }
    }
  }

  update(dt, danger) {
    for (const p of this.list) {
      if (p.down) {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          p.down = false;
          p.person.setDead(false);
          p.flee = 3;
        }
        continue;
      }
      if (p.flee > 0) p.flee -= dt;
      // Fleeing danger, or the danger point itself is close: run away.
      let speed = p.speed;
      if (danger) {
        const d = Math.hypot(p.x - danger.x, p.z - danger.z);
        if (d < 14) {
          p.flee = 2;
          p.angle = Math.atan2(p.x - danger.x, p.z - danger.z);
        }
      }
      if (p.flee > 0) speed = PED.runSpeed;
      // Stroll: pick a new direction at random now and then.
      if (this.rand() < dt * 0.08 && p.flee <= 0) {
        p.angle += pick(this.rand, [-Math.PI / 2, Math.PI / 2, Math.PI, 0]);
      }
      p.x += Math.sin(p.angle) * speed * dt;
      p.z += Math.cos(p.angle) * speed * dt;
      // Keep inside the city and off the roads' centres: steer back in.
      const b = GRID.half - 4;
      if (p.x < -b || p.x > b || p.z < -b || p.z > b) p.angle += Math.PI;
      p.x = clamp(p.x, -b, b);
      p.z = clamp(p.z, -b, b);
      p.phase += dt * speed * 1.6;
      p.person.group.position.set(p.x, 0, p.z);
      p.person.group.rotation.y = p.angle;
      p.person.animate(p.phase, speed > 0.1, false);
    }
  }

  /** Knock a pedestrian down (car hit). Returns the ped, or null. */
  knockDown(x, z, radius) {
    for (const p of this.list) {
      if (p.down) continue;
      if (Math.hypot(p.x - x, p.z - z) < radius) {
        p.down = true;
        p.downTimer = 6;
        p.person.setDead(true);
        return p;
      }
    }
    return null;
  }

  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.list) {
      if (p.down) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}
