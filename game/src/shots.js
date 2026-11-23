// Neon City — screenshot scene presets. Loading the game with
// ?shot=cover|chase|mission|race skips the title screen and stages a
// busy, readable scene for the dossier screenshots: the open world, the
// HUD with its minimap, traffic, police, a mission and a race.

import { CFG } from './config.js';
import { makeCar } from './vehicles.js';
import { spawnPed, toast } from './entities.js';
import { addWanted } from './state.js';
import { startMission } from './missions.js';
import { startRace } from './races.js';
import { rand } from './random.js';

export function applyShotPreset(S, name) {
  S.shotMode = name;
  S.mode = 'playing';
  const p = S.player;
  // A decent starting wallet and respect so the HUD shows progress.
  S.money = 2450;
  S.respect = 340;

  if (name === 'cover') {
    // Day, driving down a main road with traffic, mission active.
    S.dayTime = 100; // late morning
    const car = makeCar(S, 1400, 1000, 0, { kind: 'sport', color: '#ff2e63', driver: 'player', maxSpeed: 560 });
    p.onFoot = false; p.car = car; p.x = car.x; p.y = car.y; p.angle = 0;
    car.speed = 320;
    seedTraffic(S, 10, 1400, 1000, 700);
    seedPeds(S, 8, 1400, 1000, 600);
    S.completedMissions = ['fresh-start'];
    startMission(S, 1); // The Pickup — dialogue shows, then objective
    S.mode = 'playing'; // skip the intro dialogue for the shot
    S.dialogue = null;
    S.objectiveText = 'Deliver the package to Club Mirage';
    S.objectivePos = { x: 1800, y: 1800 };
    S.camera.x = car.x; S.camera.y = car.y;
  } else if (name === 'chase') {
    // Night, 4 stars, police cars + helicopter on the player's tail.
    S.dayTime = 200; // deep night
    const car = makeCar(S, 1800, 1400, 0, { kind: 'sport', color: '#08d9d6', driver: 'player', maxSpeed: 560 });
    p.onFoot = false; p.car = car; p.x = car.x; p.y = car.y; p.angle = 0;
    car.speed = 420;
    S.wantedPts = 85; S.wanted = 4; S.wantedSeen = 0;
    for (let i = 0; i < 4; i++) {
      const a = rand(0, Math.PI * 2);
      makeCar(S, car.x + Math.cos(a) * rand(220, 420), car.y + Math.sin(a) * rand(220, 420),
        Math.atan2(car.y - (car.y + Math.sin(a) * 300), car.x - (car.x + Math.cos(a) * 300)),
        { kind: 'cop', color: '#1a1a2e', driver: 'police', maxSpeed: 620 });
    }
    S.heli = { x: car.x + 120, y: car.y - 160, fireTimer: 2, angle: 0 };
    seedTraffic(S, 6, 1800, 1400, 800);
    S.objectiveText = 'Lose the cops — 4 stars';
    S.camera.x = car.x; S.camera.y = car.y;
  } else if (name === 'mission') {
    // Day, on foot with a shotgun, hitmen closing in, objective ahead.
    S.dayTime = 80;
    p.x = 1000; p.y = 1400; p.onFoot = true; p.car = null;
    p.weapons.shotgun.owned = true;
    p.weapons.shotgun.mag = 6; p.weapons.shotgun.reserve = 24;
    p.weapon = 'shotgun';
    p.armor = 60;
    S.completedMissions = ['fresh-start', 'pickup', 'getaway', 'qualifier', 'informant'];
    for (let i = 0; i < 4; i++) {
      S.peds.push({
        x: p.x + rand(-260, 260), y: p.y + rand(-260, 260),
        angle: 0, speed: 120, shirt: '#222', skin: '#e0ac69',
        hp: 50, state: 'walk', kind: 'hitman', fireTimer: rand(0.5, 1.5), dead: false,
      });
    }
    seedPeds(S, 6, 1000, 1400, 500);
    seedTraffic(S, 4, 1000, 1400, 500);
    S.objectiveText = 'Take out 6 hitmen';
    S.objectivePos = { x: 1200, y: 1600 };
    S.missionIndex = 8;
    S.missionStep = 0;
    S.missionData = { killsAtStart: S.stats.kills, timer: 0, collected: 0, hold: 0, spotted: 0, lost: 0 };
    S.camera.x = p.x; S.camera.y = p.y;
  } else if (name === 'race') {
    // Dusk, mid-race against three rivals.
    S.dayTime = 140; // golden dusk
    startRace(S, { laps: 3, prize: CFG.RACE_WIN });
    S.race.countdown = 0;
    S.race.lap = 2;
    S.race.nextCp = 4;
    const car = p.car;
    if (car) { car.x = 1800; car.y = 600; car.angle = 0; car.speed = 480; p.x = 1800; p.y = 600; }
    const rivals = S.race.rivals;
    rivals[0].x = 1900; rivals[0].y = 640; rivals[0].angle = 0; rivals[0].speed = 470; rivals[0].wp = 5;
    rivals[1].x = 1700; rivals[1].y = 560; rivals[1].angle = 0; rivals[1].speed = 460; rivals[1].wp = 4;
    rivals[2].x = 1650; rivals[2].y = 660; rivals[2].angle = 0; rivals[2].speed = 440; rivals[2].wp = 3;
    seedTraffic(S, 4, 1800, 600, 600);
    S.camera.x = 1800; S.camera.y = 600;
  }
}

function seedTraffic(S, count, cx, cy, radius) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const d = rand(150, radius);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const car = makeCar(S, x, y, rand(0, Math.PI * 2), {
      kind: Math.random() < 0.15 ? 'taxi' : 'sedan',
      color: ['#c0392b', '#2980b9', '#f39c12', '#27ae60', '#ecf0f1'][i % 5],
      driver: 'traffic',
    });
    car.targetSpeed = rand(120, 180);
  }
}

function seedPeds(S, count, cx, cy, radius) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const d = rand(120, radius);
    spawnPed(S, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
}
