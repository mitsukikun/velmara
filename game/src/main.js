// VELMARA — boot, the one game loop, the player controller, the camera and
// the screens (title, play, pause, wasted, busted, story complete).
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { STEP, PLAYER, CAR, GRID, SAVE_KEY } from './config.js';
import { createRandom, clamp, lerp, angleDiff, money } from './random.js';
import { createCity } from './city.js';
import { createPerson } from './characters.js';
import { Traffic, DriverCar, createCarMesh } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions, MISSION_LIST } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER_CAR, ACTION_WEAPON, ACTION_RELOAD } from './input.js';
import { saveGame, loadGame, clearSave } from './save.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const hud = createHUD();
const audio = createAudio();
const input = createInput(canvas);
const status = document.getElementById('status');

// --- Three.js setup ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 2000);
camera.position.set(0, 40, 90);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- World and systems ---
const rand = createRandom(seed);
const city = createCity(scene, rand);
const traffic = new Traffic(scene, city, rand);
const peds = new Pedestrians(scene, city, rand);
const combat = new Combat(scene, rand, {});
const missions = new Missions(city.places, {});

const playerMesh = createPerson({ rand, shirt: 0x2a9a8a, pants: 0x223344, hairColor: 0x3a2410, gun: true });
playerMesh.group.visible = false;
scene.add(playerMesh.group);

// Mission marker: a glowing beacon column + a floating diamond.
const markerGroup = new THREE.Group();
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
);
beacon.position.y = 30;
const diamond = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.4),
  new THREE.MeshBasicMaterial({ color: 0xffd23a }),
);
diamond.position.y = 7;
markerGroup.add(beacon, diamond);
markerGroup.visible = false;
scene.add(markerGroup);

// --- Game state ---
const G = {
  screen: 'title', // title | play | pause | wasted | busted | complete
  x: 0,
  z: 0,
  y: 0,
  vy: 0,
  angle: 0,
  camYaw: Math.PI,
  camPitch: 0.32,
  walkPhase: 0,
  health: PLAYER.maxHealth,
  cash: 0,
  inCar: false,
  car: null, // DriverCar
  carHealth: 100,
  wanted: 0,
  missionIndex: 0,
  storyDone: false,
  timeMin: 17 * 60 + 30,
  playTime: 0,
  autosaveTimer: 0,
  shake: 0,
  bustedTimer: 0,
  flashTimer: 0,
  muted: false,
  started: false,
};

let screenBeforePause = 'play';

function announce(message) {
  status.textContent = message;
}

function setScreen(name) {
  G.screen = name;
  document.getElementById('title-screen').style.display = name === 'title' ? 'flex' : 'none';
  document.getElementById('pause-menu').style.display = name === 'pause' ? 'flex' : 'none';
  document.getElementById('end-screen').style.display = (name === 'wasted' || name === 'busted' || name === 'complete') ? 'flex' : 'none';
  document.getElementById('hud').style.display = (name === 'play' || name === 'pause') ? 'block' : 'none';
  document.getElementById('crosshair').style.display = (name === 'play' && !G.inCar && combat.weapon === 'pistol') ? 'block' : 'none';
  if (name !== 'play') input.unlock();
}

// --- Hooks wiring (after systems exist, so closures see G) ---
missions.hooks.say = (lines) => hud.showDialog(lines);
missions.hooks.spawnGang = (n, x, z) => combat.spawnGang(n, x, z);
missions.hooks.addWanted = (n) => police.addWanted(n);
missions.hooks.onReward = (amount) => {
  G.cash += amount;
  audio.cash();
  hud.showToast(`Mission complete — ${money(amount)}`);
  saveNow();
};
missions.hooks.onComplete = (m) => {
  audio.mission();
  if (m.id === 'score') {
    G.storyDone = true;
    showEnd('complete');
  }
};
missions.hooks.onStart = (m) => {
  hud.showToast(`New mission: ${m.title}`);
};
missions.hooks.onPickup = (place) => {
  audio.pickup();
  hud.showToast(place === 'bank' ? 'Cash grabbed! Run!' : 'Package secured.');
};

combat.hooks.onShoot = () => audio.shot();
combat.hooks.onEnemyShot = () => audio.shot();
combat.hooks.onPunch = (hit) => { if (hit) audio.punch(); };
combat.hooks.onAmmoEmpty = () => hud.showToast('Out of ammo — press R to reload');
combat.hooks.onPlayerHit = (dmg) => damagePlayer(dmg);
combat.hooks.onKill = () => missions.onKill();
combat.hooks.onCopHit = (cop, dmg) => {
  cop.health -= dmg;
  if (cop.health <= 0) {
    police.removeCop(cop);
    police.crime('killCop');
    combat.dropPickup(cop.x, cop.z, 'cash');
  }
};

const police = new Police(scene, city, rand, {
  onWantedUp: (level) => {
    audio.wantedUp();
    hud.showToast(`Wanted level ${level} — the police are coming!`);
    announce(`Wanted level ${level}.`);
  },
  onWantedDown: (level) => {
    hud.showToast(level === 0 ? 'You lost the cops.' : `Wanted level down to ${level}`);
  },
  onPlayerHit: (dmg) => damagePlayer(dmg),
  onCopShot: () => audio.shot(),
  onRam: () => {
    audio.crash();
    G.shake = 0.5;
  },
});
combat.copTargets = [];
// Police foot cops are shootable: expose their groups to the raycaster.
const origSpawnCop = police.spawnCopNear.bind(police);
police.spawnCopNear = (x, z) => {
  const cop = origSpawnCop(x, z);
  combat.copTargets.push(cop);
  return cop;
};
const origRemoveCop = police.removeCop.bind(police);
police.removeCop = (cop) => {
  const i = combat.copTargets.indexOf(cop);
  if (i >= 0) combat.copTargets.splice(i, 1);
  origRemoveCop(cop);
};

function damagePlayer(dmg) {
  if (G.screen !== 'play') return;
  G.health -= dmg;
  G.flashTimer = 0.25;
  document.getElementById('damage-flash').style.opacity = '0.55';
  setTimeout(() => { document.getElementById('damage-flash').style.opacity = '0'; }, 120);
  audio.hit();
  if (G.health <= 0) {
    G.health = 0;
    showEnd('wasted');
  }
}

function showEnd(kind) {
  const title = document.getElementById('end-title');
  const text = document.getElementById('end-text');
  if (kind === 'wasted') {
    title.textContent = 'WASTED';
    text.textContent = `Kai went down in the streets of Velmara. Cash kept: ${money(G.cash * 0.9)}.`;
    G.cash = Math.floor(G.cash * 0.9);
    audio.fail();
  } else if (kind === 'busted') {
    title.textContent = 'BUSTED';
    text.textContent = `The Velmara PD finally caught up with Kai. Bail cost ${money(100)} — the rest is yours.`;
    G.cash = Math.max(0, G.cash - 100);
    audio.busted();
  } else {
    title.textContent = 'STORY COMPLETE';
    text.textContent = `Kai and Lena pulled the Big Score: ${money(G.cash)} in the pocket. Velmara is yours — free roam!`;
  }
  setScreen(kind);
  audio.engine(0);
  audio.siren(false);
  announce(title.textContent);
}

function respawn() {
  // Back on your feet at Velmara General, clean slate.
  exitCar(true);
  G.health = PLAYER.maxHealth;
  G.x = city.places.hospital.x;
  G.z = city.places.hospital.z;
  G.angle = 0;
  G.camYaw = G.angle;
  police.clearWanted();
  G.wanted = 0;
  playerMesh.group.visible = true;
  playerMesh.group.position.set(G.x, 0, G.z);
  setScreen('play');
  hud.showDialog(['You wake up at Velmara General. The city is still out there.']);
  saveNow();
}

function saveNow() {
  saveGame({
    missionIndex: missions.index,
    cash: G.cash,
    health: G.health,
    x: G.x,
    z: G.z,
    heading: G.angle,
    wanted: police.wanted,
    storyDone: missions.storyDone,
  });
}

function startGame(fromSave) {
  const save = fromSave ? loadGame() : null;
  G.started = true;
  G.health = PLAYER.maxHealth;
  G.cash = 0;
  G.wanted = 0;
  G.playTime = 0;
  police.clearWanted();
  exitCar(true);
  if (save) {
    G.cash = save.cash || 0;
    G.health = save.health || PLAYER.maxHealth;
    G.x = save.x ?? 6;
    G.z = save.z ?? 14;
    G.angle = save.heading || 0;
    missions.index = save.missionIndex || 0;
    missions.storyDone = !!save.storyDone;
  } else {
    G.x = 6;
    G.z = 14;
    G.angle = Math.PI;
    missions.index = 0;
    missions.storyDone = false;
    clearSave();
  }
  G.camYaw = G.angle;
  G.camPitch = 0.32;
  G.y = 0;
  G.vy = 0;
  playerMesh.group.visible = true;
  playerMesh.group.position.set(G.x, 0, G.z);
  missions.active = true;
  missions.phase = 0;
  missions.phaseStarted = false;
  missions.start(missions.index);
  audio.unlock();
  audio.startMusic();
  setScreen('play');
  announce('Playing Velmara. Follow the yellow marker.');
}

// --- Entering / exiting cars ---
function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  let kind = null;
  for (const p of traffic.parked) {
    if (p.taken) continue;
    const d = Math.hypot(p.x - G.x, p.z - G.z);
    if (d < bestD) { bestD = d; best = p; kind = 'parked'; }
  }
  for (const c of traffic.cars) {
    const d = Math.hypot(c.x - G.x, c.z - G.z);
    if (d < bestD) { bestD = d; best = c; kind = 'traffic'; }
  }
  return best ? { car: best, kind, dist: bestD } : null;
}

function enterCar() {
  const found = nearestCar(5);
  if (!found) return;
  if (found.kind === 'traffic') {
    traffic.stealNearest(G.x, G.z, 5);
    police.crime('stealCar');
    hud.showToast('Car stolen! The owner called it in.');
    peds.scare(G.x, G.z, 20);
  } else {
    traffic.takeParked(G.x, G.z, 5);
    hud.showToast('You got in the car.');
  }
  const mesh = found.car.mesh;
  G.car = new DriverCar(mesh, found.car.x, found.car.z, found.car.angle);
  G.inCar = true;
  playerMesh.group.visible = false;
  audio.click();
  setScreen('play');
}

function exitCar(silent) {
  if (!G.inCar || !G.car) return;
  const a = G.car.angle + Math.PI / 2;
  G.x = G.car.pos.x + Math.sin(a) * 3;
  G.z = G.car.pos.z + Math.cos(a) * 3;
  G.angle = G.car.angle;
  // The car stays where it was left, parked and re-enterable.
  traffic.parked.push({ mesh: G.car.mesh, x: G.car.pos.x, z: G.car.pos.z, angle: G.car.angle, taken: false });
  G.car = null;
  G.inCar = false;
  playerMesh.group.visible = true;
  playerMesh.group.position.set(G.x, 0, G.z);
  audio.engine(0);
  if (!silent) audio.click();
}

// --- Player update ---
function updatePlayer(dt, move, actions) {
  if (G.inCar) {
    const speed = G.car.update(dt, move, input.handbrake());
    // Building collision.
    const hitWall = city.resolveCircle(G.car.pos, CAR.radius, city.colliders);
    if (hitWall && Math.abs(G.car.speed) > 14) {
      damagePlayer(6);
      audio.crash();
      G.shake = 0.4;
      G.car.speed *= 0.35;
    } else if (hitWall) {
      G.car.speed *= 0.6;
    }
    // World bounds.
    G.car.pos.x = clamp(G.car.pos.x, -GRID.half - 20, GRID.half + 60);
    G.car.pos.z = clamp(G.car.pos.z, -GRID.half - 20, GRID.half + 20);
    // Traffic cars: bump.
    for (const c of traffic.cars) {
      const d = Math.hypot(c.x - G.car.pos.x, c.z - G.car.pos.z);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) / 2;
        const nx = (G.car.pos.x - c.x) / d;
        const nz = (G.car.pos.z - c.z) / d;
        G.car.pos.x += nx * push;
        G.car.pos.z += nz * push;
        if (Math.abs(G.car.speed) > 12) {
          audio.crash();
          G.shake = 0.3;
          G.car.speed *= 0.7;
        }
      }
    }
    // Police cars: ramming one is a crime.
    for (const pc of police.cars) {
      const d = Math.hypot(pc.x - G.car.pos.x, pc.z - G.car.pos.z);
      if (d < 4.2 && Math.abs(G.car.speed) > 10) {
        police.crime('ramPolice');
        G.car.speed *= 0.5;
      }
    }
    // Pedestrians: running one down is a crime.
    const hit = peds.knockDown(G.car.pos.x, G.car.pos.z, 3);
    if (hit && Math.abs(G.car.speed) > 4) {
      police.crime('hitPed');
      hud.showToast('You hit a pedestrian!');
      peds.scare(G.car.pos.x, G.car.pos.z, 25);
    }
    G.x = G.car.pos.x;
    G.z = G.car.pos.z;
    G.angle = G.car.angle;
    audio.engine(Math.abs(speed) / CAR.maxSpeed);
    if (actions & ACTION_ENTER_CAR) exitCar();
    return;
  }

  // On foot.
  const speed = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const f = move.forward;
  const s = move.strafe;
  // Camera-relative movement.
  const sin = Math.sin(G.camYaw);
  const cos = Math.cos(G.camYaw);
  let mx = sin * f + cos * s;
  let mz = cos * f - sin * s;
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx /= len;
    mz /= len;
    const targetAngle = Math.atan2(mx, mz);
    let diff = angleDiff(G.angle, targetAngle);
    G.angle += clamp(diff, -10 * dt, 10 * dt);
    G.x += mx * speed * dt;
    G.z += mz * speed * dt;
    G.walkPhase += dt * speed * 1.7;
  }
  // Jump + gravity.
  if ((actions & ACTION_CONFIRM) && G.y === 0 && f === 0 && s === 0) {
    // Space is also confirm; jump only when moving or always: allow always.
  }
  if (G.y === 0 && (actions & 32)) G.vy = PLAYER.jumpSpeed;
  G.vy -= PLAYER.gravity * dt;
  G.y += G.vy * dt;
  if (G.y <= 0) { G.y = 0; G.vy = 0; }
  // Collisions + bounds.
  const pos = { x: G.x, z: G.z };
  city.resolveCircle(pos, PLAYER.radius, city.colliders);
  G.x = clamp(pos.x, -GRID.half - 20, GRID.half + 62);
  G.z = clamp(pos.z, -GRID.half - 20, GRID.half + 20);
  playerMesh.group.position.set(G.x, G.y, G.z);
  playerMesh.group.rotation.y = G.angle;
  playerMesh.animate(G.walkPhase, len > 0.01, input.isAiming() && combat.weapon === 'pistol');
  playerMesh.gun.visible = combat.weapon === 'pistol';

  // Pickups.
  const pickup = combat.takePickup(G.x, G.z);
  if (pickup === 'health') {
    G.health = Math.min(PLAYER.maxHealth, G.health + 30);
    audio.pickup();
    hud.showToast('+30 health');
  } else if (pickup === 'cash') {
    const amount = 50 + Math.floor(rand() * 100);
    G.cash += amount;
    audio.cash();
    hud.showToast(`Found ${money(amount)}`);
  }

  // Shooting / punching with the mouse.
  if (input.isMouseDown() && G.screen === 'play') {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    if (combat.weapon === 'pistol') {
      const from = new THREE.Vector3(G.x, G.y + 1.6, G.z);
      combat.shoot(from, dir);
      if (combat.ammo >= 0) police.crime('shoot');
    } else {
      combat.punch(G.x, G.z, G.angle);
    }
  }
  if (actions & ACTION_ENTER_CAR) enterCar();
  if (actions & ACTION_WEAPON) {
    combat.weapon = combat.weapon === 'pistol' ? 'fists' : 'pistol';
    audio.click();
    hud.showToast(combat.weapon === 'pistol' ? 'Pistol ready' : 'Fists ready');
  }
  if (actions & ACTION_RELOAD) {
    if (combat.reload()) { audio.click(); hud.showToast('Reloaded'); }
  }
  audio.engine(0);
}

// --- Camera ---
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const mouse = input.takeMouse();
  if (input.isLocked()) {
    G.camYaw -= mouse.dx * 0.0028;
    G.camPitch = clamp(G.camPitch + mouse.dy * 0.0022, -0.15, 1.1);
  }
  let dist;
  let height;
  let lookY;
  let yaw = G.camYaw;
  if (G.inCar && G.car) {
    // Chase cam: drift behind the car's heading, mouse can orbit.
    const targetYaw = G.car.angle;
    const diff = angleDiff(yaw, targetYaw);
    if (Math.abs(G.car.speed) > 3) yaw += diff * Math.min(1, dt * 1.4);
    G.camYaw = yaw;
    dist = 10.5;
    height = 3.8;
    lookY = 1.6;
  } else {
    dist = input.isAiming() ? 4.5 : 6.8;
    height = 2.6;
    lookY = 1.7;
  }
  const cp = Math.cos(G.camPitch);
  const sp = Math.sin(G.camPitch);
  const ox = -Math.sin(yaw) * cp * dist;
  const oz = -Math.cos(yaw) * cp * dist;
  const oy = height + sp * dist;
  const tx = G.x;
  const tz = G.z;
  const desired = new THREE.Vector3(tx + ox, G.y + oy, tz + oz);
  camera.position.lerp(desired, 1 - Math.exp(-dt * 7));
  camTarget.lerp(new THREE.Vector3(tx, G.y + lookY, tz), 1 - Math.exp(-dt * 10));
  camera.lookAt(camTarget);
  if (G.shake > 0) {
    G.shake -= dt;
    camera.position.x += (Math.random() - 0.5) * G.shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * G.shake * 0.5;
  }
  // FOV: tighter when aiming.
  const targetFov = input.isAiming() && !G.inCar ? 52 : 68;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov = lerp(camera.fov, targetFov, dt * 8);
    camera.updateProjectionMatrix();
  }
}

// --- HUD state ---
function hudState() {
  const m = missions.current();
  return {
    health: G.health,
    cash: G.cash,
    wanted: police.wanted,
    evading: police.evading,
    missionTitle: missions.storyDone ? 'VELMARA — FREE ROAM' : (m ? `MISSION ${missions.index + 1}/${MISSION_LIST.length}: ${m.title.toUpperCase()}` : 'VELMARA'),
    objective: missions.objectiveText(),
    inCar: G.inCar,
    speed: G.inCar && G.car ? G.car.speed : 0,
    weapon: combat.weapon,
    ammo: combat.ammo,
    reserveAmmo: combat.reserveAmmo,
    x: G.x,
    z: G.z,
    heading: G.camYaw,
    time: G.playTime,
    marker: missions.markerPos(),
    avenues: city.avenues,
    traffic: traffic.cars,
    policeCars: police.cars,
    policeCops: police.cops,
    enemies: combat.enemies.filter((e) => !e.dead),
    hint: hintText(),
  };
}

function hintText() {
  if (G.screen !== 'play') return '';
  if (G.inCar) return 'W/S drive · A/D steer · Space handbrake · E exit car';
  const near = nearestCar(5);
  if (near) return near.kind === 'traffic' ? 'Press E to steal the car' : 'Press E to get in the car';
  if (combat.weapon === 'pistol') return 'Click to shoot · Right-click to aim · Q fists · R reload';
  return 'Q pistol · E enter car · Click to punch';
}

// --- Title screen camera orbit ---
let titleAngle = 0;
function updateTitleCamera(dt) {
  titleAngle += dt * 0.05;
  const r = 120;
  camera.position.set(Math.sin(titleAngle) * r, 55, Math.cos(titleAngle) * r);
  camera.lookAt(0, 8, 0);
}

// --- Main loop ---
let last = performance.now();
let accumulator = 0;

function stepWorld(dt) {
  const move = input.move();
  const actions = input.takeActions();
  if (G.screen === 'play') {
    G.playTime += dt;
    G.timeMin += dt * 0.5;
    updatePlayer(dt, move, actions);
    if (actions & ACTION_PAUSE) {
      screenBeforePause = 'play';
      setScreen('pause');
      audio.engine(0);
      audio.siren(false);
      return;
    }
    // Systems.
    const obstacles = [{ x: G.x, z: G.z }];
    for (const c of traffic.cars) obstacles.push({ x: c.x, z: c.z });
    for (const pc of police.cars) obstacles.push({ x: pc.x, z: pc.z });
    traffic.update(dt, obstacles);
    peds.update(dt, G.inCar && G.car && Math.abs(G.car.speed) > 8 ? { x: G.x, z: G.z } : null);
    police.update(dt, { x: G.x, z: G.z }, G.playTime);
    combat.update(dt, { x: G.x, z: G.z });
    combat.extraTargets = police.cops.map((c) => c.person.group);
    const completed = missions.update(dt, { x: G.x, z: G.z, inCar: G.inCar, wanted: police.wanted });
    if (completed && missions.storyDone) {
      // showEnd('complete') already called by the hook.
    }
    // Marker beacon.
    const marker = missions.markerPos();
    if (marker) {
      markerGroup.visible = true;
      markerGroup.position.set(marker.x, 0, marker.z);
      diamond.position.y = 7 + Math.sin(G.playTime * 2.5) * 0.8;
      diamond.rotation.y += dt * 2;
    } else {
      markerGroup.visible = false;
    }
    // Busted: a police car sitting on the on-foot player.
    if (!G.inCar) {
      let close = false;
      for (const pc of police.cars) {
        if (Math.hypot(pc.x - G.x, pc.z - G.z) < 3.2) { close = true; break; }
      }
      if (close && police.wanted > 0) {
        G.bustedTimer += dt;
        if (G.bustedTimer > 1.5) {
          G.bustedTimer = 0;
          showEnd('busted');
        }
      } else {
        G.bustedTimer = 0;
      }
    }
    // Siren + autosave.
    audio.siren(police.sirenOn && G.screen === 'play');
    G.autosaveTimer += dt;
    if (G.autosaveTimer > 30) {
      G.autosaveTimer = 0;
      saveNow();
    }
    updateCamera(dt);
    hud.update(hudState());
    const mins = Math.floor(G.timeMin) % (24 * 60);
    hud.setClock(String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'));
  } else if (G.screen === 'title') {
    traffic.update(dt, []);
    peds.update(dt, null);
    updateTitleCamera(dt);
  } else if (G.screen === 'pause') {
    if (actions & ACTION_PAUSE) setScreen('play');
  } else {
    // wasted / busted / complete: keep the world alive behind the overlay.
    traffic.update(dt, []);
    peds.update(dt, null);
    updateCamera(dt);
    if (actions & ACTION_CONFIRM) {
      if (G.screen === 'complete') setScreen('play');
      else respawn();
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  while (accumulator >= STEP) {
    stepWorld(STEP);
    accumulator -= STEP;
    if (G.screen === 'pause') break;
  }
  renderer.render(scene, camera);
}

// --- Buttons ---
function bindButtons() {
  const save = loadGame();
  document.getElementById('btn-continue').style.display = save ? 'block' : 'none';
  document.getElementById('btn-new').addEventListener('click', () => { audio.unlock(); audio.click(); startGame(false); });
  document.getElementById('btn-continue').addEventListener('click', () => { audio.unlock(); audio.click(); startGame(true); });
  document.getElementById('btn-how').addEventListener('click', () => {
    document.getElementById('howto').style.display = 'block';
    audio.click();
  });
  document.getElementById('btn-resume').addEventListener('click', () => { audio.click(); setScreen('play'); });
  document.getElementById('btn-save').addEventListener('click', () => { saveNow(); hud.showToast('Game saved.'); audio.click(); });
  document.getElementById('btn-quit-title').addEventListener('click', () => {
    audio.click();
    audio.engine(0);
    audio.siren(false);
    audio.stopMusic();
    setScreen('title');
    bindButtons();
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    audio.click();
    startGame(false);
  });
  document.getElementById('btn-end').addEventListener('click', () => {
    audio.click();
    if (G.screen === 'complete') setScreen('play');
    else respawn();
  });
  document.getElementById('btn-mute').addEventListener('click', () => {
    G.muted = !G.muted;
    audio.setMuted(G.muted);
    document.getElementById('btn-mute').textContent = G.muted ? 'Sound: Off' : 'Sound: On';
  });
  document.getElementById('btn-end-title').addEventListener('click', () => {
    audio.click();
    setScreen('title');
    bindButtons();
  });
}

// --- Screenshot staging ---
function stageShot(name) {
  audio.setMuted(true);
  // Build a living world, then place the player for the shot.
  startGame(false);
  setScreen('play');
  const place = city.places;
  if (name === 'start') {
    setScreen('title');
    titleAngle = 0.6;
    for (let i = 0; i < 240; i += 1) {
      traffic.update(STEP, []);
      peds.update(STEP, null);
      updateTitleCamera(STEP);
    }
    renderer.render(scene, camera);
    finishShot();
    return;
  }
  if (name === 'drive') {
    // In a car on the main avenue, mid-traffic, mission 1 running.
    const road = city.nearestRoadPoint(0, 0);
    const mesh = createCarMesh(0xc94a3a, false);
    scene.add(mesh.group);
    G.car = new DriverCar(mesh, 0, -144, 0);
    G.car.speed = 18;
    G.inCar = true;
    playerMesh.group.visible = false;
    G.x = 0;
    G.z = -144;
    G.camYaw = 0;
    G.camPitch = 0.3;
    for (let i = 0; i < 150; i += 1) {
      G.car.update(STEP, { forward: 1, strafe: 0 }, false);
      city.resolveCircle(G.car.pos, CAR.radius, city.colliders);
      G.x = G.car.pos.x;
      G.z = G.car.pos.z;
      traffic.update(STEP, [{ x: G.x, z: G.z }]);
      peds.update(STEP, null);
      updateCamera(STEP);
      G.playTime += STEP;
    }
    setScreen('play');
    hud.showDialog(MISSION_LIST[0].briefing);
    hud.update(hudState());
    renderer.render(scene, camera);
    finishShot();
    return;
  }
  if (name === 'chase') {
    // Wanted 3, police cars on the player's tail, mission 5 running.
    missions.index = 4;
    missions.phase = 0;
    missions.phaseStarted = false;
    missions.start(4);
    missions.timer = 60;
    const mesh = createCarMesh(0x3a6ac9, false);
    scene.add(mesh.group);
    G.car = new DriverCar(mesh, 72, 72, Math.PI / 2);
    G.car.speed = 24;
    G.inCar = true;
    playerMesh.group.visible = false;
    G.x = 72;
    G.z = 72;
    G.camYaw = Math.PI / 2;
    G.camPitch = 0.32;
    police.addWanted(3);
    for (let i = 0; i < 300; i += 1) {
      G.car.update(STEP, { forward: 1, strafe: Math.sin(i * 0.02) * 0.15 }, false);
      city.resolveCircle(G.car.pos, CAR.radius, city.colliders);
      G.x = G.car.pos.x;
      G.z = G.car.pos.z;
      police.update(STEP, { x: G.x, z: G.z }, i * STEP);
      traffic.update(STEP, [{ x: G.x, z: G.z }]);
      peds.update(STEP, null);
      updateCamera(STEP);
      G.playTime += STEP;
    }
    // Frame the chase: bring the two nearest police cars into view ahead of
    // the player, headlights toward the camera, lights flashing.
    const fwd = { x: Math.sin(G.car.angle), z: Math.cos(G.car.angle) };
    const side = { x: Math.cos(G.car.angle), z: -Math.sin(G.car.angle) };
    const spots = [
      { along: 22, across: -4.5 },
      { along: 32, across: 4.5 },
    ];
    police.cars.slice().sort((a, b) => {
      const da = Math.hypot(a.x - G.x, a.z - G.z);
      const db = Math.hypot(b.x - G.x, b.z - G.z);
      return da - db;
    }).slice(0, 2).forEach((pc, i) => {
      const s = spots[i];
      pc.x = G.x + fwd.x * s.along + side.x * s.across;
      pc.z = G.z + fwd.z * s.along + side.z * s.across;
      pc.angle = G.car.angle + Math.PI;
      pc.speed = 8;
      pc.mesh.group.position.set(pc.x, 0, pc.z);
      pc.mesh.group.rotation.y = pc.angle;
    });
    updateCamera(STEP);
    setScreen('play');
    hud.showDialog(MISSION_LIST[4].briefing);
    hud.update(hudState());
    renderer.render(scene, camera);
    finishShot();
    return;
  }
  // 'mission': on foot at the market, gang spawned, pistol out.
  missions.index = 3;
  missions.phase = 0;
  missions.phaseStarted = false;
  missions.start(3);
  G.x = place.market.x - 6;
  G.z = place.market.z + 8;
  G.angle = Math.atan2(place.market.x - G.x, place.market.z - G.z);
  G.camYaw = G.angle;
  G.camPitch = 0.25;
  combat.weapon = 'pistol';
  playerMesh.group.visible = true;
  playerMesh.group.position.set(G.x, 0, G.z);
  playerMesh.group.rotation.y = G.angle;
  combat.spawnGang(4, place.market.x, place.market.z);
  missions.phaseStarted = true;
  missions.killsNeeded = 4;
  missions.killsDone = 0;
  for (let i = 0; i < 120; i += 1) {
    combat.update(STEP, { x: G.x, z: G.z });
    peds.update(STEP, null);
    traffic.update(STEP, []);
    updateCamera(STEP);
    G.playTime += STEP;
  }
  const marker = missions.markerPos();
  if (marker) {
    markerGroup.visible = true;
    markerGroup.position.set(marker.x, 0, marker.z);
  }
  hud.showDialog(MISSION_LIST[3].briefing);
  hud.update(hudState());
  renderer.render(scene, camera);
  finishShot();
}

function finishShot() {
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// --- Boot ---
bindButtons();
setScreen('title');
announce('Velmara. An open-world crime game. Press Enter or click New Game to start.');
if (shot) {
  stageShot(shot);
} else {
  requestAnimationFrame(frame);
}

// Keyboard shortcuts that work outside the loop: Enter starts, M mutes.
window.addEventListener('keydown', (event) => {
  if (event.code === 'Enter' && G.screen === 'title') startGame(!!loadGame());
  if (event.code === 'KeyM' && !event.repeat) {
    G.muted = !G.muted;
    audio.setMuted(G.muted);
    const b = document.getElementById('btn-mute');
    if (b) b.textContent = G.muted ? 'Sound: Off' : 'Sound: On';
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.screen === 'play') setScreen('pause');
});
