// Neon City — the game loop and the glue: state machine, per-frame
// updates, interaction (E/F), camera, autosave and the DOM wiring.
// Everything the player does flows through here.

import { CFG, clamp } from './config.js';
import { freshState, addWanted } from './state.js';
import { initInput, moveVector } from './input.js';
import { initAudio, resumeAudio, sfx, setRadioStation } from './audio.js';
import { buildCity, randomRoadPos } from './world.js';
import { makeCar, enterCar, exitCar, driveCar, updateTrafficCar, separateCars } from './vehicles.js';
import {
  updatePlayerOnFoot, spawnPed, updatePeds, updateWanted,
  updatePoliceCars, updateOfficers, updateHeli, wasted, toast,
} from './entities.js';
import { tryShoot, startReload, switchWeapon, updateBullets, buyFromGunsmith, finishReload } from './weapons.js';
import {
  MISSIONS, nextMissionMarker, nextMissionAvailable, startMission,
  advanceDialogue, updateMission, updateHitmen, updatePickups,
} from './missions.js';
import { startRace, updateRace } from './races.js';
import { render } from './render.js';
import { drawHUD, showOverlay, setDialogue, setDeadScreen, buildShopMenu } from './ui.js';
import { saveGame, loadGame, applySave, hasSave, clearSave } from './save.js';
import { applyShotPreset } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { w: window.innerWidth, h: window.innerHeight };

function resize() {
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  canvas.width = view.w;
  canvas.height = view.h;
}
window.addEventListener('resize', resize);
resize();

let S = freshState();
let lastTs = 0;
let autosaveTimer = 0;

function spawnInitial() {
  // Traffic cars on the roads.
  for (let i = 0; i < 14; i++) {
    const pos = randomRoadPos(S);
    const car = makeCar(S, pos.x, pos.y, pos.axis === 'h' ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2), {
      kind: Math.random() < 0.12 ? 'taxi' : 'sedan', driver: 'traffic',
    });
    car.axis = pos.axis;
    car.dir = Math.random() < 0.5 ? 1 : -1;
    car.targetSpeed = 120 + Math.random() * 70;
  }
  // Parked cars to steal.
  for (let i = 0; i < 10; i++) {
    const pos = randomRoadPos(S);
    makeCar(S, pos.x, pos.y, pos.axis === 'h' ? 0 : Math.PI / 2, { driver: 'none' });
  }
  // Pedestrians.
  for (let i = 0; i < 22; i++) {
    const pos = randomRoadPos(S);
    spawnPed(S, pos.x, pos.y);
  }
  // A few cash/health pickups scattered around.
  for (let i = 0; i < 6; i++) {
    const pos = randomRoadPos(S);
    S.pickups.push({ kind: Math.random() < 0.6 ? 'cash' : 'health', amount: 50, x: pos.x, y: pos.y, r: 12, bob: 0 });
  }
}

function resetGame() {
  const fresh = freshState();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, fresh);
  buildCity(S);
  spawnInitial();
  S.camera.x = S.player.x;
  S.camera.y = S.player.y;
}

function startNewGame() {
  clearSave();
  resetGame();
  S.mode = 'playing';
  showOverlay(null);
  resumeAudio();
  setRadioStation(S.radioStation, S.radioOn);
  toast(S, 'Welcome to Neon City. Find the yellow marker to start your first job.', '#ffd166');
  saveGame(S);
}

function continueGame() {
  const data = loadGame();
  resetGame();
  if (data) applySave(S, data);
  S.mode = 'playing';
  showOverlay(null);
  resumeAudio();
  setRadioStation(S.radioStation, S.radioOn);
  toast(S, 'Welcome back to Neon City.', '#ffd166');
}

function openShop(kind) {
  S.shopOpen = kind;
  S.mode = 'shop';
  buildShopMenu(S, kind, (id) => buyFromGunsmith(S, id));
  showOverlay('shop');
}

function closeShop() {
  S.shopOpen = null;
  S.mode = 'playing';
  showOverlay(null);
}

// Context-sensitive interaction (E or F).
function interact(S) {
  const p = S.player;
  if (!p.onFoot) {
    exitCar(S);
    sfx.click();
    return;
  }
  // Mission contact marker.
  const marker = nextMissionMarker(S);
  if (marker && Math.hypot(p.x - marker.x, p.y - marker.y) < 80) {
    const avail = nextMissionAvailable(S);
    if (!avail.ok) {
      toast(S, avail.reason, '#ff6b6b');
      return;
    }
    startMission(S, S.completedMissions.length);
    return;
  }
  // Shops.
  for (const shop of S.shops) {
    if (Math.hypot(p.x - shop.x, p.y - shop.y) < 70) {
      if (shop.kind === 'gunsmith' || shop.kind === 'spray') {
        openShop(shop.kind);
        sfx.click();
        return;
      }
      if (shop.kind === 'hospital') {
        if (p.health >= CFG.PLAYER_HEALTH) { toast(S, 'You are already at full health.', '#fff'); return; }
        if (S.money < 100) { toast(S, 'Treatment costs $100.', '#ff6b6b'); return; }
        S.money -= 100;
        p.health = CFG.PLAYER_HEALTH;
        toast(S, 'Patched up. -$100', '#7bd389');
        sfx.pickup();
        return;
      }
      if (shop.kind === 'police') {
        if (S.wanted === 0) { toast(S, 'NCPD Headquarters. Nothing to see here.', '#fff'); return; }
        if (S.money < 500) { toast(S, 'A bribe costs $500.', '#ff6b6b'); return; }
        S.money -= 500;
        S.wanted = 0; S.wantedPts = 0;
        toast(S, 'The heat is off. -$500', '#7bd389');
        sfx.cash();
        return;
      }
      toast(S, shop.name + ' — ' + shopFlavor(shop.kind), '#fff');
      return;
    }
  }
  // Race start line.
  if (Math.hypot(p.x - 600, p.y - 660) < 90 && !S.race) {
    if (S.money < CFG.RACE_ENTRY) { toast(S, 'Race entry is $' + CFG.RACE_ENTRY + '.', '#ff6b6b'); return; }
    S.money -= CFG.RACE_ENTRY;
    startRace(S, { laps: 2, prize: CFG.RACE_WIN });
    return;
  }
  // Nearest car: get in (steal it if it has a driver).
  let best = null, bestD = 60;
  for (const car of S.cars) {
    if (car.dead) continue;
    const d = Math.hypot(p.x - car.x, p.y - car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (best) {
    if (best.driver === 'police' || best.driver === 'rival' || best.driver === 'target') {
      toast(S, 'That car is not yours to take.', '#ff6b6b');
      return;
    }
    if (best.driver === 'traffic') {
      const ped = spawnPed(S, best.x + 30, best.y);
      ped.state = 'flee';
      ped.fleeTimer = 5;
      best.driver = 'none';
      S.stats.carsStolen++;
      addWanted(S, 6);
      toast(S, 'Car stolen! The driver ran for it.', '#ffd166');
    }
    if (best.kind === 'cop') toast(S, 'You stole a police car! Bold.', '#ff6b6b');
    enterCar(S, best);
    sfx.click();
  }
}

function shopFlavor(kind) {
  return {
    club: 'The music is loud and the drinks are louder.',
    warehouse: 'Crates, forklifts and the smell of diesel.',
    bank: 'Your money is safe here. Probably.',
    hideout: 'Home. Smells like old pizza and ambition.',
    diner: 'Coffee, pie, and the best gossip in Neon City.',
  }[kind] || 'Just another Neon City landmark.';
}

// ---- Per-frame update ----
function update(dt) {
  S.time += dt;
  S.dayTime = (S.dayTime + dt) % CFG.DAY_LENGTH;

  const p = S.player;

  // Mouse world position (for aiming) — before anything uses it.
  S.mouse.wx = S.camera.x + (S.mouse.x - view.w / 2) / S.camera.zoom;
  S.mouse.wy = S.camera.y + (S.mouse.y - view.h / 2) / S.camera.zoom;

  // Timers.
  if (p.fireTimer > 0) p.fireTimer -= dt;
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) { p.reloadTimer = 0; finishReload(S); }
  }
  if (p.muzzle > 0) p.muzzle -= dt;
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 22);
  if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 1.6);
  for (const m of S.messages) m.t -= dt;
  S.messages = S.messages.filter((m) => m.t > 0);

  // Radio + mute.
  if (S.pressed.radio) {
    S.radioStation = (S.radioStation + 1) % CFG.RADIO.length;
    setRadioStation(S.radioStation, S.radioOn);
    toast(S, '♪ ' + CFG.RADIO[S.radioStation].name, '#7bd389');
  }
  if (S.pressed.mute) {
    S.muted = !S.muted;
    sfx.setMuted(S.muted);
    if (!S.muted) setRadioStation(S.radioStation, S.radioOn);
    else setRadioStation(S.radioStation, false);
  }

  // Player.
  if (p.onFoot) {
    updatePlayerOnFoot(S, dt);
    sfx.engine(false, 0);
    if (S.mouse.down) tryShoot(S);
    if (S.pressed.reload) startReload(S);
    if (S.pressed.slot1) switchWeapon(S, 'pistol');
    if (S.pressed.slot2) switchWeapon(S, 'shotgun');
    if (S.pressed.slot3) switchWeapon(S, 'smg');
    if (S.pressed.interact || S.pressed.action) interact(S);
  } else if (p.car && !p.car.dead) {
    // Frozen during a race countdown.
    const frozen = S.race && S.race.countdown > 0;
    const throttle = frozen ? 0 : (S.keys.up ? 1 : 0) + (S.keys.down ? -1 : 0);
    const steer = frozen ? 0 : (S.keys.left ? -1 : 0) + (S.keys.right ? 1 : 0);
    let th = throttle;
    if (S.keys.space) th = p.car.speed > 0 ? -1.6 : th; // handbrake
    driveCar(S, p.car, th, steer, dt);
    // driveCar can destroy the car (an explosion ejects the player),
    // leaving p.car null — guard the sync.
    if (p.car) {
      p.x = p.car.x; p.y = p.car.y; p.angle = p.car.angle;
      sfx.engine(true, Math.abs(p.car.speed) / CFG.CAR_MAX_SPEED);
    } else {
      sfx.engine(false, 0);
    }
    if (S.pressed.interact || S.pressed.action) interact(S);
  } else if (p.car && p.car.dead) {
    exitCar(S);
  }

  // Interacting can change the mode (dialogue / shop / dead) — if it did,
  // stop the frame here so the rest of the world does not advance (and so
  // a mission that just started cannot complete in the same frame).
  if (S.mode !== 'playing') return;

  // World systems.
  for (const car of S.cars) if (car.driver === 'traffic') updateTrafficCar(S, car, dt);
  separateCars(S);
  updatePeds(S, dt);
  updatePoliceCars(S, dt);
  updateOfficers(S, dt);
  updateHeli(S, dt);
  updateWanted(S, dt);
  updateBullets(S, dt);
  updatePickups(S, dt);
  updateHitmen(S, dt);
  if (S.race) updateRace(S, dt);
  if (S.missionIndex >= 0) updateMission(S, dt);

  // Particles.
  for (const pt of S.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += (pt.kind === 'smoke' ? -20 : 60) * dt;
  }
  S.particles = S.particles.filter((pt) => pt.life > 0);

  // Remove old wrecks (keep them visible for 8 seconds).
  S.cars = S.cars.filter((c) => !c.dead || (S.time - (c.deadAt || 0) < 8));

  // Keep traffic topped up.
  const trafficCount = S.cars.filter((c) => c.driver === 'traffic' && !c.dead).length;
  if (trafficCount < 14 && Math.random() < dt * 0.7) {
    const pos = randomRoadPos(S);
    const d = Math.hypot(pos.x - p.x, pos.y - p.y);
    if (d > 600 && d < 1500) {
      const car = makeCar(S, pos.x, pos.y, pos.axis === 'h' ? 0 : Math.PI / 2, { driver: 'traffic' });
      car.axis = pos.axis;
      car.dir = Math.random() < 0.5 ? 1 : -1;
      car.targetSpeed = 120 + Math.random() * 70;
    }
  }
  const parkedCount = S.cars.filter((c) => c.driver === 'none' && !c.dead).length;
  if (parkedCount < 10 && Math.random() < dt * 0.3) {
    const pos = randomRoadPos(S);
    makeCar(S, pos.x, pos.y, Math.random() * Math.PI * 2, { driver: 'none' });
  }

  // Death (set by hurtPlayer via pendingDeath).
  if (S.pendingDeath) {
    S.pendingDeath = null;
    wasted(S);
    S.deadShown = false;
    saveGame(S);
  }

  // Camera follows the player.
  const zoomTarget = p.onFoot ? 1.0 : 0.8;
  S.camera.zoom += (zoomTarget - S.camera.zoom) * Math.min(1, dt * 2);
  S.camera.x += (p.x - S.camera.x) * Math.min(1, dt * 5);
  S.camera.y += (p.y - S.camera.y) * Math.min(1, dt * 5);

  // Autosave.
  autosaveTimer += dt;
  if (autosaveTimer > 30) {
    autosaveTimer = 0;
    saveGame(S);
  }
}

// ---- Frame loop ----
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = clamp((ts - lastTs) / 1000, 0, 0.05);
  lastTs = ts;

  // Pause / resume / help — handled here, because update() only runs
  // while playing.
  if (S.pressed.pause || S.pressed.escape) {
    if (S.mode === 'playing') {
      S.mode = 'paused';
      showOverlay('pause');
      setRadioStation(S.radioStation, false);
      sfx.engine(false, 0);
      saveGame(S);
    } else if (S.mode === 'paused') {
      S.helpOpen = false;
      S.mode = 'playing';
      showOverlay(null);
      setRadioStation(S.radioStation, S.radioOn);
    } else if (S.mode === 'shop') {
      closeShop();
    }
  }
  if (S.pressed.help && (S.mode === 'playing' || S.mode === 'paused')) {
    if (S.mode === 'playing') {
      S.helpOpen = true;
      S.mode = 'paused';
      showOverlay('help');
    } else if (S.helpOpen) {
      S.helpOpen = false;
      S.mode = 'playing';
      showOverlay(null);
    }
  }

  if (S.mode === 'playing') {
    update(dt);
  } else if (S.mode === 'title') {
    // Slow cinematic pan behind the title screen.
    S.time += dt;
    S.camera.x = 1800 + Math.cos(S.time * 0.05) * 700;
    S.camera.y = 1800 + Math.sin(S.time * 0.04) * 700;
    S.dayTime = (S.dayTime + dt * 0.5) % CFG.DAY_LENGTH;
  } else if (S.mode === 'dialogue' && S.dialogue) {
    const d = S.dialogue;
    const line = d.lines[d.i] || '';
    if (d.chars < line.length) d.chars = Math.min(line.length, d.chars + dt * 55);
    setDialogue(S);
    if (S.pressed.interact || S.pressed.action || S.mouse.clicked) advanceDialogue(S);
  } else if (S.mode === 'dead' && !S.deadShown) {
    S.deadShown = true;
    setDeadScreen(S);
    showOverlay('dead');
  }

  render(S, ctx, view);
  if (S.mode !== 'title') drawHUD(S, ctx, view);

  // Clear edge-triggered input.
  S.pressed = {};
  S.mouse.clicked = false;
}

// ---- Wiring ----
function wireButtons() {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', () => { sfx.click(); fn(); }); };
  on('btn-new', startNewGame);
  on('btn-continue', continueGame);
  on('btn-resume', () => { S.mode = 'playing'; showOverlay(null); });
  on('btn-restart', () => { startNewGame(); });
  on('btn-quit-title', () => { saveGame(S); S.mode = 'title'; showOverlay('title'); refreshTitle(); });
  on('btn-help-close', () => { S.helpOpen = false; S.mode = 'playing'; showOverlay(null); });
  on('btn-shop-close', closeShop);
  on('btn-dead-respawn', () => {
    S.player.dead = false;
    S.deadShown = false;
    S.mode = 'playing';
    showOverlay(null);
    saveGame(S);
  });
  on('btn-title-help', () => { S.helpOpen = true; showOverlay('help'); });
  canvas.addEventListener('mousedown', resumeAudio);
  window.addEventListener('keydown', resumeAudio);
}

function refreshTitle() {
  const btn = document.getElementById('btn-continue');
  if (btn) btn.style.display = hasSave() ? 'block' : 'none';
}

// ---- Boot ----
buildCity(S);
initInput(S, canvas);
initAudio();
spawnInitial();
wireButtons();
refreshTitle();
showOverlay('title');

// Screenshot presets and debug hooks (harmless in normal play).
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  resetGame();
  applyShotPreset(S, shot);
  showOverlay(null);
}
if (params.get('debug')) {
  window.NC = { S, CFG, version: '3.0.0' };
}
window.NC = window.NC || { S, CFG, version: '3.0.0' };

requestAnimationFrame(loop);
