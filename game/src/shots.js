// The screenshot scenes behind ?shot=start|play|chase|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (walk to the car parked by the start, get
// in, drive the roads to the mission marker, run from the police), so the
// frame is what a short game really looks like and the same seed always
// gives the same frame.

import { STEP, WORLD } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 24;
const CHASE_SECONDS = 12;
const MISSION_SECONDS = 20;

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

/**
 * Where a car should aim next to reach (tx, ty) without cutting across
 * blocks: along its own road to the target's road, then along that road.
 * Targets are always intersections, so both legs are on roads.
 */
function roadWaypoint(car, tx, ty) {
  const vx = nearLine(car.x);
  const hy = nearLine(car.y);
  if (vx !== null && Math.abs(car.y - ty) > 50) return { x: vx, y: ty };
  if (hy !== null && Math.abs(car.x - tx) > 50) return { x: tx, y: hy };
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
    return {
      up: true,
      down: false,
      left: diff < -0.12,
      right: diff > 0.12,
      run: false,
      enter: false,
      melee: false,
      shoot: false,
    };
  };
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any name but play, chase or mission is the title scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();

  // Stage a getaway car on the player's own road, just south of the start
  // and facing north, so every scene begins with a real theft and a drive.
  const parked = state.cars.find((car) => car.kind === 'parked');
  if (parked) {
    parked.x = state.player.x;
    parked.y = state.player.y + 70;
    parked.angle = -Math.PI / 2;
  }

  if (name !== 'play' && name !== 'chase' && name !== 'mission') {
    // Title: the player walks the few steps to the staged car.
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, walkInput(state.player, parked.x, parked.y), null);
    }
    return { screen: SCREEN_TITLE };
  }

  // Every action scene starts the same way: walk to the car and steal it.
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
  if (!entered) {
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      world.step(STEP, walkInput(state.player, state.missionTarget.x, state.missionTarget.y), null);
    }
    return { screen: SCREEN_PLAY };
  }

  const drive = makeDriver();

  if (name === 'chase') {
    world.addWanted(3);
    // Flee to the intersection farthest from the nearest police car,
    // re-picking as the chase moves.
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      let nearest = null;
      let nearestD = Infinity;
      for (const car of state.cars) {
        if (car.driver !== 'police') continue;
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
    world.startMission(1);
    for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
      const target = state.missionTarget;
      if (!target) break;
      world.step(STEP, drive(state.player.inCar, target.x, target.y), null);
    }
    return { screen: SCREEN_PLAY };
  }

  // Play: drive at the mission marker (the garage), then on to the next job.
  for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
    const target = state.missionTarget;
    if (!target) break;
    world.step(STEP, drive(state.player.inCar, target.x, target.y), null);
  }
  return { screen: SCREEN_PLAY };
}
