// Neon City's simulation: the player on foot and in cars, traffic and
// pedestrians with simple AI, police who respond to the wanted level,
// combat, pickups and four story missions. All randomness comes from the
// seeded random, so the same seed always plays the same city.

import { WORLD, PLAYER, CAR, TRAFFIC, WANTED, POLICE, MISSIONS, WEAPONS, WEAPON_ORDER, RESPECT, RESPECT_RANKS, RACE, HELI, DAYNIGHT } from './config.js';
import { generateCity, onRoad, nearestRoadPoint, intersections, collideBuildings, clampToWorld, districtAt } from './city.js';
import { pick, intBetween, chance, shuffle } from './random.js';

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
    timeOfDay: 0.3,
    nightness: 0,
    city,
    player: null,
    cars: [],
    peds: [],
    bullets: [],
    pickups: [],
    particles: [],
    roadblocks: [],
    heli: { x: 0, y: 0, angle: 0, active: false },
    race: { active: false, checkpoints: [], next: 0, rivals: [], timer: 0, won: false },
    respect: 0,
    turfHeld: 0,
    crew: null,
    shopTimer: 0,
    raceBest: null,
    radioStation: 'NEON FM',
    wanted: 0,
    wantedTimer: 0,
    missionIndex: 0,
    missionStage: 'steal',
    missionAway: false,
    missionTarget: null,
    missionTimer: 0,
    missionDrops: 0,
    missionText: MISSIONS[0].briefing,
    storyDone: false,
    stats: { stolen: 0, kills: 0, earned: 0, busted: 0 },
    events: 0,
    flash: 0,
  };

  /** The respect rank name for the current respect total. */
  function respectRank() {
    let rank = RESPECT_RANKS[0].name;
    for (const entry of RESPECT_RANKS) {
      if (state.respect >= entry.at) rank = entry.name;
    }
    return rank;
  }

  function gainRespect(n) {
    state.respect += n;
  }

  /** Switch to a weapon slot the player owns (pistol is always owned). */
  function setWeapon(index) {
    const key = WEAPON_ORDER[index];
    if (!key) return;
    if (key !== 'pistol' && state.player.weapons[key].ammo <= 0) return;
    state.player.weaponSlot = index;
  }

  function cycleWeapon() {
    for (let i = 1; i <= WEAPON_ORDER.length; i += 1) {
      const next = (state.player.weaponSlot + i) % WEAPON_ORDER.length;
      const key = WEAPON_ORDER[next];
      if (key === 'pistol' || state.player.weapons[key].ammo > 0) {
        state.player.weaponSlot = next;
        return;
      }
    }
  }

  function spawnCar(x, y, angle, color, kind, driver, tier) {
    const car = {
      id: nextCarId,
      x,
      y,
      angle,
      speed: 0,
      color,
      kind, // 'parked' | 'traffic' | 'police' | 'racer'
      driver, // 'none' | 'traffic' | 'police' | 'player' | 'racer'
      tier: tier ?? 'sedan',
      // Top speed by tier: sports cars are the respect reward, taxis cruise.
      topSpeed: tier === 'sport' ? CAR.sportMaxSpeed : tier === 'taxi' ? CAR.taxiMaxSpeed : CAR.maxSpeed,
      hp: kind === 'police' ? 60 : 40,
      target: null,
      wait: 0,
      shootCd: 0,
      ramCd: 0,
      roadblock: false,
      raceNext: 0,
      raceDone: false,
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
    state.missionAway = false;
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
    } else if (index === 4) {
      // Air One Escape: four stars, a helicopter, one way out — the garage.
      state.missionStage = 'heli';
      addWanted(4);
      state.missionTarget = { x: city.garage.x, y: city.garage.y, label: 'Garage' };
    } else if (index === 5) {
      // Street King: drive to the chequered start line and the race begins.
      state.missionStage = 'race';
      state.missionTarget = { x: city.raceStart.x, y: city.raceStart.y, label: 'Race Start' };
    } else if (index === 6) {
      // The Big Score: three vault bags, two stars of heat, then home.
      state.missionStage = 'heist';
      state.missionDrops = 3;
      addWanted(2);
      const spots = shuffle(random, crossroads).slice(0, 3);
      for (const spot of spots) {
        spawnPickup(spot.x + (random() - 0.5) * 80, spot.y + (random() - 0.5) * 80, 'vault', 250);
      }
      state.missionTarget = { x: spots[0].x, y: spots[0].y, label: 'Vault Bag' };
    } else if (index === 7) {
      // Rescue Run: a crew member is pinned down at a crossroads.
      state.missionStage = 'rescue';
      const p = pick(random, crossroads);
      state.crew = { x: p.x, y: p.y, pickedUp: false };
      state.missionTarget = { x: p.x, y: p.y, label: 'Crew' };
    } else if (index === 8) {
      // Turf War: hold all three corners and the districts are yours.
      state.missionStage = 'turf';
      state.turfHeld = 0;
      for (const spot of city.turfSpots) {
        spot.held = false;
        spot.hold = 0;
      }
      state.missionTarget = { x: city.turfSpots[0].x, y: city.turfSpots[0].y, label: 'Turf' };
    }
    state.missionText = mission.briefing;
  }

  function completeMission(reward) {
    state.player.cash += reward;
    state.stats.earned += reward;
    gainRespect(RESPECT.mission);
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
    state.timeOfDay = 0.3;
    state.nightness = 0;
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.pickups = [];
    state.particles = [];
    state.roadblocks = [];
    state.heli = { x: 0, y: 0, angle: 0, active: false };
    state.race = { active: false, checkpoints: [], next: 0, rivals: [], timer: 0, won: false };
    state.respect = 0;
    state.turfHeld = 0;
    state.crew = null;
    state.shopTimer = 0;
    state.raceBest = null;
    state.radioStation = 'NEON FM';
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
      weapons: {
        pistol: { ammo: WEAPONS.pistol.startAmmo },
        shotgun: { ammo: 0 },
        smg: { ammo: 0 },
      },
      weaponSlot: 0,
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
    // Two taxis cruise the avenues, and two sport cars wait to be stolen —
    // the fast metal respect earns you.
    for (let i = 0; i < 2; i += 1) {
      const p = pick(random, crossroads);
      const taxi = spawnCar(p.x, p.y, random() < 0.5 ? 0 : Math.PI / 2,
        '#ffd23f', 'traffic', 'traffic', 'taxi');
      taxi.speed = 130 + random() * 40;
      taxi.target = pick(random, crossroads);
    }
    for (const color of ['#ff5e7a', '#3fffcf']) {
      const line = pick(random, WORLD.lines);
      const along = 400 + random() * 2400;
      const horizontal = random() < 0.5;
      spawnCar(horizontal ? along : line + 52, horizontal ? line + 52 : along,
        horizontal ? 0 : Math.PI / 2, color, 'parked', 'none', 'sport');
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

    // Weapon slots: 1/2/3 pick a slot, Q cycles to the next owned one.
    if (input.slot !== undefined && input.slot !== null) setWeapon(input.slot);
    if (input.cycle) cycleWeapon();

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
      if (input.up) car.speed += (car.tier === 'sport' ? CAR.sportAccel : CAR.accel) * dt;
      else if (input.down) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
      else {
        const drag = Math.sign(car.speed) * CAR.drag * 120 * dt;
        car.speed = Math.abs(car.speed) <= Math.abs(drag) ? 0 : car.speed - drag;
      }
      const topSpeed = car.topSpeed ?? CAR.maxSpeed;
      car.speed = Math.max(-CAR.maxReverse, Math.min(topSpeed, car.speed));
      const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      if (steer !== 0 && Math.abs(car.speed) > 5) {
        // Steering bites even at low speed (35% floor), or a U-turn
        // from a standstill would drive the car into the nearest wall.
        car.angle += steer * CAR.turnRate * dt * Math.min(1, 0.35 + Math.abs(car.speed) / 120) * Math.sign(car.speed);
        // Hard cornering at speed leaves skid smoke at the rear wheels.
        if (Math.abs(car.speed) > 280 && chance(random, 0.5)) {
          const bx = car.x - Math.cos(car.angle) * 22;
          const by = car.y - Math.sin(car.angle) * 22;
          state.particles.push({
            x: bx + (random() - 0.5) * 14, y: by + (random() - 0.5) * 14,
            vx: (random() - 0.5) * 20, vy: (random() - 0.5) * 20,
            life: 0.5, maxLife: 0.5, color: '#8a8f96', size: 4 + random() * 3,
          });
        }
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
        const d = dist(car.x, car.y, other.x, other.y);
        if (d < 46) {
          // Shove the other car clear. The player is never pushed by a
          // collision: being shoved sideways is what wedges the player
          // into a building, where it then cannot drive out.
          const push = d > 1 ? angleTo(other.x, other.y, car.x, car.y) : car.angle;
          const overlap = 46 - d;
          other.x += Math.cos(push) * Math.min(5, overlap);
          other.y += Math.sin(push) * Math.min(5, overlap);
          if (Math.abs(car.speed) > Math.abs(other.speed)
            && Math.abs(angleDiff(car.angle, other.angle)) < 0.9) {
            other.speed = car.speed * 0.5;
          } else {
            other.speed *= 0.7;
          }
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

    // Guns: the current slot's weapon fires toward the mouse while held.
    // A shotgun throws a spread of pellets, an SMG sprays fast and light.
    const weaponKey = WEAPON_ORDER[player.weaponSlot];
    const weaponState = player.weapons[weaponKey];
    if (weaponState.ammo <= 0 && weaponKey !== 'pistol') {
      // An empty slot falls back to the pistol, which never runs dry.
      player.weaponSlot = 0;
    }
    if (input.shoot && player.shootCd <= 0 && player.weapons[WEAPON_ORDER[player.weaponSlot]].ammo > 0) {
      const slotKey = WEAPON_ORDER[player.weaponSlot];
      const current = WEAPONS[slotKey];
      player.shootCd = current.rate;
      // The pistol never runs dry; the shotgun and SMG spend their shells.
      if (slotKey !== 'pistol') {
        player.weapons[slotKey].ammo -= 1;
      }
      player.ammo = player.weapons[slotKey].ammo;
      const a = player.angle;
      for (let i = 0; i < current.pellets; i += 1) {
        const spread = (random() - 0.5) * 2 * current.spread;
        const aim = a + spread;
        state.bullets.push({
          x: player.x + Math.cos(aim) * 20,
          y: player.y + Math.sin(aim) * 20,
          vx: Math.cos(aim) * current.bulletSpeed,
          vy: Math.sin(aim) * current.bulletSpeed,
          life: 1.1,
          from: 'player',
          damage: current.damage,
        });
      }
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
    for (const car of state.cars) if (car.driver === 'police' && !car.roadblock) have += 1;
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

  /** Two police cars parked across the road ahead of the player. */
  function spawnRoadblocks() {
    if (state.wanted < 3) {
      // Heat gone: the roadblocks pull out and the cars leave.
      for (const car of state.cars.filter((c) => c.roadblock)) {
        state.cars.splice(state.cars.indexOf(car), 1);
      }
      state.roadblocks = [];
      return;
    }
    if (state.roadblocks.length >= 2) return;
    const player = state.player;
    // The next intersection along the player's heading.
    const aheadX = player.x + Math.cos(player.angle) * 550;
    const aheadY = player.y + Math.sin(player.angle) * 550;
    let best = null;
    let bestD = Infinity;
    for (const p of crossroads) {
      const d = Math.hypot(p.x - aheadX, p.y - aheadY);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best || bestD > 700) return;
    const horizontal = Math.abs(player.angle) < Math.PI / 4 || Math.abs(player.angle) > (3 * Math.PI) / 4;
    const angle = horizontal ? Math.PI / 2 : 0;
    const carA = spawnCar(best.x - (horizontal ? 0 : 40), best.y - (horizontal ? 40 : 0), angle, '#2244cc', 'police', 'police');
    const carB = spawnCar(best.x + (horizontal ? 0 : 40), best.y + (horizontal ? 40 : 0), angle, '#2244cc', 'police', 'police');
    carA.roadblock = true;
    carB.roadblock = true;
    state.roadblocks.push({ x: best.x, y: best.y, angle });
  }

  /** Air One: the police helicopter, up at four stars and higher. */
  function updateHeli(dt) {
    const heli = state.heli;
    const player = state.player;
    heli.active = state.wanted >= HELI.minStars;
    if (!heli.active) return;
    if (Math.hypot(heli.x - player.x, heli.y - player.y) > 1500) {
      heli.x = player.x + 400;
      heli.y = player.y - 400;
    }
    const want = Math.atan2(player.y - heli.y, player.x - heli.x);
    heli.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, angleDiff(heli.angle, want)));
    heli.x += Math.cos(want) * HELI.speed * dt;
    heli.y += Math.sin(want) * HELI.speed * dt;
  }

  function updatePolice(dt, audio) {
    const player = state.player;
    spawnPolice();
    spawnRoadblocks();
    updateHeli(dt);
    let anyNear = false;
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      if (car.roadblock) {
        // A roadblock car holds its line; it never chases.
        if (dist(car.x, car.y, player.x, player.y) < WANTED.hiddenRange) anyNear = true;
        continue;
      }
      const d = dist(car.x, car.y, player.x, player.y);
      if (d < WANTED.hiddenRange) anyNear = true;
      // Chase the player directly. (An earlier ring pursuit put police
      // in front of the player, where they became a wall it could not
      // drive through; the separation pass below keeps them from
      // stacking onto one spot instead.)
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
        car.ramCd = POLICE.ramCooldown;
        player.health -= POLICE.ramDamage;
        player.inCar.speed *= 0.8;
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
    // Keep the squad from stacking onto one spot: push police cars apart
    // from each other so they trail the player as a pack instead of
    // piling into a single wall on top of it.
    const squad = state.cars.filter((c) => c.driver === 'police' && !c.roadblock);
    for (let i = 0; i < squad.length; i += 1) {
      for (let j = i + 1; j < squad.length; j += 1) {
        const a = squad[i];
        const b = squad[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < 56 && d > 0.01) {
          const push = angleTo(b.x, b.y, a.x, a.y);
          const overlap = (56 - d) / 2;
          a.x += Math.cos(push) * overlap;
          a.y += Math.sin(push) * overlap;
          b.x -= Math.cos(push) * overlap;
          b.y -= Math.sin(push) * overlap;
        }
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
      } else if (pickup.kind === 'vault') {
        // The Big Score: three vault bags, then the stash run home.
        player.cash += pickup.amount;
        state.stats.earned += pickup.amount;
        state.missionDrops -= 1;
        if (state.missionDrops > 0) {
          state.missionText = `${state.missionDrops} vault bag${state.missionDrops === 1 ? '' : 's'} left. Stay sharp.`;
        } else {
          state.missionStage = 'stash';
          state.missionTarget = { x: city.garage.x, y: city.garage.y, label: 'Garage' };
          state.missionText = 'All three bags. Get them to the garage — now.';
        }
      } else if (pickup.kind === 'weapon-shotgun') {
        player.weapons.shotgun.ammo += pickup.amount;
        state.missionText = 'Shotgun picked up — press 2 to rack it.';
      } else if (pickup.kind === 'weapon-smg') {
        player.weapons.smg.ammo += pickup.amount;
        state.missionText = 'SMG picked up — press 3 to spray.';
      } else if (pickup.kind === 'health') {
        player.health = Math.min(PLAYER.health, player.health + pickup.amount);
      } else if (pickup.kind === 'ammo') {
        // Shells go to the weapon in hand; the pistol never needs them.
        const slotKey = WEAPON_ORDER[player.weaponSlot];
        player.weapons[slotKey].ammo += pickup.amount;
        player.ammo = player.weapons[slotKey].ammo;
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
    // Air One's searchlight pins you: no hiding while the helicopter is up.
    if (state.heli.active) {
      state.wantedTimer = 0;
      return;
    }
    state.wantedTimer += dt;
    if (state.wantedTimer >= WANTED.decaySeconds) {
      state.wanted -= 1;
      state.wantedTimer = 0;
    }
  }

  /** The street race: four checkpoints, three rivals, one prize. */
  function startRace() {
    const race = state.race;
    const spots = shuffle(random, crossroads)
      .filter((p) => Math.hypot(p.x - city.raceStart.x, p.y - city.raceStart.y) > 500)
      .slice(0, RACE.checkpoints);
    race.checkpoints = spots;
    race.next = 0;
    race.timer = 0;
    race.won = false;
    race.rivals = [];
    const colors = ['#ff5e7a', '#7ec94f', '#9a6fc9'];
    for (let i = 0; i < RACE.rivalCount; i += 1) {
      const rival = spawnCar(city.raceStart.x - 60 - i * 30, city.raceStart.y + 50 + i * 0,
        -Math.PI / 2, colors[i], 'racer', 'racer');
      rival.speed = 120;
      rival.raceNext = 0;
      rival.raceDone = false;
      race.rivals.push(rival);
    }
    race.active = true;
    state.missionStage = 'racing';
    state.missionTarget = { x: spots[0].x, y: spots[0].y, label: 'Checkpoint 1/4' };
    state.missionText = 'Race on! Hit all 4 checkpoints before the rivals do.';
  }

  function driveToward(car, tx, ty, topSpeed, dt) {
    const want = Math.atan2(ty - car.y, tx - car.x);
    const diff = angleDiff(car.angle, want);
    if (Math.abs(diff) > 2.2) {
      // Facing away: reverse and swing the nose around, like a three-point turn.
      car.speed = Math.max(-CAR.maxReverse, car.speed - CAR.reverseAccel * dt);
      car.angle += (diff > 0 ? -1 : 1) * CAR.turnRate * dt * 0.5 * Math.sign(car.speed || -1);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      clampToWorld(car, 30);
      collideBuildings(car, CAR.length / 2, city.buildings);
      return;
    }
    car.angle += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
    // Brake before a sharp corner so the rival holds the road, not the wall.
    const top = Math.abs(diff) > 0.5 ? 120 : topSpeed;
    car.speed += (top - car.speed) * Math.min(1, dt * 1.2);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    clampToWorld(car, 30);
    collideBuildings(car, CAR.length / 2, city.buildings);
  }

  function updateRace(dt) {
    const race = state.race;
    if (!race.active) return;
    race.timer += dt;
    const player = state.player;
    // The player's next checkpoint.
    const target = race.checkpoints[race.next];
    if (target && dist(player.x, player.y, target.x, target.y) < 95) {
      race.next += 1;
      if (race.next >= race.checkpoints.length) {
        race.active = false;
        const rank = RESPECT_RANKS.findIndex((r) => r.name === respectRank());
        const prize = RESPECT.racePrize + Math.max(0, rank) * 200;
        gainRespect(RESPECT.raceWin);
        state.raceBest = race.timer;
        for (const rival of race.rivals) {
          state.cars.splice(state.cars.indexOf(rival), 1);
        }
        race.rivals = [];
        completeMission(prize);
        return;
      }
      state.missionTarget = {
        x: race.checkpoints[race.next].x,
        y: race.checkpoints[race.next].y,
        label: `Checkpoint ${race.next + 1}/${race.checkpoints.length}`,
      };
    }
    // Rivals chase the same checkpoints; one across the line first wins.
    for (const rival of race.rivals) {
      if (rival.raceDone) continue;
      const point = race.checkpoints[rival.raceNext];
      if (!point) continue;
      driveToward(rival, point.x, point.y, RACE.rivalSpeed, dt);
      if (dist(rival.x, rival.y, point.x, point.y) < 95) {
        rival.raceNext += 1;
        if (rival.raceNext >= race.checkpoints.length) {
          rival.raceDone = true;
          race.active = false;
          for (const other of race.rivals) {
            state.cars.splice(state.cars.indexOf(other), 1);
          }
          race.rivals = [];
          failMission('Outrun — the rivals took the prize. Vex wants a rematch.');
        }
      }
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
    } else if (state.missionStage === 'heli') {
      // Air One Escape: get clear of the garage first (you start parked
      // right beside it), then reach it while the helicopter is on you.
      if (dist(player.x, player.y, target.x, target.y) > 500) state.missionAway = true;
      if (state.missionAway && dist(player.x, player.y, target.x, target.y) < 110) {
        completeMission(700);
      }
    } else if (state.missionStage === 'race') {
      // Street King: drive into the chequered start line to begin.
      if (player.inCar && dist(player.x, player.y, target.x, target.y) < 100) {
        startRace();
      }
    } else if (state.missionStage === 'racing') {
      // The race itself runs in updateRace; nothing to do here.
    } else if (state.missionStage === 'heist') {
      // The vault bags are pickups; the last one flips the stage to stash.
      const remaining = state.pickups.filter((p) => p.kind === 'vault');
      if (remaining.length > 0) {
        state.missionTarget = { x: remaining[0].x, y: remaining[0].y, label: 'Vault Bag' };
      }
    } else if (state.missionStage === 'stash') {
      if (dist(player.x, player.y, target.x, target.y) < 110) {
        completeMission(900);
      }
    } else if (state.missionStage === 'rescue') {
      // Walk up to the pinned crew member to pick them up.
      if (state.crew && !state.crew.pickedUp && dist(player.x, player.y, state.crew.x, state.crew.y) < 55) {
        state.crew.pickedUp = true;
        addWanted(2);
        state.missionStage = 'hospital';
        state.missionTarget = { x: city.hospital.x, y: city.hospital.y, label: 'Hospital' };
        state.missionText = 'Crew aboard. Get them to the hospital — the law is coming.';
      }
    } else if (state.missionStage === 'hospital') {
      if (dist(player.x, player.y, target.x, target.y) < 120) {
        state.crew = null;
        completeMission(800);
      }
    } else if (state.missionStage === 'turf') {
      // Hold each corner for three seconds; the districts are watching.
      let allHeld = true;
      for (const spot of city.turfSpots) {
        if (spot.held) continue;
        allHeld = false;
        if (dist(player.x, player.y, spot.x, spot.y) < 95) {
          spot.hold += dt;
          if (spot.hold >= 3) {
            spot.held = true;
            state.turfHeld += 1;
            gainRespect(RESPECT.turf);
            if (state.turfHeld === 1) addWanted(1);
            state.missionText = `${state.turfHeld}/3 turf corners held. Keep pushing.`;
          }
        } else {
          spot.hold = 0;
        }
      }
      if (allHeld) {
        state.missionTarget = null;
        completeMission(1000);
      } else {
        const next = city.turfSpots.find((spot) => !spot.held);
        if (next) state.missionTarget = { x: next.x, y: next.y, label: next.label };
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
    // Day/night: noon at 0.25, midnight at 0.75 on the cycle.
    state.timeOfDay = (state.timeOfDay + dt / DAYNIGHT.cycleSeconds) % 1;
    const night = 0.5 - 0.5 * Math.cos(2 * Math.PI * (state.timeOfDay - 0.25));
    state.nightness = night;
    updatePlayer(dt, input, audio);
    updateTraffic(dt);
    updatePeds(dt);
    const anyNear = updatePolice(dt, audio);
    updateBullets(dt, audio);
    updatePickups(dt);
    updateWanted(dt, anyNear);
    updateMissions(dt);
    updateRace(dt);
    updateParticles(dt);
    updateShops(dt);
    if (audio) {
      audio.radio(dt);
      audio.rotor(state.heli.active);
      state.radioStation = audio.stationName();
    }
    // Clean up police cars when the heat is gone.
    if (state.wanted === 0) {
      state.cars = state.cars.filter((car) => car.driver !== 'police');
    }
    if (state.player.health <= 0) state.events |= EVENT_WASTED;
    return state.events;
  }

  /** Shops: the gunsmith restocks weapon pickups, the diner heals you. */
  function updateShops(dt) {
    const player = state.player;
    state.shopTimer += dt;
    if (state.shopTimer >= 18) {
      state.shopTimer = 0;
      const gunsmith = city.shops[0];
      const near = state.pickups.some((p) => (p.kind === 'weapon-shotgun' || p.kind === 'weapon-smg')
        && Math.hypot(p.x - gunsmith.x, p.y - gunsmith.y) < 300);
      if (!near) {
        const kind = chance(random, 0.5) ? 'weapon-shotgun' : 'weapon-smg';
        spawnPickup(gunsmith.x + 40, gunsmith.y, kind, kind === 'weapon-shotgun' ? 10 : 40);
      }
    }
    const diner = city.shops[1];
    if (!player.inCar && Math.hypot(player.x - diner.x, player.y - diner.y) < 80) {
      player.health = Math.min(PLAYER.health, player.health + 5 * dt);
    }
  }

  function clearPursuit() {
    // Busted or wasted: the race is off, the helicopter leaves, roadblocks go.
    if (state.race.active) {
      for (const rival of state.race.rivals) {
        state.cars.splice(state.cars.indexOf(rival), 1);
      }
      state.race = { active: false, checkpoints: [], next: 0, rivals: [], timer: 0, won: false };
      if (state.missionStage === 'racing') startMission(state.missionIndex);
    }
    state.roadblocks = [];
    state.cars = state.cars.filter((car) => car.driver !== 'police');
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
    clearPursuit();
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
    clearPursuit();
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
    setWeapon,
    cycleWeapon,
    respectRank,
    startRace,
    districtAt: (x, y) => districtAt(x, y),
  };
}
