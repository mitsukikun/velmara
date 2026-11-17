// Keyboard + mouse input. Held keys give a steering vector; one-shot presses
// (confirm, pause, enter car, attack, weapon swap) are queued as bit flags and
// taken once by the loop. Mouse movement orbits the camera while pointer-locked;
// clicking the canvas requests the lock (a click also counts as confirm).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_ATTACK = 8;
export const ACTION_WEAPON = 16;
export const ACTION_JUMP = 32;
export const ACTION_HANDBRAKE = 64;
export const ACTION_RELOAD = 128;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let rightDown = false;
  let locked = false;

  function isGameKey(code) {
    return FORWARD.has(code) || BACK.has(code) || LEFT.has(code) || RIGHT.has(code)
      || code === 'Space' || code === 'Enter' || code === 'Escape' || code === 'KeyP'
      || code === 'KeyE' || code === 'KeyF' || code === 'KeyQ' || code === 'KeyM'
      || code === 'ShiftLeft' || code === 'ShiftRight' || code === 'Digit1' || code === 'Digit2'
      || code === 'KeyR' || code === 'KeyH';
  }

  window.addEventListener('keydown', (event) => {
    if (!isGameKey(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space' || event.code === 'Enter') actions |= ACTION_CONFIRM;
    if (event.code === 'Escape' || event.code === 'KeyP') actions |= ACTION_PAUSE;
    if (event.code === 'KeyE' || event.code === 'KeyF') actions |= ACTION_ENTER_CAR;
    if (event.code === 'KeyQ') actions |= ACTION_WEAPON;
    if (event.code === 'Space') actions |= ACTION_JUMP;
    if (event.code === 'KeyR') actions |= ACTION_RELOAD;
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
    rightDown = false;
  });

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    mouseDX += event.movementX;
    mouseDY += event.movementY;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACTION_ATTACK;
      if (!locked) canvas.requestPointerLock?.();
    } else if (event.button === 2) {
      rightDown = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
    if (event.button === 2) rightDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** -1..1 forward/back and left/right from held keys. */
    move() {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      return { forward: f, strafe: s };
    },
    sprint() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    handbrake() { return keys.has('Space'); },
    honk() { return keys.has('KeyH'); },
    muteKey() { return keys.has('KeyM'); },
    isLocked() { return locked; },
    isMouseDown() { return mouseDown; },
    isAiming() { return rightDown; },
    /** Mouse movement since the last call, in pixels. */
    takeMouse() {
      const d = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return d;
    },
    /** One-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Release the pointer lock (menus). */
    unlock() {
      if (document.pointerLockElement) document.exitPointerLock?.();
    },
  };
}
