// Neon City — configuration and tuning constants.
// Every number that shapes the game lives here so the rest of the code
// stays readable. No code from any earlier Neon City version is used.

export const CFG = {
  // World
  WORLD_W: 3600,
  WORLD_H: 3600,
  BLOCK_PITCH: 400, // distance between road centre lines
  ROAD_W: 96,
  FIRST_ROAD: 200, // first road centre line (roads at 200, 600, ..., 3400)

  // Day / night: one full cycle lasts 240 seconds.
  DAY_LENGTH: 240,

  // Player on foot
  WALK_SPEED: 230,
  SPRINT_SPEED: 330,
  PLAYER_RADIUS: 13,
  PLAYER_HEALTH: 100,
  PLAYER_ARMOR_MAX: 100,

  // Cars
  CAR_ACCEL: 420,
  CAR_BRAKE: 700,
  CAR_MAX_SPEED: 560,
  CAR_MAX_REVERSE: 200,
  CAR_TURN: 2.6, // radians per second at full lock
  CAR_GRIP: 3.2,
  CAR_RADIUS: 20,

  // Police
  POLICE_MAX_CARS: 6,
  POLICE_SPAWN_DIST: 700,
  WANTED_DECAY_SECONDS: 9,
  HELI_MIN_STARS: 4,

  // Combat
  BULLET_SPEED: 950,
  MELEE_RANGE: 46,

  // Economy
  START_MONEY: 500,
  RESPAWN_COST: 0.10, // fraction of cash lost when wasted / busted
  RACE_ENTRY: 100,
  RACE_WIN: 600,
  REPAIR_COST: 150,

  // Respect ranks, in order. `at` is the respect points needed.
  RANKS: [
    { name: 'Nobody', at: 0 },
    { name: 'Hustler', at: 120 },
    { name: 'Street', at: 320 },
    { name: 'Made', at: 650 },
    { name: 'Kingpin', at: 1100 },
    { name: 'Legend', at: 1700 },
  ],

  // Weapon definitions. price 0 means owned from the start.
  WEAPONS: {
    pistol: {
      name: 'Pistol', slot: 1, price: 0, ammoPrice: 25,
      damage: 14, rate: 0.30, spread: 0.025, pellets: 1,
      bulletSpeed: 950, mag: 12, reload: 0.9, auto: false, range: 520,
      color: '#ffd166', kick: 1.5,
    },
    shotgun: {
      name: 'Shotgun', slot: 2, price: 900, ammoPrice: 60,
      damage: 10, rate: 0.95, spread: 0.16, pellets: 6,
      bulletSpeed: 820, mag: 6, reload: 1.6, auto: false, range: 380,
      color: '#ff7b54', kick: 4,
    },
    smg: {
      name: 'SMG', slot: 3, price: 1600, ammoPrice: 80,
      damage: 9, rate: 0.085, spread: 0.06, pellets: 1,
      bulletSpeed: 980, mag: 32, reload: 1.4, auto: true, range: 460,
      color: '#7bd389', kick: 0.8,
    },
  },

  // Car palettes (body colours).
  CAR_COLORS: ['#c0392b', '#2980b9', '#f39c12', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1', '#1abc9c', '#e74c3c', '#34495e'],
  SPORT_COLORS: ['#ff2e63', '#08d9d6', '#f9ed69', '#ff8c42'],

  // Radio stations (WebAudio procedural music).
  RADIO: [
    { name: 'NEON FM', desc: 'synthwave', bpm: 112 },
    { name: 'VICE WAVE', desc: 'chill chords', bpm: 84 },
    { name: 'BASSLINE 88', desc: 'funk', bpm: 100 },
  ],

  // Mission rewards are set per mission in missions.js.
  SAVE_KEY: 'neoncity_v3_save',
};

// Clamp a value between lo and hi.
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Linear interpolation.
export function lerp(a, b, t) { return a + (b - a) * t; }

// Shortest signed angle difference (radians).
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Distance between two points.
export function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

// Respect rank index for a respect total.
export function rankIndex(respect) {
  let idx = 0;
  for (let i = 0; i < CFG.RANKS.length; i++) if (respect >= CFG.RANKS[i].at) idx = i;
  return idx;
}
