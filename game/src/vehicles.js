// Neon City — cars: physics, entering and exiting, damage and smoke.
// A car is a simple arcade body: position, heading, forward speed and a
// steering angle. Traffic, police and race rivals all reuse this body.

import { CFG, clamp, angleDiff } from './config.js';
import { collideBuildings, clampToWorld } from './world.js';
import { rand, pick } from './random.js';

let carId = 0;

export function makeCar(S, x, y, angle, opts = {}) {
  const car = {
    id: ++carId,
    x, y, angle,
    speed: 0,
    steer: 0,
    color: opts.color || pick(CFG.CAR_COLORS),
    kind: opts.kind || 'sedan', // sedan | taxi | cop | sport | truck | rival
    driver: opts.driver || 'none', // none | traffic | player | police | rival
    hp: 100,
    maxSpeed: opts.maxSpeed || CFG.CAR_MAX_SPEED,
    accel: opts.accel || CFG.CAR_ACCEL,
    length: opts.kind === 'truck' ? 52 : 42,
    width: 22,
    smoke: 0,
    honk: 0,
    targetSpeed: 0,
    // Traffic AI state
    axis: opts.axis || 'h',
    dir: opts.dir || 1,
    lane: 0,
    turnAt: 0,
    dead: false,
  };
  S.cars.push(car);
  return car;
}

// Player presses E near a car: get in (or steal it).
export function enterCar(S, car) {
  const p = S.player;
  p.onFoot = false;
  p.car = car;
  car.driver = 'player';
  p.x = car.x; p.y = car.y;
  p.angle = car.angle;
  if (car.kind !== 'cop' && car.driver !== 'player') {
    // handled by caller for the steal message
  }
  return car;
}

// Player leaves the car: step out to the side.
export function exitCar(S) {
  const p = S.player;
  const car = p.car;
  if (!car) return;
  const side = Math.random() < 0.5 ? 1 : -1;
  const nx = car.x + Math.cos(car.angle + Math.PI / 2) * side * 26;
  const ny = car.y + Math.sin(car.angle + Math.PI / 2) * side * 26;
  const fixed = collideBuildings(S, nx, ny, CFG.PLAYER_RADIUS);
  p.x = fixed.x; p.y = fixed.y;
  p.angle = car.angle;
  p.vx = 0; p.vy = 0;
  p.onFoot = true;
  p.car = null;
  if (car.driver === 'player') car.driver = 'none';
}

// Arcade car physics: throttle, steering that scales with speed, grip.
export function driveCar(S, car, throttle, steerInput, dt) {
  const grip = CFG.CAR_GRIP;
  const targetSteer = steerInput * CFG.CAR_TURN;
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 8);

  const speedSign = car.speed >= 0 ? 1 : -1;
  const steerFactor = clamp(Math.abs(car.speed) / 120, 0, 1);
  car.angle += car.steer * steerFactor * speedSign * dt;

  if (throttle > 0) car.speed += car.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 5) car.speed -= CFG.CAR_BRAKE * dt; // brake
    else car.speed += car.accel * 0.5 * throttle * dt; // reverse
  }
  // Rolling resistance and lateral grip.
  car.speed -= car.speed * 0.55 * dt;
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -CFG.CAR_MAX_REVERSE, car.maxSpeed);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = collideBuildings(S, nx, ny, CFG.CAR_RADIUS);
  if (fixed.x !== nx || fixed.y !== ny) {
    // Hit a building: scrape speed off and take damage.
    car.speed *= 0.55;
    damageCar(S, car, 4);
  }
  const clamped = clampToWorld(fixed.x, fixed.y, CFG.CAR_RADIUS);
  car.x = clamped.x; car.y = clamped.y;
  if (clamped.x !== fixed.x || clamped.y !== fixed.y) car.speed *= 0.5;

  // Smoke when badly damaged.
  if (car.hp < 35) {
    car.smoke += dt;
    if (car.smoke > 0.12) {
      car.smoke = 0;
      spawnSmoke(S, car.x - Math.cos(car.angle) * car.length / 2, car.y - Math.sin(car.angle) * car.length / 2);
    }
  }
  if (car.hp <= 0 && !car.dead) {
    car.dead = true;
    explodeCar(S, car);
  }
}

export function damageCar(S, car, dmg) {
  if (car.dead) return;
  car.hp -= dmg;
  if (car.hp <= 0) {
    car.hp = 0;
    car.dead = true;
    explodeCar(S, car);
  }
}

export function explodeCar(S, car) {
  car.deadAt = S.time;
  for (let i = 0; i < 26; i++) {
    S.particles.push({
      kind: 'fire', x: car.x + rand(-16, 16), y: car.y + rand(-16, 16),
      vx: rand(-140, 140), vy: rand(-140, 140), life: rand(0.4, 0.9), maxLife: 0.9,
      size: rand(4, 10), color: pick(['#ff9f1c', '#ff5714', '#ffd166', '#888']),
    });
  }
  for (let i = 0; i < 12; i++) {
    S.particles.push({
      kind: 'smoke', x: car.x + rand(-10, 10), y: car.y + rand(-10, 10),
      vx: rand(-30, 30), vy: rand(-60, -10), life: rand(0.8, 1.6), maxLife: 1.6,
      size: rand(10, 20), color: '#555',
    });
  }
  S.shake = Math.max(S.shake, 10);
  if (car.driver === 'player') {
    // The player's car blew up: they are thrown out, hurt.
    const p = S.player;
    exitCar(S);
    hurtPlayer(S, 25);
  }
}

export function spawnSmoke(S, x, y) {
  S.particles.push({
    kind: 'smoke', x, y, vx: rand(-12, 12), vy: rand(-40, -15),
    life: rand(0.6, 1.1), maxLife: 1.1, size: rand(6, 12), color: '#666',
  });
}

// Damage the player (armour absorbs first). Death is handled by main.js
// via S.pendingDeath so the mode switch happens once, after the frame.
export function hurtPlayer(S, dmg) {
  const p = S.player;
  if (p.dead || S.mode === 'dead') return;
  let left = dmg;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, left);
    p.armor -= absorbed;
    left -= absorbed;
  }
  p.health -= left;
  S.flash = Math.min(1, S.flash + 0.5);
  S.shake = Math.max(S.shake, 4);
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    S.pendingDeath = 'wasted';
  }
}

// Simple traffic AI: follow the road grid, turn at intersections.
export function updateTrafficCar(S, car, dt) {
  if (car.driver !== 'traffic') return;
  const speed = car.targetSpeed || 150;
  car.speed += (speed - car.speed) * Math.min(1, dt * 1.5);

  // Steer toward the lane centre.
  const laneOffset = 20;
  let targetAngle = car.angle;
  if (car.axis === 'h') {
    const roadY = nearestRoadLine(S, 'h', car.y);
    const desiredY = roadY + (car.dir > 0 ? laneOffset : -laneOffset);
    targetAngle = car.dir > 0 ? 0 : Math.PI;
    // Gentle correction toward the lane.
    const dy = desiredY - car.y;
    targetAngle += clamp(dy * 0.01, -0.4, 0.4) * (car.dir > 0 ? 1 : -1);
  } else {
    const roadX = nearestRoadLine(S, 'v', car.x);
    const desiredX = roadX + (car.dir > 0 ? laneOffset : -laneOffset);
    targetAngle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const dx = desiredX - car.x;
    targetAngle += clamp(dx * 0.01, -0.4, 0.4) * (car.dir > 0 ? -1 : 1);
  }
  car.angle += angleDiff(car.angle, targetAngle) * Math.min(1, dt * 2.5);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;

  // Slow down for the car ahead.
  for (const other of S.cars) {
    if (other === car || other.dead) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d < 70) {
      const ahead = Math.cos(car.angle) * (other.x - car.x) + Math.sin(car.angle) * (other.y - car.y);
      if (ahead > 0) car.speed = Math.min(car.speed, Math.max(0, other.speed - 20));
    }
  }

  const fixed = collideBuildings(S, nx, ny, CFG.CAR_RADIUS);
  car.x = fixed.x; car.y = fixed.y;

  // At an intersection, sometimes turn onto the cross road.
  if (Math.random() < dt * 0.25) {
    const nearX = nearestRoadLine(S, 'v', car.x);
    const nearY = nearestRoadLine(S, 'h', car.y);
    if (Math.abs(car.x - nearX) < 60 && Math.abs(car.y - nearY) < 60 && Math.random() < 0.3) {
      car.axis = car.axis === 'h' ? 'v' : 'h';
      car.dir = Math.random() < 0.5 ? 1 : -1;
    }
  }

  // Wrap around the world edges on the outer roads.
  if (car.x < 80 || car.x > CFG.WORLD_W - 80 || car.y < 80 || car.y > CFG.WORLD_H - 80) {
    const pos = randomRoadEdge(S);
    car.x = pos.x; car.y = pos.y;
    car.angle = pos.angle;
    car.axis = pos.axis; car.dir = pos.dir;
  }
}

function nearestRoadLine(S, axis, v) {
  let best = S.roadLines[0].at, bestD = Infinity;
  for (const line of S.roadLines) {
    if (line.axis !== axis) continue;
    const d = Math.abs(line.at - v);
    if (d < bestD) { bestD = d; best = line.at; }
  }
  return best;
}

function randomRoadEdge(S) {
  const side = Math.floor(Math.random() * 4);
  void S;
  const roads = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400];
  const r = roads[Math.floor(Math.random() * roads.length)];
  if (side === 0) return { x: r, y: 120, axis: 'v', dir: 1, angle: Math.PI / 2 };
  if (side === 1) return { x: r, y: CFG.WORLD_H - 120, axis: 'v', dir: -1, angle: -Math.PI / 2 };
  if (side === 2) return { x: 120, y: r, axis: 'h', dir: 1, angle: 0 };
  return { x: CFG.WORLD_W - 120, y: r, axis: 'h', dir: -1, angle: Math.PI };
}

// Keep cars from overlapping each other (soft push).
export function separateCars(S) {
  const cars = S.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 44;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        if (a.driver === 'player' || b.driver === 'player') {
          const pc = a.driver === 'player' ? a : b;
          pc.speed *= 0.9;
        }
      }
    }
  }
}
