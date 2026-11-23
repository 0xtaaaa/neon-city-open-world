// Neon City — living entities: the player on foot, pedestrians, police
// cars and officers, and the Air One police helicopter. The wanted system
// lives here too: crimes raise heat, and hiding lets it cool off.

import { CFG, clamp, angleDiff, dist } from './config.js';
import { starsFromPoints, addWanted } from './state.js';
import { collideBuildings, clampToWorld, randomRoadPos, isOnRoad } from './world.js';
import { makeCar, driveCar, damageCar, hurtPlayer } from './vehicles.js';
import { rand, pick, chance } from './random.js';
import { sfx } from './audio.js';
import { moveVector, aimAngle } from './input.js';

const PED_SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8'];
const PED_SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

// ---- Player on foot ----
export function updatePlayerOnFoot(S, dt) {
  const p = S.player;
  const mv = moveVector(S);
  const sprint = S.keys.sprint && (mv.x !== 0 || mv.y !== 0);
  const speed = sprint ? CFG.SPRINT_SPEED : CFG.WALK_SPEED;
  p.vx = mv.x * speed;
  p.vy = mv.y * speed;
  let nx = p.x + p.vx * dt;
  let ny = p.y + p.vy * dt;
  const fixed = collideBuildings(S, nx, ny, CFG.PLAYER_RADIUS);
  const clamped = clampToWorld(fixed.x, fixed.y, CFG.PLAYER_RADIUS);
  p.x = clamped.x; p.y = clamped.y;
  if (mv.x !== 0 || mv.y !== 0) p.angle = Math.atan2(mv.y, mv.x);
  // Aim with the mouse when a weapon is out.
  if (S.mouse.down || p.fireTimer > 0) p.angle = aimAngle(S, p.x, p.y);
  p.sprint = sprint;
}

// ---- Pedestrians ----
export function spawnPed(S, x, y) {
  const pos = (x === undefined) ? randomRoadPos(S) : { x, y };
  const ped = {
    x: pos.x, y: pos.y,
    angle: rand(0, Math.PI * 2),
    speed: rand(28, 55),
    shirt: pick(PED_SHIRTS),
    skin: pick(PED_SKINS),
    hp: 30,
    state: 'walk', // walk | flee | dead
    fleeTimer: 0,
    wanderTimer: rand(1, 4),
    dead: false,
  };
  S.peds.push(ped);
  return ped;
}

export function updatePeds(S, dt) {
  for (const ped of S.peds) {
    if (ped.dead) continue;
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
      // Run away from the player.
      const a = Math.atan2(ped.y - S.player.y, ped.x - S.player.x);
      ped.angle = a;
      const nx = ped.x + Math.cos(a) * ped.speed * 2.4 * dt;
      const ny = ped.y + Math.sin(a) * ped.speed * 2.4 * dt;
      const fixed = collideBuildings(S, nx, ny, 12);
      ped.x = fixed.x; ped.y = fixed.y;
      continue;
    }
    ped.wanderTimer -= dt;
    if (ped.wanderTimer <= 0) {
      ped.wanderTimer = rand(2, 6);
      ped.angle = rand(0, Math.PI * 2);
    }
    // Prefer walking along roads; peds drift onto sidewalks naturally.
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    const fixed = collideBuildings(S, nx, ny, 12);
    if (fixed.x === nx && fixed.y === ny) { ped.x = nx; ped.y = ny; }
    else ped.angle = rand(0, Math.PI * 2);
    const c = clampToWorld(ped.x, ped.y, 12);
    ped.x = c.x; ped.y = c.y;
  }
  // Keep the streets populated.
  if (S.peds.filter((p) => !p.dead).length < 26) {
    const pos = randomRoadPos(S);
    const d = dist(pos.x, pos.y, S.player.x, S.player.y);
    if (d > 500 && d < 1400) spawnPed(S, pos.x, pos.y);
  }
  S.peds = S.peds.filter((p) => !p.dead || p.deathTimer > 0);
  for (const p of S.peds) if (p.dead) p.deathTimer = (p.deathTimer || 3) - dt;
}

// A ped was shot or run over.
export function killPed(S, ped, byPlayer) {
  if (ped.dead) return;
  ped.dead = true;
  ped.deathTimer = 3;
  S.stats.kills++;
  bloodBurst(S, ped.x, ped.y);
  // Nearby peds flee.
  for (const other of S.peds) {
    if (!other.dead && dist(other.x, other.y, ped.x, ped.y) < 320) {
      other.state = 'flee';
      other.fleeTimer = rand(3, 6);
    }
  }
  if (byPlayer) {
    addWanted(S, 20); // one murder = one star
    toast(S, 'Pedestrian down — the cops were called!', '#ff6b6b');
  }
}

export function bloodBurst(S, x, y) {
  for (let i = 0; i < 10; i++) {
    S.particles.push({
      kind: 'blood', x, y,
      vx: rand(-120, 120), vy: rand(-120, 120),
      life: rand(0.3, 0.7), maxLife: 0.7, size: rand(2, 5), color: '#c0392b',
    });
  }
}

// ---- Wanted system ----
export function updateWanted(S, dt) {
  const p = S.player;
  // Do police have eyes on the player?
  let seen = false;
  for (const car of S.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    if (dist(car.x, car.y, p.x, p.y) < 620) { seen = true; break; }
  }
  if (!seen) {
    for (const off of S.police) {
      if (dist(off.x, off.y, p.x, p.y) < 320) { seen = true; break; }
    }
  }
  if (S.heli) seen = true;
  if (seen) S.wantedSeen = 0;
  else S.wantedSeen += dt;

  if (S.wanted > 0 && S.wantedSeen > CFG.WANTED_DECAY_SECONDS) {
    S.wantedPts = Math.max(0, S.wantedPts - dt * 6);
    S.wanted = starsFromPoints(S.wantedPts);
    if (S.wanted === 0) {
      toast(S, 'You lost the cops.', '#7bd389');
      sfx.siren(false);
    }
  }

  // Spawn police cars to match the wanted level.
  const wantCars = S.wanted === 0 ? 0 : Math.min(CFG.POLICE_MAX_CARS, S.wanted + 1);
  const haveCars = S.cars.filter((c) => c.driver === 'police' && !c.dead).length;
  if (haveCars < wantCars) {
    spawnPoliceCar(S);
  }
  // On-foot officers at 2+ stars.
  const wantOfficers = S.wanted >= 2 ? Math.min(4, S.wanted) : 0;
  if (S.police.length < wantOfficers && Math.random() < dt * 0.8) {
    spawnOfficer(S);
  }
  // Helicopter at 4-5 stars.
  if (S.wanted >= CFG.HELI_MIN_STARS && !S.heli) {
    S.heli = { x: p.x + 300, y: p.y - 300, fireTimer: 2, angle: 0 };
    toast(S, 'Air One is overhead!', '#ff6b6b');
  }
  if (S.wanted < CFG.HELI_MIN_STARS && S.heli) S.heli = null;

  sfx.siren(S.wanted > 0);
}

function spawnPoliceCar(S) {
  const p = S.player;
  const a = rand(0, Math.PI * 2);
  let x = p.x + Math.cos(a) * CFG.POLICE_SPAWN_DIST;
  let y = p.y + Math.sin(a) * CFG.POLICE_SPAWN_DIST;
  x = clamp(x, 100, CFG.WORLD_W - 100);
  y = clamp(y, 100, CFG.WORLD_H - 100);
  const near = nearestRoadPointLocal(S, x, y);
  const car = makeCar(S, near.x, near.y, Math.atan2(p.y - near.y, p.x - near.x), {
    kind: 'cop', color: '#1a1a2e', driver: 'police', maxSpeed: 620, accel: 520,
  });
  car.siren = true;
  return car;
}

function nearestRoadPointLocal(S, x, y) {
  let best = { x, y }, bestD = Infinity;
  for (const line of S.roadLines) {
    const d = line.axis === 'v' ? Math.abs(x - line.at) : Math.abs(y - line.at);
    if (d < bestD) {
      bestD = d;
      best = line.axis === 'v' ? { x: line.at, y } : { x, y: line.at };
    }
  }
  return best;
}

function spawnOfficer(S) {
  const p = S.player;
  const a = rand(0, Math.PI * 2);
  const x = clamp(p.x + Math.cos(a) * rand(280, 420), 60, CFG.WORLD_W - 60);
  const y = clamp(p.y + Math.sin(a) * rand(280, 420), 60, CFG.WORLD_H - 60);
  S.police.push({ x, y, angle: 0, speed: 165, grab: 0, fireTimer: rand(0.5, 1.5), hp: 40 });
}

// Police car chase: steer hard at the player, ram to damage.
export function updatePoliceCars(S, dt) {
  const p = S.player;
  for (const car of S.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    const targetAngle = Math.atan2(p.y - car.y, p.x - car.x);
    const diff = angleDiff(car.angle, targetAngle);
    const steer = clamp(diff * 1.4, -1, 1);
    const d = dist(car.x, car.y, p.x, p.y);
    const throttle = d > 60 ? 1 : 0.4;
    driveCar(S, car, throttle, steer, dt);
    // Ram damage when touching the player's car.
    if (!p.onFoot && p.car && !p.car.dead) {
      const dd = dist(car.x, car.y, p.car.x, p.car.y);
      if (dd < 46) {
        damageCar(S, p.car, 8 * dt * 10);
        car.speed *= 0.7;
        if (Math.random() < dt * 2) S.shake = Math.max(S.shake, 3);
      }
    }
    // Cop car runs over peds (raises nothing — they are the law).
    for (const ped of S.peds) {
      if (!ped.dead && dist(ped.x, ped.y, car.x, car.y) < 24) killPed(S, ped, false);
    }
  }
}

// On-foot officers chase the player; touching the player starts a bust.
export function updateOfficers(S, dt) {
  const p = S.player;
  for (const off of S.police) {
    const d = dist(off.x, off.y, p.x, p.y);
    const a = Math.atan2(p.y - off.y, p.x - off.x);
    off.angle = a;
    const speed = off.speed * (d > 200 ? 1.15 : 1);
    const nx = off.x + Math.cos(a) * speed * dt;
    const ny = off.y + Math.sin(a) * speed * dt;
    const fixed = collideBuildings(S, nx, ny, 12);
    off.x = fixed.x; off.y = fixed.y;

    if (d < 34) {
      off.grab += dt;
      if (off.grab > 1.2 && p.onFoot) {
        busted(S);
        return;
      }
    } else {
      off.grab = Math.max(0, off.grab - dt * 2);
    }

    // Officers shoot at the player from range at 3+ stars.
    if (S.wanted >= 3 && d < 420 && d > 60) {
      off.fireTimer -= dt;
      if (off.fireTimer <= 0) {
        off.fireTimer = rand(0.7, 1.4);
        fireOfficerShot(S, off, a);
      }
    }
  }
  S.police = S.police.filter((o) => dist(o.x, o.y, p.x, p.y) < 1600);
}

function fireOfficerShot(S, off, angle) {
  const spread = rand(-0.09, 0.09);
  S.bullets.push({
    x: off.x + Math.cos(angle) * 18, y: off.y + Math.sin(angle) * 18,
    vx: Math.cos(angle + spread) * 780, vy: Math.sin(angle + spread) * 780,
    damage: 6, from: 'police', life: 1.1, color: '#ffd166',
  });
  sfx.shoot('pistol');
}

// The player is busted: lose cash, respawn at the police station.
export function busted(S) {
  const p = S.player;
  const lost = Math.floor(S.money * CFG.RESPAWN_COST);
  S.money -= lost;
  S.wanted = 0; S.wantedPts = 0; S.wantedSeen = 0;
  sfx.siren(false);
  // Clear police.
  for (const car of S.cars) if (car.driver === 'police') car.dead = true;
  S.police = [];
  S.heli = null;
  if (!p.onFoot && p.car) { p.car.driver = 'none'; p.car = null; p.onFoot = true; }
  const hq = S.shops.find((s) => s.kind === 'police');
  if (hq) { p.x = hq.x; p.y = hq.y + 60; }
  p.health = 50;
  p.armor = 0;
  S.mode = 'dead';
  S.deathKind = 'busted';
  S.deathLoss = lost;
}

// The player is wasted: lose cash, respawn at the hospital.
export function wasted(S) {
  const p = S.player;
  const lost = Math.floor(S.money * CFG.RESPAWN_COST);
  S.money -= lost;
  S.wanted = Math.max(0, S.wanted - 1);
  S.wantedPts = Math.max(0, S.wantedPts - 30);
  sfx.siren(false);
  for (const car of S.cars) if (car.driver === 'police') car.dead = true;
  S.police = [];
  S.heli = null;
  if (!p.onFoot && p.car) { p.car.driver = 'none'; p.car = null; p.onFoot = true; }
  const hosp = S.shops.find((s) => s.kind === 'hospital');
  if (hosp) { p.x = hosp.x; p.y = hosp.y + 60; }
  p.health = CFG.PLAYER_HEALTH;
  p.armor = 0;
  p.dead = false;
  S.mode = 'dead';
  S.deathKind = 'wasted';
  S.deathLoss = lost;
}

// Helicopter: hovers over the player, spotlight, fires bursts at 5 stars.
export function updateHeli(S, dt) {
  if (!S.heli) return;
  const h = S.heli;
  const p = S.player;
  const tx = p.x + 40, ty = p.y - 40;
  h.x += (tx - h.x) * Math.min(1, dt * 0.8);
  h.y += (ty - h.y) * Math.min(1, dt * 0.8);
  h.angle += dt * 0.8;
  if (S.wanted >= 5) {
    h.fireTimer -= dt;
    if (h.fireTimer <= 0) {
      h.fireTimer = rand(1.2, 2.0);
      const a = Math.atan2(p.y - h.y, p.x - h.x);
      for (let i = 0; i < 3; i++) {
        S.bullets.push({
          x: h.x, y: h.y,
          vx: Math.cos(a + rand(-0.08, 0.08)) * 850,
          vy: Math.sin(a + rand(-0.08, 0.08)) * 850,
          damage: 8, from: 'heli', life: 1.4, color: '#ff9f1c',
        });
      }
      sfx.shoot('smg');
    }
  }
}

// Small toast message on screen.
export function toast(S, text, color = '#fff') {
  S.messages.push({ text, t: 4, color });
  if (S.messages.length > 4) S.messages.shift();
}
