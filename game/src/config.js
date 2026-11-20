// Neon City — every tuning number and colour in one place.
// The world is a fixed 3200x3200 logical city; the renderer scales a camera
// view of it to the window, so no rule below depends on the screen size.

export const STEP = 1 / 60;

export const WORLD = {
  size: 3200,
  roadEvery: 400,
  roadWidth: 76,
  // Road centre lines, one every 400 px, inset 200 from each edge.
  lines: [200, 600, 1000, 1400, 1800, 2200, 2600, 3000],
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 185,
  runSpeed: 265,
  health: 100,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.38,
  shootCooldown: 0.22,
  bulletSpeed: 720,
  startAmmo: 24,
  startCash: 150,
};

export const CAR = {
  length: 52,
  width: 26,
  accel: 340,
  brake: 520,
  reverseAccel: 200,
  maxSpeed: 470,
  maxReverse: 140,
  turnRate: 2.6,
  drag: 0.55,
  stealRadius: 46,
  // Sport-tier cars (unlocked by respect) are longer, lower and faster.
  sportMaxSpeed: 580,
  sportAccel: 420,
  taxiMaxSpeed: 430,
};

// Weapon slots: 1 pistol, 2 shotgun, 3 SMG. damage is per pellet/bullet,
// spread is radians of cone, pellets is how many projectiles one trigger
// pull fires, rate is seconds between pulls.
export const WEAPONS = {
  pistol: { name: 'Pistol', damage: 34, spread: 0.02, pellets: 1, rate: 0.22, bulletSpeed: 720, startAmmo: 24 },
  shotgun: { name: 'Shotgun', damage: 16, spread: 0.24, pellets: 5, rate: 0.7, bulletSpeed: 640, startAmmo: 10 },
  smg: { name: 'SMG', damage: 15, spread: 0.09, pellets: 1, rate: 0.09, bulletSpeed: 760, startAmmo: 40 },
};
export const WEAPON_ORDER = ['pistol', 'shotgun', 'smg'];

// Respect: earned on jobs, races and turf. The rank gates the street race
// prize multiplier and which cars the city parks for you.
export const RESPECT_RANKS = [
  { name: 'Nobody', at: 0 },
  { name: 'Street', at: 100 },
  { name: 'Hustler', at: 300 },
  { name: 'Kingpin', at: 600 },
  { name: 'Legend', at: 1000 },
];
export const RESPECT = { mission: 50, raceWin: 40, turf: 30, steal: 5, racePrize: 800 };

// Street race: checkpoints around the city, three AI rivals, one prize.
export const RACE = {
  laps: 1,
  checkpoints: 4,
  rivalSpeed: 300,
  rivalCount: 3,
};

// Police helicopter "Air One": appears at 4 stars and up, pins the wanted
// level while its searchlight is on you, and never lands.
export const HELI = {
  minStars: 4,
  speed: 340,
  hoverHeight: 130,
  lightRadius: 190,
};

// Day/night: a full cycle lasts 240 seconds of play; night darkens the
// city, lights the windows and switches every car's headlights on.
export const DAYNIGHT = { cycleSeconds: 240, nightAlpha: 0.42 };

// Radio: three procedural stations, switched with R. Each station is a
// mood: tempo in BPM plus a bass line and an arpeggio, as scale degrees.
export const RADIO = [
  { name: 'NEON FM', tempo: 112, bass: [0, 0, 7, 5], arp: [0, 3, 7, 12, 7, 3], wave: 'sawtooth' },
  { name: 'STATIC ROCK', tempo: 140, bass: [0, 0, 3, 5], arp: [0, 12, 0, 7], wave: 'square' },
  { name: 'NIGHT DRIVE', tempo: 84, bass: [0, 5, 3, 7], arp: [0, 7, 12, 15, 12, 7], wave: 'triangle' },
];

export const TRAFFIC = { cars: 14, peds: 26, pedSpeed: 55 };

export const WANTED = {
  max: 5,
  decaySeconds: 9,
  // Police cars on the street per wanted level (index = stars).
  policeByStars: [0, 1, 2, 3, 4, 5],
  // How far a cop has to be before the player counts as hidden.
  hiddenRange: 560,
};

export const POLICE = {
  length: 52,
  width: 26,
  maxSpeed: 500,
  accel: 380,
  // A ram stings (4 hp) and costs some speed, but five cars ramming in
  // rotation must not halve the player's speed every half-second — that
  // made a straight-line escape impossible and the player died in seconds.
  ramDamage: 4,
  ramCooldown: 4,
  shootRange: 420,
  shootCooldown: 1.1,
  bulletSpeed: 620,
};

export const MISSIONS = [
  {
    name: 'First Job',
    briefing: 'Vex needs wheels. Steal any car and bring it to the garage.',
  },
  {
    name: 'Hot Delivery',
    briefing: 'Pick up the package, then deliver it across town. 120 seconds.',
  },
  {
    name: 'Drop Run',
    briefing: 'Four cash drops are stashed around Neon City. Collect them all.',
  },
  {
    name: 'Lose the Heat',
    briefing: 'The cops are on you. Shake them and reach the hideout.',
  },
  {
    name: 'Air One Escape',
    briefing: 'Four stars and a helicopter overhead. Outrun Air One, reach the garage.',
  },
  {
    name: 'Street King',
    briefing: 'Win the street race: 4 checkpoints, 3 rivals, first across the line.',
  },
  {
    name: 'The Big Score',
    briefing: 'Three vault bags, two stars of heat. Grab them all, bring them home.',
  },
  {
    name: 'Rescue Run',
    briefing: 'Your crew is pinned down. Pick them up and get them to the hospital.',
  },
  {
    name: 'Turf War',
    briefing: 'Hold all three turf corners for the crew. The districts are watching.',
  },
];

export const SAVE_KEY = 'neon-city.save.v1';

export const PALETTE = {
  ground: '#1d241f',
  block: '#232a26',
  road: '#33373d',
  roadEdge: '#454b52',
  lane: '#c8b45a',
  sidewalk: '#3a3f45',
  park: '#22402c',
  tree: '#2f6b3f',
  building: ['#4a4a58', '#5b4a52', '#3f4a5b', '#54452f', '#463a4d'],
  roof: '#2c2f36',
  window: '#ffd76a',
  player: '#39d0ff',
  playerCar: '#ffcf3f',
  trafficCar: ['#c94f4f', '#4f7ec9', '#c9a24f', '#7ec94f', '#9a6fc9', '#c9c9c9'],
  policeCar: '#2244cc',
  ped: ['#e8a0a0', '#a0c8e8', '#e8d8a0', '#b0e8a0', '#d8a0e8'],
  health: '#3ddc5f',
  cash: '#ffd23f',
  ammo: '#ff9a3f',
  marker: '#ff4fd8',
  heli: '#ff9a3f',
  race: '#7dff5e',
  shop: '#ffcf3f',
  turf: '#b06fff',
  night: '#0a1230',
  headlight: 'rgba(255, 246, 201, 0.16)',
  hud: '#f2f5f8',
  hudDim: '#9aa5b1',
  star: '#ffd23f',
  danger: '#ff4f5e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
