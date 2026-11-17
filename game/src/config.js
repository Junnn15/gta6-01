// SOLMAR HEAT — config.js
// One clear job: every tuneable number, the city layout and the mission
// definitions for the open-world crime game "Solmar Heat". Nothing here
// touches the renderer; other modules import these constants.

export const GAME_TITLE = 'SOLMAR HEAT';
export const GAME_TAGLINE = 'Sun. Sand. Eight grand of trouble.';
export const DEBT_TOTAL = 8000;

// City layout: 7 roads each way on a regular grid.
export const ROAD_COUNT = 7;
export const ROAD_SPACING = 50; // distance between road centre lines
export const ROAD_WIDTH = 10;
export const BLOCK_SIZE = ROAD_SPACING - ROAD_WIDTH; // 40
export const CITY_HALF = ((ROAD_COUNT - 1) / 2) * ROAD_SPACING; // 150
// Road centre lines run from -150 to +150 in steps of 50.
export const ROAD_LINES = [-150, -100, -50, 0, 50, 100, 150];
// The world is a square; beyond the roads sit the beach (south, +z) and
// the marina (east, +x). Sea plane starts here.
export const WORLD_HALF = 210;
export const BEACH_Z = 178; // sand begins
export const SEA_Z = 196; // water begins

// Player tuning.
export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 12,
  healthMax: 100,
  radius: 0.9,
};

// Car tuning (arcade).
export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 42,
  maxReverse: 12,
  steer: 1.9,
  grip: 6,
};

// Wanted level.
export const WANTED = {
  maxStars: 5,
  decaySeconds: 18, // crime-free seconds before one star drops
  stealStars: 1,
  shootStars: 1,
  killOfficerStars: 2,
  bustDistance: 2.2, // an officer this close on foot busts the player
  bustSeconds: 1.2, // must stay that close this long
};

// Combat.
export const COMBAT = {
  magazine: 12,
  reserveMax: 120,
  damage: 34,
  range: 90,
  reloadSeconds: 1.4,
  fireSeconds: 0.22,
};

// Missions: Dario Cruz owes the Bay Crew $8,000. Marta Reyes, fixer,
// offers four jobs. Finishing all four pays the debt exactly.
export const MISSIONS = [
  {
    id: 'courier',
    name: '1 — The Courier',
    pay: 1000,
    briefing:
      'Marta: "First job, easy money. Pick up the package at the plaza fountain and deliver it to the marina gate. No questions, no cops."',
    objective: 'Deliver the package to the marina gate',
    pickup: { x: 14, z: 0 },
    target: { x: 168, z: 120 },
    targetLabel: 'MARINA GATE',
  },
  {
    id: 'boost',
    name: '2 — The Boost',
    pay: 1500,
    briefing:
      'Marta: "A candy-red Comet GT is parked by the north plaza. Steal it, lose the heat, and bring it to the garage on Palm Row."',
    objective: 'Steal the red Comet GT and deliver it to the garage',
    pickup: { x: -25, z: -150 },
    target: { x: 125, z: -110 },
    targetLabel: 'GARAGE',
  },
  {
    id: 'getaway',
    name: '3 — The Getaway',
    pay: 2000,
    briefing:
      'Marta: "The crew hit the Coral Bank. You are the wheelman. Hit all three checkpoints before the timer runs out — and do not get busted."',
    objective: 'Hit all 3 getaway checkpoints in time',
    pickup: { x: 0, z: 150 },
    target: { x: -150, z: -150 },
    targetLabel: 'CHECKPOINT',
    timeLimit: 75,
    checkpoints: [
      { x: -125, z: 100 },
      { x: 125, z: 50 },
      { x: -150, z: -150 },
    ],
  },
  {
    id: 'heist',
    name: '4 — The Vault',
    pay: 3500,
    briefing:
      'Marta: "Last one. The Coral Bank vault. Four guards stand between you and freedom. Clear them, then hold the vault door until it opens."',
    objective: 'Clear the 4 guards, then hold the vault until it opens',
    pickup: { x: 25, z: 42 },
    target: { x: 25, z: 40 },
    targetLabel: 'CORAL BANK VAULT',
    guards: [
      { x: 12, z: 38 },
      { x: 38, z: 38 },
      { x: 20, z: 44 },
      { x: 30, z: 44 },
    ],
    vaultHoldSeconds: 6,
  },
];

// Palette: sun-soaked modern coastal city.
export const COLORS = {
  sky: 0x87c5e8,
  sun: 0xfff2d0,
  asphalt: 0x3a3f46,
  sidewalk: 0xb8b0a0,
  sand: 0xe8d29a,
  sea: 0x2e7fa8,
  plaza: 0xcfc4ae,
  building: [0xd8c9a8, 0xb8c4cc, 0xe0a878, 0x9fb8a8, 0xc9b8d8, 0xe8d8b0],
  glass: 0x8fc8e0,
};

// Seeded RNG so the city is identical for every run with the same seed
// (screenshots and play-tests are reproducible).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
