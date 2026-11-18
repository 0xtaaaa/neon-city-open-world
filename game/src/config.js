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
};

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
  ramDamage: 6,
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
  hud: '#f2f5f8',
  hudDim: '#9aa5b1',
  star: '#ffd23f',
  danger: '#ff4f5e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
