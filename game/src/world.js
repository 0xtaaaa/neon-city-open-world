// Neon City's simulation: the player on foot and in cars, traffic and
// pedestrians with simple AI, police who respond to the wanted level,
// combat, pickups and four story missions. All randomness comes from the
// seeded random, so the same seed always plays the same city.

import { WORLD, PLAYER, CAR, TRAFFIC, WANTED, POLICE, MISSIONS } from './config.js';
import { generateCity, onRoad, nearestRoadPoint, intersections, collideBuildings, clampToWorld } from './city.js';
import { pick, intBetween } from './random.js';

export const EVENT_BUSTED = 1;
export const EVENT_WASTED = 2;
export const EVENT_MISSION = 4;
export const EVENT_FAILED = 8;

const TAU = Math.PI * 2;

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function createWorld(random) {
  const city = generateCity(random);
  const crossroads = intersections();
  let nextCarId = 1;

  const state = {
    time: 0,
    city,
    player: null,
    cars: [],
    peds: [],
    bullets: [],
    pickups: [],
    particles: [],
    wanted: 0,
    wantedTimer: 0,
    missionIndex: 0,
    missionStage: 'steal',
    missionTarget: null,
    missionTimer: 0,
    missionDrops: 0,
    missionText: MISSIONS[0].briefing,
    storyDone: false,
    stats: { stolen: 0, kills: 0, earned: 0, busted: 0 },
    events: 0,
    flash: 0,
  };

  function spawnCar(x, y, angle, color, kind, driver) {
    const car = {
      id: nextCarId,
      x,
      y,
      angle,
      speed: 0,
      color,
      kind, // 'parked' | 'traffic' | 'police'
      driver, // 'none' | 'traffic' | 'police' | 'player'
      hp: kind === 'police' ? 60 : 40,
      target: null,
      wait: 0,
      shootCd: 0,
      ramCd: 0,
    };
    nextCarId += 1;
    state.cars.push(car);
    return car;
  }

  function spawnPed(x, y) {
    const ped = {
      x,
      y,
      angle: random() * TAU,
      speed: TRAFFIC.pedSpeed * (0.8 + random() * 0.5),
      color: pick(random, ['#e8a0a0', '#a0c8e8', '#e8d8a0', '#b0e8a0', '#d8a0e8']),
      state: 'walk',
      target: null,
      downTimer: 0,
      fleeTimer: 0,
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnPickup(x, y, kind, amount) {
    state.pickups.push({ x, y, kind, amount, bob: random() * TAU });
  }

  function scatterPickups() {
    const kinds = ['cash', 'cash', 'health', 'ammo', 'cash', 'ammo', 'health', 'cash'];
    for (const kind of kinds) {
      const p = nearestRoadPoint(300 + random() * 2600, 300 + random() * 2600);
      spawnPickup(p.x + (random() - 0.5) * 60, p.y + (random() - 0.5) * 60, kind,
        kind === 'cash' ? 50 + intBetween(random, 0, 5) * 25 : kind === 'health' ? 30 : 12);
    }
  }

  function addWanted(n) {
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.wantedTimer = 0;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * TAU;
      const s = speed * (0.4 + random() * 0.8);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.5 + random() * 0.5, maxLife: 1, color, size: 2 + random() * 3,
      });
    }
  }

  function startMission(index) {
    state.missionIndex = index;
    const mission = MISSIONS[index];
    if (index === 0) {
      state.missionStage = 'steal';
      state.missionTarget = { x: city.garage.x, y: city.garage.y, label: 'Garage' };
    } else if (index === 1) {
      state.missionStage = 'pickup';
      const p = pick(random, crossroads);
      state.missionTarget = { x: p.x, y: p.y, label: 'Package' };
      state.missionTimer = 0;
    } else if (index === 2) {
      state.missionStage = 'collect';
      state.missionDrops = 4;
      for (let i = 0; i < 4; i += 1) {
        const p = pick(random, crossroads);
        spawnPickup(p.x + (random() - 0.5) * 120, p.y + (random() - 0.5) * 120, 'cash', 100);
      }
      state.missionTarget = null;
    } else if (index === 3) {
      state.missionStage = 'heat';
      state.missionTarget = { x: city.hideout.x, y: city.hideout.y, label: 'Hideout' };
    }
    state.missionText = mission.briefing;
  }

  function completeMission(reward) {
    state.player.cash += reward;
    state.stats.earned += reward;
    state.events |= EVENT_MISSION;
    state.flash = 1;
    if (state.missionIndex >= MISSIONS.length - 1) {
      state.storyDone = true;
      state.missionText = 'Story complete — Neon City is yours. Free roam, Vex.';
      state.missionTarget = null;
    } else {
      startMission(state.missionIndex + 1);
    }
  }

  function failMission(text) {
    state.events |= EVENT_FAILED;
    state.missionText = text;
    startMission(state.missionIndex);
  }

  function reset() {
    state.time = 0;
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.pickups = [];
    state.particles = [];
    state.wanted = 0;
    state.wantedTimer = 0;
    state.missionIndex = 0;
    state.storyDone = false;
    state.stats = { stolen: 0, kills: 0, earned: 0, busted: 0 };
    state.events = 0;
    state.flash = 0;
    nextCarId = 1;

    state.player = {
      x: city.playerStart.x,
      y: city.playerStart.y,
      angle: -Math.PI / 2,
      health: PLAYER.health,
      ammo: PLAYER.startAmmo,
      cash: PLAYER.startCash,
      inCar: null,
      punchCd: 0,
      shootCd: 0,
      invuln: 0,
    };

    // Parked cars along the roads.
    for (let i = 0; i < 7; i += 1) {
      const line = pick(random, WORLD.lines);
      const along = 300 + random() * 2600;
      const side = random() < 0.5 ? -1 : 1;
      const horizontal = random() < 0.5;
      const x = horizontal ? along : line + side * 52;
      const y = horizontal ? line + side * 52 : along;
      spawnCar(x, y, horizontal ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2),
        pick(random, ['#c94f4f', '#4f7ec9', '#c9a24f', '#7ec94f', '#9a6fc9', '#c9c9c9']),
        'parked', 'none');
    }
    // Traffic cars on the roads.
    for (let i = 0; i < TRAFFIC.cars; i += 1) {
      const p = pick(random, crossroads);
      const horizontal = random() < 0.5;
      const car = spawnCar(p.x, p.y, horizontal ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        pick(random, ['#c94f4f', '#4f7ec9', '#c9a24f', '#7ec94f', '#9a6fc9', '#c9c9c9']),
        'traffic', 'traffic');
      car.speed = 110 + random() * 70;
      car.target = pick(random, crossroads);
    }
    // Pedestrians on the sidewalks.
    for (let i = 0; i < TRAFFIC.peds; i += 1) {
      const p = nearestRoadPoint(200 + random() * 2800, 200 + random() * 2800);
      spawnPed(p.x + (random() - 0.5) * 90, p.y + (random() - 0.5) * 90);
    }
    scatterPickups();
    startMission(0);
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of state.cars) {
      if (car.driver === 'player') continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car, audio) {
    const player = state.player;
    if (car.kind === 'traffic') {
      // Stealing a driven car: the driver bails out and runs, and the law notices.
      addWanted(1);
      state.stats.stolen += 1;
      const driver = spawnPed(car.x + 30, car.y + 30);
      driver.state = 'flee';
      driver.fleeTimer = 4;
      if (audio) audio.crash();
    } else if (car.kind === 'parked') {
      state.stats.stolen += 1;
    }
    car.kind = 'traffic';
    car.driver = 'player';
    car.speed = 0;
    player.inCar = car;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
  }

  function exitCar() {
    const player = state.player;
    const car = player.inCar;
    if (!car) return;
    car.driver = 'none';
    car.kind = 'parked';
    car.speed = 0;
    player.inCar = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 36;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 36;
    player.angle = car.angle;
    clampToWorld(player, 20);
  }

  function updatePlayer(dt, input, audio) {
    const player = state.player;
    player.punchCd = Math.max(0, player.punchCd - dt);
    player.shootCd = Math.max(0, player.shootCd - dt);
    player.invuln = Math.max(0, player.invuln - dt);

    if (input.enter) {
      if (player.inCar) exitCar();
      else {
        const car = nearestCar(player.x, player.y, CAR.stealRadius);
        if (car) enterCar(car, audio);
      }
    }

    if (player.inCar) {
      const car = player.inCar;
      // Arcade driving: throttle, brake, steering that bites harder at speed.
      if (input.up) car.speed += CAR.accel * dt;
      else if (input.down) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
      else {
        const drag = Math.sign(car.speed) * CAR.drag * 120 * dt;
        car.speed = Math.abs(car.speed) <= Math.abs(drag) ? 0 : car.speed - drag;
      }
      car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
      const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      if (steer !== 0 && Math.abs(car.speed) > 5) {
        car.angle += steer * CAR.turnRate * dt * Math.min(1, Math.abs(car.speed) / 120) * Math.sign(car.speed);
      }
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      clampToWorld(car, 30);
      if (collideBuildings(car, CAR.length / 2, city.buildings)) {
        const hitSpeed = Math.abs(car.speed);
        car.speed *= -0.25;
        if (hitSpeed > 220) {
          if (audio) audio.crash();
          burst(car.x, car.y, '#ffb347', 8, 120);
        }
      }
      // Running over pedestrians is a crime, and it is fatal for them.
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 60) {
          ped.state = 'down';
          ped.downTimer = 6;
          addWanted(1);
          state.stats.kills += 1;
          burst(ped.x, ped.y, '#ff4f5e', 10, 140);
          if (audio) audio.crash();
        }
      }
      // Bumping other cars shoves them and slows both down.
      for (const other of state.cars) {
        if (other === car || other.driver === 'player') continue;
        if (dist(car.x, car.y, other.x, other.y) < 46) {
          const push = angleTo(other.x, other.y, car.x, car.y);
          other.x += Math.cos(push) * 2;
          other.y += Math.sin(push) * 2;
          other.speed *= 0.7;
          if (Math.abs(car.speed) > 200) {
            car.speed *= 0.55;
            if (audio) audio.crash();
          }
        }
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      if (audio) audio.engine(car.speed, CAR.maxSpeed);
      return;
    }

    // On foot: WASD moves, Shift runs, the player faces the mouse.
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      player.x += dx * speed * dt;
      player.y += dy * speed * dt;
      player.angle = Math.atan2(dy, dx);
      clampToWorld(player, 20);
      collideBuildings(player, PLAYER.radius, city.buildings);
    }
    if (input.aimX !== undefined) {
      player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    }
    if (audio) audio.engine(0, CAR.maxSpeed);

    // Melee: a punch in front of the player.
    if (input.melee && player.punchCd <= 0) {
      player.punchCd = PLAYER.punchCooldown;
      if (audio) audio.punch();
      const reach = PLAYER.punchRange + 14;
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        const d = dist(player.x, player.y, ped.x, ped.y);
        const facing = Math.abs(angleDiff(player.angle, angleTo(player.x, player.y, ped.x, ped.y)));
        if (d < reach && facing < 1.1) {
          ped.state = 'down';
          ped.downTimer = 6;
          addWanted(1);
          state.stats.kills += 1;
          burst(ped.x, ped.y, '#ff4f5e', 8, 120);
        }
      }
    }

    // Pistol: fires toward the mouse while held, if there is ammo.
    if (input.shoot && player.shootCd <= 0 && player.ammo > 0) {
      player.shootCd = PLAYER.shootCooldown;
      player.ammo -= 1;
      const a = player.angle;
      state.bullets.push({
        x: player.x + Math.cos(a) * 20,
        y: player.y + Math.sin(a) * 20,
        vx: Math.cos(a) * PLAYER.bulletSpeed,
        vy: Math.sin(a) * PLAYER.bulletSpeed,
        life: 1.1,
        from: 'player',
        damage: 34,
      });
      if (audio) audio.shot();
      burst(player.x + Math.cos(a) * 24, player.y + Math.sin(a) * 24, '#ffd76a', 4, 90);
    }
  }

  function updateTraffic(dt) {
    for (const car of state.cars) {
      if (car.driver !== 'traffic') continue;
      if (!car.target) car.target = pick(random, crossroads);
      const tx = car.target.x;
      const ty = car.target.y;
      // Drive axis-aligned toward the target intersection.
      const dx = tx - car.x;
      const dy = ty - car.y;
      let wantAngle;
      if (Math.abs(dx) > Math.abs(dy)) wantAngle = dx > 0 ? 0 : Math.PI;
      else wantAngle = dy > 0 ? Math.PI / 2 : -Math.PI / 2;
      const diff = angleDiff(car.angle, wantAngle);
      car.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      // Slow down for the car ahead.
      let ahead = false;
      for (const other of state.cars) {
        if (other === car) continue;
        const d = dist(car.x, car.y, other.x, other.y);
        if (d < 70 && Math.abs(angleDiff(car.angle, angleTo(car.x, car.y, other.x, other.y))) < 0.6) {
          ahead = true;
          break;
        }
      }
      const targetSpeed = ahead ? 40 : 120 + (car.id % 5) * 12;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      clampToWorld(car, 30);
      collideBuildings(car, CAR.length / 2, city.buildings);
      if (dist(car.x, car.y, tx, ty) < 26) car.target = pick(random, crossroads);
    }
  }

  function updatePeds(dt) {
    const player = state.player;
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          // They get up, shaken, and walk away.
          ped.state = 'walk';
          ped.target = null;
        }
        continue;
      }
      // Flee a speeding car nearby.
      const playerCar = player.inCar;
      if (playerCar && Math.abs(playerCar.speed) > 120 && dist(ped.x, ped.y, playerCar.x, playerCar.y) < 110) {
        ped.state = 'flee';
        ped.fleeTimer = 1.6;
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const away = angleTo(playerCar ? playerCar.x : player.x, playerCar ? playerCar.y : player.y, ped.x, ped.y);
        ped.angle = away;
        ped.x += Math.cos(away) * 150 * dt;
        ped.y += Math.sin(away) * 150 * dt;
        clampToWorld(ped, 20);
        collideBuildings(ped, 10, city.buildings);
        if (ped.fleeTimer <= 0) ped.state = 'walk';
        continue;
      }
      if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 20) {
        ped.target = pick(random, crossroads);
      }
      const want = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
      ped.angle += Math.max(-3 * dt, Math.min(3 * dt, angleDiff(ped.angle, want)));
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      clampToWorld(ped, 20);
      collideBuildings(ped, 10, city.buildings);
    }
  }

  function spawnPolice() {
    const want = WANTED.policeByStars[state.wanted];
    let have = 0;
    for (const car of state.cars) if (car.driver === 'police') have += 1;
    const player = state.player;
    while (have < want) {
      // Spawn on a road, a good chase away from the player.
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 12; tries += 1) {
        const p = pick(random, crossroads);
        if (dist(p.x, p.y, player.x, player.y) > 650 && dist(p.x, p.y, player.x, player.y) < 1100) {
          x = p.x;
          y = p.y;
          break;
        }
        x = p.x;
        y = p.y;
      }
      const car = spawnCar(x, y, angleTo(x, y, player.x, player.y), '#2244cc', 'police', 'police');
      car.speed = 200;
      have += 1;
    }
  }

  function updatePolice(dt, audio) {
    const player = state.player;
    spawnPolice();
    let anyNear = false;
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      const d = dist(car.x, car.y, player.x, player.y);
      if (d < WANTED.hiddenRange) anyNear = true;
      const want = angleTo(car.x, car.y, player.x, player.y);
      const diff = angleDiff(car.angle, want);
      car.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
      const targetSpeed = d > 320 ? POLICE.maxSpeed : 340;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      clampToWorld(car, 30);
      collideBuildings(car, CAR.length / 2, city.buildings);
      car.shootCd = Math.max(0, car.shootCd - dt);
      car.ramCd = Math.max(0, car.ramCd - dt);
      // Ramming the player's car hurts the player and slows them.
      if (player.inCar && d < 50 && car.ramCd <= 0) {
        car.ramCd = 2.5;
        player.health -= POLICE.ramDamage;
        player.inCar.speed *= 0.55;
        burst(player.x, player.y, '#ffb347', 10, 150);
        if (audio) audio.crash();
      }
      // On foot, a touch is an arrest.
      if (!player.inCar && d < 34 && player.invuln <= 0) {
        state.events |= EVENT_BUSTED;
      }
      // At three stars and up, the police shoot.
      if (state.wanted >= 3 && car.shootCd <= 0 && d < POLICE.shootRange && d > 90) {
        car.shootCd = POLICE.shootCooldown * (0.8 + random() * 0.5);
        const aim = want + (random() - 0.5) * 0.35;
        state.bullets.push({
          x: car.x + Math.cos(aim) * 28,
          y: car.y + Math.sin(aim) * 28,
          vx: Math.cos(aim) * POLICE.bulletSpeed,
          vy: Math.sin(aim) * POLICE.bulletSpeed,
          life: 1.4,
          from: 'police',
          damage: 9,
        });
        if (audio) audio.shot();
      }
    }
    if (audio) audio.siren(state.wanted > 0);
    return anyNear;
  }

  function updateBullets(dt, audio) {
    const player = state.player;
    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0) continue;
      if (!onRoad(bullet.x, bullet.y)) {
        // A bullet dies the moment it would cross a building.
        let inside = false;
        for (const b of city.buildings) {
          if (bullet.x > b.x && bullet.x < b.x + b.w && bullet.y > b.y && bullet.y < b.y + b.h) {
            inside = true;
            break;
          }
        }
        if (inside) {
          bullet.life = 0;
          burst(bullet.x, bullet.y, '#ffd76a', 4, 80);
          continue;
        }
      }
      if (bullet.from === 'player') {
        for (const ped of state.peds) {
          if (ped.state === 'down') continue;
          if (dist(bullet.x, bullet.y, ped.x, ped.y) < 14) {
            ped.state = 'down';
            ped.downTimer = 6;
            addWanted(1);
            state.stats.kills += 1;
            bullet.life = 0;
            burst(ped.x, ped.y, '#ff4f5e', 8, 120);
            break;
          }
        }
        if (bullet.life <= 0) continue;
        for (const car of state.cars) {
          if (car.driver === 'player') continue;
          if (dist(bullet.x, bullet.y, car.x, car.y) < 28) {
            car.hp -= bullet.damage;
            bullet.life = 0;
            burst(bullet.x, bullet.y, '#ffd76a', 5, 100);
            if (car.hp <= 0) {
              if (car.driver === 'police') addWanted(1);
              burst(car.x, car.y, '#ff7a3f', 26, 260);
              burst(car.x, car.y, '#555555', 14, 120);
              state.cars.splice(state.cars.indexOf(car), 1);
              if (audio) audio.crash();
            }
            break;
          }
        }
      } else if (bullet.from === 'police') {
        if (player.invuln <= 0 && dist(bullet.x, bullet.y, player.x, player.y) < 16) {
          player.health -= bullet.damage;
          bullet.life = 0;
          burst(player.x, player.y, '#ff4f5e', 6, 110);
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
  }

  function updatePickups(dt) {
    const player = state.player;
    for (const pickup of state.pickups) pickup.bob += dt * 3;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      if (dist(player.x, player.y, pickup.x, pickup.y) > 30) continue;
      if (pickup.kind === 'cash') {
        player.cash += pickup.amount;
        state.stats.earned += pickup.amount;
        if (state.missionStage === 'collect') {
          state.missionDrops -= 1;
          if (state.missionDrops <= 0) completeMission(400);
        }
      } else if (pickup.kind === 'health') {
        player.health = Math.min(PLAYER.health, player.health + pickup.amount);
      } else if (pickup.kind === 'ammo') {
        player.ammo += pickup.amount;
      }
      state.pickups.splice(i, 1);
    }
  }

  function updateWanted(dt, anyPoliceNear) {
    if (state.wanted === 0) return;
    if (anyPoliceNear) {
      state.wantedTimer = 0;
      return;
    }
    state.wantedTimer += dt;
    if (state.wantedTimer >= WANTED.decaySeconds) {
      state.wanted -= 1;
      state.wantedTimer = 0;
    }
  }

  function updateMissions(dt) {
    const player = state.player;
    const target = state.missionTarget;
    if (state.storyDone || !target) return;
    if (state.missionStage === 'steal') {
      if (player.inCar && dist(player.x, player.y, target.x, target.y) < 110) {
        completeMission(300);
      }
    } else if (state.missionStage === 'pickup') {
      if (dist(player.x, player.y, target.x, target.y) < 80) {
        state.missionStage = 'deliver';
        const p = pick(random, crossroads);
        state.missionTarget = { x: p.x, y: p.y, label: 'Drop-off' };
        state.missionTimer = 120;
        state.missionText = 'Package picked up. Deliver it — 120 seconds on the clock.';
      }
    } else if (state.missionStage === 'deliver') {
      state.missionTimer -= dt;
      if (dist(player.x, player.y, target.x, target.y) < 80) {
        completeMission(500);
      } else if (state.missionTimer <= 0) {
        failMission('Too slow — the client walked. Vex is giving you another shot.');
      }
    } else if (state.missionStage === 'heat') {
      if (state.wanted >= 2) {
        state.missionStage = 'hide';
        state.missionText = 'Heat is on. Lose the cops, then reach the hideout.';
      }
    } else if (state.missionStage === 'hide') {
      if (state.wanted === 0 && dist(player.x, player.y, target.x, target.y) < 120) {
        completeMission(600);
      }
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2 * dt;
      p.vy *= 1 - 2 * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function step(dt, input, audio) {
    state.events = 0;
    state.time += dt;
    state.flash = Math.max(0, state.flash - dt * 0.7);
    updatePlayer(dt, input, audio);
    updateTraffic(dt);
    updatePeds(dt);
    const anyNear = updatePolice(dt, audio);
    updateBullets(dt, audio);
    updatePickups(dt);
    updateWanted(dt, anyNear);
    updateMissions(dt);
    updateParticles(dt);
    // Clean up police cars when the heat is gone.
    if (state.wanted === 0) {
      state.cars = state.cars.filter((car) => car.driver !== 'police');
    }
    if (state.player.health <= 0) state.events |= EVENT_WASTED;
    return state.events;
  }

  function applyArrest() {
    const player = state.player;
    player.cash = Math.max(0, player.cash - 100);
    player.health = PLAYER.health;
    player.invuln = 2;
    state.wanted = 0;
    state.stats.busted += 1;
    if (player.inCar) {
      player.inCar.driver = 'none';
      player.inCar.kind = 'parked';
      player.inCar = null;
    }
    player.x = city.hospital.x;
    player.y = city.hospital.y;
    state.cars = state.cars.filter((car) => car.driver !== 'police');
  }

  function applyWasted() {
    const player = state.player;
    player.cash = Math.max(0, player.cash - 150);
    player.health = PLAYER.health;
    player.invuln = 2;
    state.wanted = 0;
    if (player.inCar) {
      player.inCar.driver = 'none';
      player.inCar.kind = 'parked';
      player.inCar = null;
    }
    player.x = city.hospital.x;
    player.y = city.hospital.y;
    state.cars = state.cars.filter((car) => car.driver !== 'police');
    startMission(state.missionIndex);
  }

  reset();

  return {
    state,
    step,
    reset,
    startMission,
    applyArrest,
    applyWasted,
    addWanted,
    nearestCar,
    enterCar,
    exitCar,
  };
}
