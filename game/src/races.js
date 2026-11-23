// Neon City — street races: a checkpoint loop around the city against
// three AI rivals, with laps, positions and a prize. Rivals follow the
// checkpoint waypoints with rubber-banding so races stay close.

import { CFG } from './config.js';
import { makeCar } from './vehicles.js';
import { toast } from './entities.js';
import { sfx } from './audio.js';

// The race loop: a rounded rectangle of checkpoints on the road grid.
export function raceCheckpoints() {
  const pts = [];
  const corners = [
    { x: 600, y: 600 }, { x: 3000, y: 600 },
    { x: 3000, y: 3000 }, { x: 600, y: 3000 },
  ];
  for (let c = 0; c < 4; c++) {
    const a = corners[c], b = corners[(c + 1) % 4];
    for (let t = 0; t < 3; t++) {
      const f = t / 3;
      pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    }
  }
  return pts;
}

export function startRace(S, opts) {
  const checkpoints = raceCheckpoints();
  const start = { x: 600, y: 660 };
  const rivals = [];
  const colors = ['#ff2e63', '#08d9d6', '#f9ed69'];
  const names = ['Rex', 'Dana', 'Kiko'];
  for (let i = 0; i < 3; i++) {
    const car = makeCar(S, start.x - 60 - i * 0, start.y + (i - 1) * 50, 0, {
      kind: 'sport', color: colors[i], driver: 'rival',
      maxSpeed: 500 + i * 25, accel: 460,
    });
    car.rivalName = names[i];
    car.wp = 1;
    car.raceLap = 0;
    rivals.push(car);
  }
  S.race = {
    checkpoints,
    lap: 1,
    totalLaps: opts.laps || 2,
    nextCp: 1,
    rivals,
    prize: opts.prize ?? CFG.RACE_WIN,
    entry: opts.prize === undefined ? CFG.RACE_ENTRY : 0,
    onWin: opts.onWin || null,
    onLose: opts.onLose || null,
    finished: false,
    countdown: 3,
    startTime: S.time,
  };
  // Put the player in a race car at the start line.
  const p = S.player;
  if (p.onFoot) {
    const car = makeCar(S, start.x, start.y, 0, {
      kind: 'sport', color: p.paint, driver: 'player', maxSpeed: 560, accel: 480,
    });
    p.onFoot = false;
    p.car = car;
    p.x = car.x; p.y = car.y;
  } else if (p.car) {
    p.car.x = start.x; p.car.y = start.y; p.car.angle = 0; p.car.speed = 0;
    p.x = start.x; p.y = start.y;
  }
  toast(S, 'Race starts in 3… get ready!', '#ffd166');
  sfx.mission();
}

// Advance the race: countdown, checkpoints, laps, rival AI, finish.
export function updateRace(S, dt) {
  const r = S.race;
  if (!r) return;
  const p = S.player;

  if (r.countdown > 0) {
    r.countdown -= dt;
    if (r.countdown <= 0) {
      toast(S, 'GO!', '#7bd389');
      sfx.mission();
    }
    return;
  }

  // The player's race car was destroyed — rebuild it at the last
  // checkpoint so the race never strands them on foot.
  if (p.onFoot && !p.car) {
    const cp = r.checkpoints[Math.max(0, r.nextCp - 1)];
    const car = makeCar(S, cp.x, cp.y, 0, {
      kind: 'sport', color: p.paint, driver: 'player', maxSpeed: 560, accel: 480,
    });
    p.onFoot = false;
    p.car = car;
    p.x = car.x; p.y = car.y;
    toast(S, 'Your race car was rebuilt — get back in it!', '#ffd166');
  }

  // Player checkpoint progress.
  const cp = r.checkpoints[r.nextCp];
  const car = p.car;
  const px = car ? car.x : p.x;
  const py = car ? car.y : p.y;
  if (cp && Math.hypot(px - cp.x, py - cp.y) < 70) {
    r.nextCp++;
    sfx.pickup();
    if (r.nextCp >= r.checkpoints.length) {
      r.nextCp = 0;
      r.lap++;
      if (r.lap > r.totalLaps) {
        finishRace(S, true);
        return;
      }
      toast(S, 'Lap ' + r.lap + '/' + r.totalLaps, '#fff');
    }
  }

  // Rival AI: drive to their next waypoint, rubber-band to the player.
  for (const rival of r.rivals) {
    if (rival.dead) continue;
    const wp = r.checkpoints[rival.wp];
    const d = Math.hypot(rival.x - wp.x, rival.y - wp.y);
    if (d < 70) {
      rival.wp++;
      if (rival.wp >= r.checkpoints.length) {
        rival.wp = 0;
        rival.raceLap++;
        if (rival.raceLap >= r.totalLaps) {
          finishRace(S, false, rival.rivalName);
          return;
        }
      }
    }
    // Rubber-banding: rivals behind the player go faster.
    const playerCp = r.nextCp + (r.lap - 1) * r.checkpoints.length;
    const rivalCp = rival.wp + rival.raceLap * r.checkpoints.length;
    const behind = playerCp - rivalCp;
    const target = 470 + Math.max(0, Math.min(4, behind)) * 30 - Math.max(0, -behind) * 20;
    const targetAngle = Math.atan2(wp.y - rival.y, wp.x - rival.x);
    const diff = ((targetAngle - rival.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const steer = Math.max(-1, Math.min(1, diff * 1.6));
    rival.speed += (target - rival.speed) * Math.min(1, dt * 1.2);
    rival.angle += steer * 2.4 * Math.min(1, Math.abs(rival.speed) / 120) * dt;
    rival.x += Math.cos(rival.angle) * rival.speed * dt;
    rival.y += Math.sin(rival.angle) * rival.speed * dt;
  }
}

function finishRace(S, won, winnerName) {
  const r = S.race;
  if (!r || r.finished) return;
  r.finished = true;
  // Remove rival cars.
  for (const rival of r.rivals) rival.dead = true;
  S.cars = S.cars.filter((c) => c.driver !== 'rival' || !c.dead);
  const onWin = r.onWin, onLose = r.onLose;
  const prize = r.prize;
  S.race = null;
  if (won) {
    if (prize > 0) {
      S.money += prize;
      S.respect += 60;
      S.stats.racesWon++;
      toast(S, 'Race won! +$' + prize + '  +60 respect', '#ffd166');
      sfx.mission();
    } else {
      toast(S, 'Race won!', '#ffd166');
      sfx.mission();
    }
    if (onWin) onWin();
  } else {
    toast(S, (winnerName || 'A rival') + ' won the race.', '#ff6b6b');
    sfx.fail();
    if (onLose) onLose();
  }
}

// Current race position (1st-4th) for the HUD.
export function racePosition(S) {
  const r = S.race;
  if (!r) return 0;
  const playerCp = r.nextCp + (r.lap - 1) * r.checkpoints.length;
  let pos = 1;
  for (const rival of r.rivals) {
    const rivalCp = rival.wp + rival.raceLap * r.checkpoints.length;
    if (rivalCp > playerCp) pos++;
  }
  return pos;
}
