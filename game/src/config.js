// VELMARA — tuning numbers and palette, all in one place.
// The city is a grid: blocks of BLOCK size separated by ROAD-wide streets.
// Pitch P = BLOCK + ROAD. Avenues run at x = i*P and z = i*P for i in -3..3.

export const STEP = 1 / 60;

export const GRID = {
  blocks: 3, // blocks from -3..3 each way
  block: 56,
  road: 16,
  pitch: 72,
  // Half-size of the playable square (outer road edge + margin).
  half: 3 * 72 + 16,
};

export const PLAYER = {
  walkSpeed: 6.5,
  sprintSpeed: 11,
  accel: 40,
  jumpSpeed: 8.5,
  gravity: 24,
  radius: 0.7,
  height: 1.8,
  maxHealth: 100,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 14,
  maxSpeed: 34,
  maxReverse: 10,
  steerMax: 0.55,
  steerSpeed: 2.4,
  drag: 0.6,
  grip: 6,
  radius: 2.3,
  trafficSpeed: 9,
  trafficCount: 14,
  parkedCount: 9,
};

export const POLICE = {
  maxCars: 6,
  carSpeed: 30,
  ramDamage: 8,
  copCount: 4,
  copSpeed: 7.5,
  copShootRange: 26,
  copDamage: 6,
  decayDelay: 25,
  decayInterval: 8,
};

export const PED = {
  count: 26,
  walkSpeed: 2.2,
  runSpeed: 6,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 90,
  pistolRate: 0.22,
  pistolAmmo: 12,
  fistDamage: 18,
  fistRange: 2.2,
  fistRate: 0.45,
  enemyHealth: 100,
  enemyShootRange: 24,
  enemyDamage: 5,
};

export const WANTED_CRIME = {
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  ramPolice: 1,
  killCop: 2,
};

export const PALETTE = {
  skyTop: 0x3f8fd2,
  skyBottom: 0xffd9a0,
  fog: 0xf7c98b,
  sun: 0xfff1c4,
  ground: 0x8a7f6a,
  road: 0x3a3a40,
  roadLine: 0xf5d76e,
  sidewalk: 0x9a938a,
  sand: 0xe8cf9a,
  sea: 0x2e7fa8,
  building: [0xd9a066, 0xc98f7a, 0x9db8c4, 0xe0c98f, 0xb7a6c9, 0x8fb8a0, 0xd77f6a, 0x7fa3c9],
  roof: 0x5a4a3f,
  palm: 0x3f7a3a,
  trunk: 0x8a6a4a,
  glass: 0x9fd4e8,
};

export const SAVE_KEY = 'velmara.save.v1';
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
