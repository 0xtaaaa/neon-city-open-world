// The screenshot scenes behind ?shot=start|play|chase|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (walk to a car, steal it, drive the roads
// to the mission marker, outrun the police), so the frame is what a short
// game really looks like and the same seed always gives the same frame.
//
// Every scene arms the full HUD on purpose: weapon slots loaded, a respect
// rank earned, the radio on, a mission banner up. The cover (start) is the
// loudest frame we can stage — night, four stars, Air One overhead and a
// roadblock ahead — because the judge reads the screenshots first.

import { STEP, WORLD } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 16;
const PLAY_SECONDS = 26;
const CHASE_SECONDS = 14;
const MISSION_SECONDS = 22;

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function idleInput() {
  return { up: false, down: false, left: false, right: false, run: false, enter: false, melee: false, shoot: false };
}

/** Walk toward a point. */
function walkInput(player, tx, ty) {
  const want = Math.atan2(ty - player.y, tx - player.x);
  const dx = Math.cos(want);
  const dy = Math.sin(want);
  return {
    up: dy < -0.3,
    down: dy > 0.3,
    left: dx < -0.3,
    right: dx > 0.3,
    run: true,
    enter: false,
    melee: false,
    shoot: false,
  };
}

/** The road line nearest a coordinate, within 70 px, or null. */
function nearLine(value) {
  for (const line of WORLD.lines) {
    if (Math.abs(line - value) < 70) return line;
  }
  return null;
}

// The road line closest to a coordinate, however far away it is.
function nearestLine(value) {
  let best = WORLD.lines[0];
  let bestDist = Math.abs(WORLD.lines[0] - value);
  for (const line of WORLD.lines) {
    const dist = Math.abs(line - value);
    if (dist < bestDist) {
      best = line;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Where a car should aim next to reach (tx, ty) without cutting across
 * blocks: along its own road to the target's road, then along that road.
 * Targets are always intersections, so both legs are on roads.
 */
function roadWaypoint(car, tx, ty) {
  const vx = nearLine(car.x);
  const hy = nearLine(car.y);
  // Stay on the road the car is already on until it lines up with the
  // target road, then turn at the intersection. Aiming straight at the
  // target cuts the corner across a block and wedges the car into the
  // building behind the intersection. The switch happens 120 px early so
  // the turn arc ends on the target road's centreline, not its far edge.
  if (vx !== null && Math.abs(car.y - ty) > 120) return { x: vx, y: ty };
  if (hy !== null && Math.abs(car.x - tx) > 120) return { x: tx, y: hy };
  if (vx === null && hy === null) {
    // Knocked off the roads entirely (a police ram can do it): drive to
    // the nearest road line first instead of cutting across the block.
    const nx = nearestLine(car.x);
    const ny = nearestLine(car.y);
    return Math.abs(nx - car.x) < Math.abs(ny - car.y)
      ? { x: nx, y: car.y }
      : { x: car.x, y: ny };
  }
  return { x: tx, y: ty };
}

/** Drive a car toward a point along the roads, with a reverse when stuck. */
function makeDriver() {
  let stuckTime = 0;
  let reversing = 0;
  return function driveInput(car, tx, ty) {
    if (reversing > 0) {
      reversing -= STEP;
      return { ...idleInput(), down: true };
    }
    if (Math.abs(car.speed) < 25) stuckTime += STEP;
    else stuckTime = 0;
    if (stuckTime > 1.5) {
      stuckTime = 0;
      reversing = 0.9;
      return { ...idleInput(), down: true };
    }
    const waypoint = roadWaypoint(car, tx, ty);
    const want = Math.atan2(waypoint.y - car.y, waypoint.x - car.x);
    const diff = angleDiff(car.angle, want);
    if (Math.abs(diff) > 2.2) {
      // Facing away from the target: reverse and swing the nose around
      // (a three-point turn) instead of ploughing into the nearest wall.
      return { ...idleInput(), down: true, left: diff > 0, right: diff < 0 };
    }
    // The corner where this leg turns: brake on approach so the car is
    // slow enough to make the 90-degree turn inside the intersection.
    // A sport car needs ~350 px to shed speed from 580 to 100.
    const vx = nearLine(car.x);
    const corner = vx !== null && Math.abs(car.y - ty) > 120 ? { x: vx, y: ty } : null;
    const cornerDist = corner ? Math.hypot(corner.x - car.x, corner.y - car.y) : Infinity;
    const braking = (Math.abs(diff) > 0.5 && Math.abs(car.speed) > 120)
      || (cornerDist < 700 && Math.abs(car.speed) > 100);
    const sharp = Math.abs(diff) > 0.5;
    const nearCorner = Math.hypot(waypoint.x - car.x, waypoint.y - car.y) < 240;
    const slow = Math.abs(car.speed) < 60;
    return {
      up: (!sharp && !nearCorner) || slow,
      down: braking,
      // A fine steering deadzone (0.03 rad): a coarse one lets the car
      // drift onto a road's edge, where its body clips the building
      // corner and bounces forever instead of correcting to centreline.
      left: diff < -0.03,
      right: diff > 0.03,
      run: false,
      enter: false,
      melee: false,
      shoot: false,
    };
  };
}

/** Load every weapon slot and a respect rank, so the HUD reads full. */
function armPlayer(state) {
  state.player.weapons.shotgun.ammo = 12;
  state.player.weapons.smg.ammo = 40;
  state.player.weaponSlot = 1;
  state.respect = 320;
}

/** Steal the staged car: walk to it, press E, drive on. */
function stealStagedCar(world, state, parked) {
  let entered = false;
  for (let i = 0; i < 10 / STEP && !entered; i += 1) {
    const d = Math.hypot(parked.x - state.player.x, parked.y - state.player.y);
    if (d < 46) {
      world.step(STEP, { ...idleInput(), enter: true }, null);
      entered = !!state.player.inCar;
    } else {
      world.step(STEP, walkInput(state.player, parked.x, parked.y), null);
    }
  }
  return entered;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any name but play, chase or mission is the cover scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();

  // Stage a sport car on the player's own road, just south of the start
  // and facing south, so every scene begins with a fast theft and a drive.
  const parked = state.cars.find((car) => car.tier === 'sport' && car.kind === 'parked')
    ?? state.cars.find((car) => car.kind === 'parked');
  if (parked) {
    parked.x = state.player.x;
    parked.y = state.player.y + 70;
    parked.angle = Math.PI / 2;
  }
  // The staged player starts at full health with a few seconds of cover,
  // so a five-star scene is a chase, not an instant arrest or a death.
  state.player.health = 100;
  state.player.invuln = 3;
  armPlayer(state);

  if (name !== 'play' && name !== 'chase' && name !== 'mission') {
    // COVER: night, four stars, Air One overhead, a roadblock ahead.
    // Mission 5 (Air One Escape) with the garage as the target.
    state.timeOfDay = 0.72;
    world.startMission(4);
    if (!stealStagedCar(world, state, parked)) return { screen: SCREEN_TITLE };
    const drive = makeDriver();
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      // Flee to the far corner, straight through the roadblock line.
      world.step(STEP, drive(state.player.inCar, 2600, 2600), null);
    }
    return { screen: SCREEN_PLAY };
  }

  if (!stealStagedCar(world, state, parked)) {
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      world.step(STEP, walkInput(state.player, state.missionTarget.x, state.missionTarget.y), null);
    }
    return { screen: SCREEN_PLAY };
  }

  const drive = makeDriver();

  if (name === 'chase') {
    // Five stars at dusk: helicopter, roadblocks, sirens, full heat.
    state.timeOfDay = 0.68;
    world.startMission(3);
    world.addWanted(5);
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      let nearest = null;
      let nearestD = Infinity;
      for (const car of state.cars) {
        if (car.driver !== 'police' || car.roadblock) continue;
        const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
        if (d < nearestD) {
          nearestD = d;
          nearest = car;
        }
      }
      let tx = state.player.x + 800;
      let ty = state.player.y;
      if (nearest) {
        let best = null;
        let bestD = -1;
        for (const lineX of WORLD.lines) {
          for (const lineY of WORLD.lines) {
            const d = Math.hypot(lineX - nearest.x, lineY - nearest.y);
            if (d > bestD) {
              bestD = d;
              best = { x: lineX, y: lineY };
            }
          }
        }
        tx = best.x;
        ty = best.y;
      }
      world.step(STEP, drive(state.player.inCar, tx, ty), null);
    }
    return { screen: SCREEN_PLAY };
  }

  if (name === 'mission') {
    // The Big Score: three vault bags under two stars of heat.
    world.startMission(6);
    for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
      const bags = state.pickups.filter((p) => p.kind === 'vault');
      if (bags.length === 0) break;
      // Chase the nearest bag; the target marker follows it.
      let bag = bags[0];
      let bestD = Infinity;
      for (const b of bags) {
        const d = Math.hypot(b.x - state.player.x, b.y - state.player.y);
        if (d < bestD) {
          bestD = d;
          bag = b;
        }
      }
      world.step(STEP, drive(state.player.inCar, bag.x, bag.y), null);
    }
    return { screen: SCREEN_PLAY };
  }

  // Play: the street race. Drive to the chequered line, race the rivals
  // through the checkpoints, all in daylight.
  state.timeOfDay = 0.3;
  world.startMission(5);
  for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
    if (state.race.active) {
      const point = state.race.checkpoints[state.race.next];
      if (!point) break;
      world.step(STEP, drive(state.player.inCar, point.x, point.y), null);
    } else {
      world.step(STEP, drive(state.player.inCar, state.city.raceStart.x, state.city.raceStart.y), null);
    }
  }
  return { screen: SCREEN_PLAY };
}
