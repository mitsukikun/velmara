// Low-poly people, built from boxes: a torso, head, hair, arms and legs that
// swing while walking. One factory makes the player, pedestrians, gang members
// and cops — only the colours and accessories change.

const SKIN = [0xe8b98a, 0xc98d5f, 0x8a5a3a, 0xf0c8a0];
const SHIRTS = [0x3a6ac9, 0xc94a3a, 0x4a9a5a, 0xe8c84a, 0x8a5ac9, 0xdddddd, 0x2a2a2e];
const PANTS = [0x2a3a5a, 0x3a3a3a, 0x5a4a3a, 0x223322];

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.castShadow = true;
  return mesh;
}

/**
 * A person ~1.8 units tall, facing +Z when angle = 0.
 * Returns { group, parts, animate(phase, moving), setDead(bool) }.
 */
export function createPerson(opts) {
  const o = opts || {};
  const rand = o.rand || Math.random;
  const skin = o.skin ?? SKIN[Math.floor(rand() * SKIN.length)];
  const shirt = o.shirt ?? SHIRTS[Math.floor(rand() * SHIRTS.length)];
  const pants = o.pants ?? PANTS[Math.floor(rand() * PANTS.length)];
  const group = new THREE.Group();

  const legL = box(0.22, 0.75, 0.24, pants);
  legL.geometry.translate(0, -0.375, 0);
  legL.position.set(-0.16, 0.78, 0);
  const legR = box(0.22, 0.75, 0.24, pants);
  legR.geometry.translate(0, -0.375, 0);
  legR.position.set(0.16, 0.78, 0);
  const torso = box(0.62, 0.7, 0.34, shirt);
  torso.position.y = 1.13;
  const armL = box(0.18, 0.62, 0.2, shirt);
  armL.geometry.translate(0, -0.31, 0);
  armL.position.set(-0.42, 1.42, 0);
  const armR = box(0.18, 0.62, 0.2, shirt);
  armR.geometry.translate(0, -0.31, 0);
  armR.position.set(0.42, 1.42, 0);
  const head = box(0.34, 0.34, 0.32, skin);
  head.position.y = 1.68;
  const hair = box(0.38, 0.14, 0.36, o.hairColor ?? 0x2a1a10);
  hair.position.y = 1.88;
  group.add(legL, legR, torso, armL, armR, head, hair);

  // Accessories: a cap for cops, a bandana tint for gang members, a jacket for the player.
  if (o.cap) {
    const cap = box(0.4, 0.1, 0.38, 0x1a2a4a);
    cap.position.y = 1.95;
    group.add(cap);
    const brim = box(0.4, 0.05, 0.2, 0x1a2a4a);
    brim.position.set(0, 1.92, 0.26);
    group.add(brim);
  }
  if (o.vest) {
    const vest = box(0.66, 0.5, 0.38, 0x1a1a22);
    vest.position.y = 1.15;
    group.add(vest);
  }
  let gun = null;
  if (o.gun) {
    gun = box(0.08, 0.1, 0.42, 0x1a1a1a);
    gun.position.set(0.42, 1.12, 0.22);
    group.add(gun);
  }

  let dead = false;
  return {
    group,
    parts: { legL, legR, armL, armR, torso, head },
    gun,
    animate(phase, moving, aiming) {
      if (dead) return;
      const swing = moving ? Math.sin(phase) * 0.7 : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      if (aiming) {
        armR.rotation.x = -Math.PI / 2 + 0.15;
        armL.rotation.x = -Math.PI / 2 + 0.3;
      } else {
        armL.rotation.x = -swing * 0.8;
        armR.rotation.x = swing * 0.8;
      }
      group.position.y = moving ? Math.abs(Math.sin(phase)) * 0.06 : 0;
    },
    setDead(value) {
      dead = value;
      group.rotation.x = value ? -Math.PI / 2 : 0;
      group.position.y = value ? 0.25 : 0;
    },
    isDead() { return dead; },
  };
}

/** A short-lived muzzle flash: a bright sprite that fades in ~60 ms. */
export function createMuzzleFlash() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,220,1)');
  grad.addColorStop(0.4, 'rgba(255,200,80,0.9)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 1.6, 1);
  sprite.visible = false;
  return sprite;
}
