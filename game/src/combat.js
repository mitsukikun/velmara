// Combat: the player's fists and pistol, rival gang members who fight back,
// tracers, muzzle flashes and cash/health pickups dropped by the defeated.

import { COMBAT } from './config.js';
import { clamp, range } from './random.js';
import { createPerson, createMuzzleFlash } from './characters.js';

export class Combat {
  constructor(scene, rand, hooks) {
    this.scene = scene;
    this.rand = rand;
    this.hooks = hooks; // { onShoot(from, to), onKill(enemy), onPlayerHit(d), onAmmoEmpty() }
    this.raycaster = new THREE.Raycaster();
    this.enemies = [];
    this.tracers = [];
    this.pickups = [];
    this.weapon = 'pistol';
    this.ammo = COMBAT.pistolAmmo;
    this.reserveAmmo = 48;
    this.attackTimer = 0;
    this.flash = createMuzzleFlash();
    this.scene.add(this.flash);
    this.flashTimer = 0;
  }

  spawnGang(count, x, z) {
    const made = [];
    for (let i = 0; i < count; i += 1) {
      const ex = x + range(this.rand, -8, 8);
      const ez = z + range(this.rand, -8, 8);
      const person = createPerson({
        rand: this.rand,
        shirt: 0x8a2a2a,
        pants: 0x2a2a2e,
        hairColor: 0x111111,
        gun: true,
      });
      person.group.position.set(ex, 0, ez);
      this.scene.add(person.group);
      // Health bar: a thin red box floating over the head, scaled by hp.
      const barBg = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.12, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x330000 }),
      );
      barBg.position.set(ex, 2.35, ez);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.08, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xff3333 }),
      );
      bar.position.set(ex, 2.35, ez);
      this.scene.add(barBg);
      this.scene.add(bar);
      const enemy = {
        person,
        bar,
        barBg,
        x: ex,
        z: ez,
        angle: 0,
        phase: this.rand() * 10,
        health: COMBAT.enemyHealth,
        shootTimer: range(this.rand, 0.8, 2),
        dead: false,
        speed: range(this.rand, 4.5, 6.5),
      };
      this.enemies.push(enemy);
      made.push(enemy);
    }
    return made;
  }

  removeEnemy(enemy) {
    this.scene.remove(enemy.person.group);
    this.scene.remove(enemy.bar);
    this.scene.remove(enemy.barBg);
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
  }

  dropPickup(x, z, kind) {
    const color = kind === 'health' ? 0x3ad05a : 0xe8c84a;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.4 }),
    );
    mesh.position.set(x, 0.6, z);
    mesh.rotation.y = this.rand() * Math.PI;
    this.scene.add(mesh);
    const pickup = { mesh, x, z, kind, bob: this.rand() * 6 };
    this.pickups.push(pickup);
    return pickup;
  }

  takePickup(playerX, playerZ) {
    for (const p of [...this.pickups]) {
      if (Math.hypot(p.x - playerX, p.z - playerZ) < 1.6) {
        this.scene.remove(p.mesh);
        this.pickups.splice(this.pickups.indexOf(p), 1);
        return p.kind;
      }
    }
    return null;
  }

  /** Player shoots the pistol from `from` toward `dir` (unit vector). */
  shoot(from, dir) {
    if (this.attackTimer > 0) return false;
    if (this.ammo <= 0) {
      this.hooks.onAmmoEmpty?.();
      this.attackTimer = 0.3;
      return false;
    }
    this.attackTimer = COMBAT.pistolRate;
    this.ammo -= 1;
    this.raycaster.set(from, dir);
    this.raycaster.far = COMBAT.pistolRange;
    const targets = [];
    for (const e of this.enemies) {
      if (!e.dead) targets.push(e.person.group);
    }
    // Also allow shooting police foot cops: they register their groups here.
    for (const g of this.extraTargets || []) targets.push(g);
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = from.clone().add(dir.clone().multiplyScalar(COMBAT.pistolRange));
    if (hits.length > 0) {
      end = hits[0].point.clone();
      // Find which enemy owns the hit object.
      let hitObj = hits[0].object;
      while (hitObj && hitObj.parent && hitObj.parent !== this.scene) hitObj = hitObj.parent;
      const enemy = this.enemies.find((e) => e.person.group === hitObj);
      if (enemy) this.damageEnemy(enemy, COMBAT.pistolDamage);
      else {
        const cop = (this.copTargets || []).find((c) => c.person.group === hitObj);
        if (cop) this.hooks.onCopHit?.(cop, COMBAT.pistolDamage);
      }
    }
    this.spawnTracer(from, end);
    this.flash.position.copy(from).add(dir.clone().multiplyScalar(1.2));
    this.flash.visible = true;
    this.flashTimer = 0.06;
    this.hooks.onShoot?.(from, end);
    return true;
  }

  /** Melee swing: hits the nearest enemy within range in front of the player. */
  punch(playerX, playerZ, angle) {
    if (this.attackTimer > 0) return false;
    this.attackTimer = COMBAT.fistRate;
    let best = null;
    let bestD = COMBAT.fistRange;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - playerX, e.z - playerZ);
      if (d < bestD) {
        const a = Math.atan2(e.x - playerX, e.z - playerZ);
        let diff = a - angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < 1.1) { bestD = d; best = e; }
      }
    }
    if (best) this.damageEnemy(best, COMBAT.fistDamage);
    this.hooks.onPunch?.(!!best);
    return !!best;
  }

  damageEnemy(enemy, amount) {
    enemy.health -= amount;
    if (enemy.health <= 0 && !enemy.dead) {
      enemy.dead = true;
      enemy.person.setDead(true);
      this.scene.remove(enemy.bar);
      this.scene.remove(enemy.barBg);
      this.hooks.onKill?.(enemy);
      // Drop cash or health.
      this.dropPickup(enemy.x, enemy.z, this.rand() < 0.5 ? 'cash' : 'health');
    }
  }

  spawnTracer(from, to) {
    const len = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).lerp(to, 0.5);
    // Orient the cylinder along the shot: cylinder's axis is Y.
    const dir = to.clone().sub(from).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.09 });
  }

  reload() {
    if (this.reserveAmmo <= 0 || this.ammo >= COMBAT.pistolAmmo) return false;
    const need = COMBAT.pistolAmmo - this.ammo;
    const take = Math.min(need, this.reserveAmmo);
    this.ammo += take;
    this.reserveAmmo -= take;
    return true;
  }

  update(dt, player) {
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }
    for (const t of [...this.tracers]) {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.tracers.splice(this.tracers.indexOf(t), 1);
      }
    }
    // Pickups bob and spin.
    for (const p of this.pickups) {
      p.bob += dt * 3;
      p.mesh.position.y = 0.6 + Math.sin(p.bob) * 0.15;
      p.mesh.rotation.y += dt * 2;
    }
    // Enemies: close in and shoot inside range.
    for (const e of [...this.enemies]) {
      if (e.dead) continue;
      const dx = player.x - e.x;
      const dz = player.z - e.z;
      const dist = Math.hypot(dx, dz);
      e.angle = Math.atan2(dx, dz);
      if (dist > 6) {
        e.x += Math.sin(e.angle) * e.speed * dt;
        e.z += Math.cos(e.angle) * e.speed * dt;
        e.phase += dt * 9;
      }
      e.person.group.position.set(e.x, 0, e.z);
      e.person.group.rotation.y = e.angle;
      e.person.animate(e.phase, dist > 6, dist <= COMBAT.enemyShootRange);
      e.bar.position.set(e.x, 2.35, e.z);
      e.barBg.position.set(e.x, 2.35, e.z);
      e.bar.scale.x = clamp(e.health / COMBAT.enemyHealth, 0.05, 1);
      e.shootTimer -= dt;
      if (dist <= COMBAT.enemyShootRange && e.shootTimer <= 0) {
        e.shootTimer = range(this.rand, 1.0, 1.8);
        const hitChance = clamp(0.5 - dist / 60, 0.12, 0.45);
        this.hooks.onEnemyShot?.(e);
        if (this.rand() < hitChance) this.hooks.onPlayerHit?.(COMBAT.enemyDamage, 'gang');
      }
    }
  }
}
