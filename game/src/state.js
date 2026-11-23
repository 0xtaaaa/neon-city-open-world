// Neon City — the single shared game state object. Every system reads and
// writes this one object, so the whole game can be saved, reset and
// inspected from one place.

import { CFG } from './config.js';

export function freshState() {
  return {
    // Flow: 'title' | 'playing' | 'paused' | 'dialogue' | 'shop' | 'dead'
    mode: 'title',
    paused: false,
    time: 0, // total seconds played
    dayTime: 60, // seconds into the 240s day/night cycle (starts mid-morning)
    money: CFG.START_MONEY,
    respect: 0,

    // Wanted system
    wanted: 0, // stars 0..5
    wantedPts: 0, // 0..100, stars derive from this
    wantedSeen: 0, // seconds since police last saw the player
    bustedTimer: 0,

    // Player
    player: {
      x: 600, y: 600, angle: 0, vx: 0, vy: 0,
      health: CFG.PLAYER_HEALTH, armor: 0,
      onFoot: true, car: null,
      weapon: 'pistol',
      weapons: {
        pistol: { owned: true, mag: 12, reserve: Infinity },
        shotgun: { owned: false, mag: 0, reserve: 0 },
        smg: { owned: false, mag: 0, reserve: 0 },
      },
      reloadTimer: 0, fireTimer: 0, muzzle: 0,
      sprint: false, dead: false,
      paint: '#ff2e63', // player's car colour when buying / respraying
    },

    // World contents (filled by world.buildCity)
    buildings: [],
    shops: [], // {kind, x, y, name, building}
    props: [], // trees, lamps, hydrants, crates
    roadLines: [], // {axis:'h'|'v', at:number} road centre lines
    markers: [], // mission / activity markers on the map

    // Entities
    cars: [], // traffic + parked + police + rivals
    peds: [],
    police: [], // on-foot officers
    heli: null, // {x, y, fireTimer} or null
    bullets: [],
    particles: [],
    pickups: [], // cash / health / armour drops

    // Missions
    missionIndex: -1, // index into MISSIONS, -1 = none active
    missionStep: 0,
    missionData: null, // per-mission runtime data
    completedMissions: [],

    // Street race
    race: null, // {checkpoints, lap, totalLaps, position, rivals, started}

    // Camera
    camera: { x: 600, y: 600, zoom: 1 },

    // Input (filled by input.js)
    keys: {},
    pressed: {}, // edge-triggered keys, cleared each frame
    mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false, clicked: false },

    // Audio
    radioStation: 0,
    radioOn: true,
    muted: false,

    // UI
    messages: [], // {text, t, color} toast lines
    dialogue: null, // {lines, i, char, speaker} or null
    shopOpen: null, // shop kind or null
    helpOpen: false,
    objectiveText: '',
    objectiveDist: 0,

    // Stats
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, racesWon: 0, shotsFired: 0 },

    // Screenshot / debug helpers
    shotMode: null,
    shake: 0,
    flash: 0, // damage flash 0..1
    slowmo: 0,
  };
}

// Wanted stars derived from points: 0, 20, 40, 60, 80, 95.
export function starsFromPoints(pts) {
  if (pts < 20) return 0;
  if (pts < 40) return 1;
  if (pts < 60) return 2;
  if (pts < 80) return 3;
  if (pts < 95) return 4;
  return 5;
}

// Add wanted points and refresh the star count.
export function addWanted(S, pts) {
  S.wantedPts = Math.min(100, S.wantedPts + pts);
  const stars = starsFromPoints(S.wantedPts);
  if (stars > S.wanted) {
    S.wanted = stars;
    S.wantedSeen = 0;
  } else {
    S.wanted = stars;
  }
}

// Fraction of the day cycle: 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight.
export function dayFraction(S) { return (S.dayTime % CFG.DAY_LENGTH) / CFG.DAY_LENGTH; }

// True when it is night (for lights, headlights, lit windows).
export function isNight(S) {
  const f = dayFraction(S);
  return f > 0.55 || f < 0.08;
}

// Human clock string for the HUD, e.g. "14:20".
export function clockString(S) {
  const f = dayFraction(S);
  const hours = Math.floor(f * 24);
  const mins = Math.floor((f * 24 - hours) * 60);
  return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
}
