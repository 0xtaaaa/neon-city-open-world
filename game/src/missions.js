// Neon City — the story: 10 missions with dialogue, objectives and
// rewards. Missions unlock in order and are gated by respect rank. Each
// mission is a small step machine: goto, collect, kill, deliver, hold,
// tail, chase, race and escape steps.

import { CFG, rankIndex, clamp } from './config.js';
import { addWanted } from './state.js';
import { toast } from './entities.js';
import { makeCar } from './vehicles.js';
import { startRace } from './races.js';
import { nearestRoadPoint } from './world.js';
import { rand } from './random.js';
import { sfx } from './audio.js';

// Landmark positions (shop doors), shared with world.js shop layout.
function shopPos(S, kind) {
  const s = S.shops.find((x) => x.kind === kind);
  return s ? { x: s.x, y: s.y } : { x: 600, y: 600 };
}

export const MISSIONS = [
  {
    id: 'fresh-start', name: 'Fresh Off the Bus', gate: 0, reward: 200, respect: 40,
    giver: 'Vinnie',
    intro: [
      'Vinnie: "Fresh meat. You picked the right city, kid — Neon City pays anyone brave enough to take it."',
      'Vinnie: "First job is easy. Get to the safehouse on the south side. That is home now. Do not get cute on the way."',
    ],
    steps: [
      { type: 'goto', at: 'hideout', text: 'Reach the safehouse' },
    ],
  },
  {
    id: 'pickup', name: 'The Pickup', gate: 0, reward: 350, respect: 60,
    giver: 'Vinnie',
    intro: [
      'Vinnie: "A package is waiting at the Harbor Warehouse. Bring it to Club Mirage. No detours, no heroes."',
      'Vinnie: "Walk in, grab the case, walk out. The club pays on delivery."',
    ],
    steps: [
      { type: 'collect', at: 'warehouse', count: 1, item: 'package', text: 'Collect the package at the warehouse' },
      { type: 'deliver', at: 'club', text: 'Deliver the package to Club Mirage' },
    ],
  },
  {
    id: 'getaway', name: 'Getaway Driver', gate: 0, reward: 500, respect: 80,
    giver: 'Mara',
    intro: [
      'Mara: "The corner store on 5th has a safe full of Friday cash. I trip the alarm, you drive."',
      'Mara: "Cops will be on you in seconds. Lose them, then bring the car to the safehouse. Do not scratch the paint."',
    ],
    steps: [
      { type: 'goto', at: 'diner', text: 'Reach the corner store' },
      { type: 'escape', text: 'Lose the cops, then reach the safehouse', to: 'hideout' },
    ],
  },
  {
    id: 'qualifier', name: 'Street King Qualifier', gate: 1, reward: 600, respect: 100,
    giver: 'Rex',
    intro: [
      'Rex: "You drive? Prove it. Street race, three laps, three rivals. Win and the street knows your name."',
      'Rex: "Entry is on me this time. Beat them and the purse is yours."',
    ],
    steps: [
      { type: 'race', laps: 2, text: 'Win the street race (2 laps)' },
    ],
  },
  {
    id: 'informant', name: 'The Informant', gate: 1, reward: 800, respect: 120,
    giver: 'Mara',
    intro: [
      'Mara: "A snitch is driving a blue sedan across town, talking to the feds. Follow him. Do not let him see you."',
      'Mara: "Stay close but not too close. When he stops, end it. Quietly."',
    ],
    steps: [
      { type: 'tail', text: 'Tail the snitch — stay close, stay unseen' },
      { type: 'kill', count: 1, kind: 'snitch', text: 'Take out the snitch' },
    ],
  },
  {
    id: 'warehouse-heist', name: 'Warehouse Heist', gate: 2, reward: 1200, respect: 150,
    giver: 'Vinnie',
    intro: [
      'Vinnie: "The warehouse guards three crates of hardware worth a fortune. The fence pays cash on delivery."',
      'Vinnie: "Four guards, all armed. Take the crates, then bring them to the safehouse. Fast and loud beats slow and dead."',
    ],
    steps: [
      { type: 'collect', at: 'warehouse', count: 3, item: 'crate', text: 'Steal 3 crates from the warehouse' },
      { type: 'deliver', at: 'hideout', text: 'Deliver the crates to the safehouse' },
    ],
  },
  {
    id: 'heat-wave', name: 'Heat Wave', gate: 2, reward: 900, respect: 130,
    giver: 'Rex',
    intro: [
      'Rex: "The whole department is on the street tonight. Three stars, and they want you specifically."',
      'Rex: "Survive sixty seconds under the heat, then vanish. If you can do that, you are untouchable."',
    ],
    steps: [
      { type: 'survive', seconds: 60, stars: 3, text: 'Survive 60 seconds at 3 stars, then lose the cops' },
    ],
  },
  {
    id: 'bank-job', name: 'The Bank Job', gate: 3, reward: 2000, respect: 200,
    giver: 'Mara',
    intro: [
      'Mara: "Neon Bank. The vault opens for twelve seconds while the drill works. The whole city will hear it."',
      'Mara: "Hold the vault, grab the cash, and do not stop running until the heat is gone."',
    ],
    steps: [
      { type: 'hold', at: 'bank', seconds: 12, text: 'Hold the vault while the drill works (12s)' },
      { type: 'escape', text: 'Escape with the cash — lose the cops at the safehouse', to: 'hideout' },
    ],
  },
  {
    id: 'betrayal', name: 'The Betrayal', gate: 3, reward: 1800, respect: 220,
    giver: 'Vinnie',
    intro: [
      'Vinnie: "One of ours sold us out. Six hitmen are coming for you, and the rat is driving away in a yellow sportscar."',
      'Vinnie: "Deal with the hitmen. Then run the rat off the road. Make it loud."',
    ],
    steps: [
      { type: 'kill', count: 6, kind: 'hitman', text: 'Take out 6 hitmen' },
      { type: 'chase', text: 'Run the traitor off the road' },
    ],
  },
  {
    id: 'legend', name: 'Legend of Neon City', gate: 4, reward: 5000, respect: 400,
    giver: 'Mara',
    intro: [
      'Mara: "Last one, kid. Win the championship race, then the whole department comes down — five stars."',
      'Mara: "Win the race, lose the heat, and nobody in this city forgets your name again."',
    ],
    steps: [
      { type: 'race', laps: 3, text: 'Win the championship race (3 laps)' },
      { type: 'escape', stars: 5, text: 'Lose a 5-star wanted level', to: 'hideout' },
    ],
  },
];

// Where the next mission's contact waits.
export function nextMissionMarker(S) {
  const idx = S.completedMissions.length;
  if (idx >= MISSIONS.length) return null;
  const m = MISSIONS[idx];
  const spots = {
    'fresh-start': 'hideout', pickup: 'warehouse', getaway: 'diner',
    qualifier: 'hideout', informant: 'club', 'warehouse-heist': 'warehouse',
    'heat-wave': 'hideout', 'bank-job': 'bank', betrayal: 'hideout', legend: 'club',
  };
  const pos = shopPos(S, spots[m.id] || 'hideout');
  return { x: pos.x, y: pos.y + 40, mission: m };
}

// Can the player start the next mission (respect gate)?
export function nextMissionAvailable(S) {
  const idx = S.completedMissions.length;
  if (idx >= MISSIONS.length) return { ok: false, reason: 'All missions complete.' };
  const m = MISSIONS[idx];
  if (rankIndex(S.respect) < m.gate) {
    return { ok: false, reason: 'Needs respect rank ' + CFG.RANKS[m.gate].name + ' (you are ' + CFG.RANKS[rankIndex(S.respect)].name + ').' };
  }
  return { ok: true, mission: m };
}

export function startMission(S, idx) {
  const m = MISSIONS[idx];
  S.missionIndex = idx;
  S.missionStep = 0;
  S.missionData = { killsAtStart: S.stats.kills, timer: 0, collected: 0, hold: 0, spotted: 0, lost: 0 };
  S.objectiveText = '';
  showDialogue(S, m.giver, m.intro, () => setupStep(S));
  sfx.mission();
}

export function showDialogue(S, speaker, lines, onDone) {
  S.dialogue = { speaker, lines, i: 0, chars: 0, onDone, done: false };
  S.mode = 'dialogue';
}

// Advance the dialogue (E / click). Returns true when finished.
export function advanceDialogue(S) {
  const d = S.dialogue;
  if (!d) return true;
  const line = d.lines[d.i];
  if (d.chars < line.length) {
    d.chars = line.length; // complete the line instantly
    return false;
  }
  d.i++;
  d.chars = 0;
  if (d.i >= d.lines.length) {
    const cb = d.onDone;
    S.dialogue = null;
    S.mode = 'playing';
    if (cb) cb();
    return true;
  }
  return false;
}

// Set up the current step: spawn what it needs.
export function setupStep(S) {
  const m = MISSIONS[S.missionIndex];
  if (!m) return; // stale onDone (mission already finished) — ignore.
  const step = m.steps[S.missionStep];
  const d = S.missionData;
  d.timer = 0; d.collected = 0; d.hold = 0; d.spotted = 0; d.lost = 0;
  d.killsAtStart = S.stats.kills;
  S.objectiveText = step.text;

  if (step.type === 'collect') {
    const pos = shopPos(S, step.at);
    for (let i = 0; i < step.count; i++) {
      S.pickups.push({
        kind: step.item, x: pos.x + rand(-70, 70), y: pos.y + rand(50, 130),
        r: 14, mission: true, bob: rand(0, 6),
      });
    }
  }
  if (step.type === 'kill' && step.kind === 'hitman') {
    for (let i = 0; i < step.count + 2; i++) {
      spawnHitman(S);
    }
  }
  if (step.type === 'tail') {
    const rp = nearestRoadPoint(S, S.player.x + 500, S.player.y);
    const car = makeCar(S, rp.x, rp.y, 0, {
      kind: 'sedan', color: '#2980b9', driver: 'target', maxSpeed: 300,
    });
    d.targetCar = car;
    d.tailTime = 0;
  }
  if (step.type === 'chase') {
    const rp = nearestRoadPoint(S, S.player.x + 420, S.player.y + 120);
    const car = makeCar(S, rp.x, rp.y, 0, {
      kind: 'sport', color: '#f9ed69', driver: 'target', maxSpeed: 580, accel: 480,
    });
    d.targetCar = car;
  }
  if (step.type === 'race') {
    startRace(S, {
      laps: step.laps, prize: 0,
      onWin: () => { completeStep(S); },
      onLose: () => { toast(S, 'Race lost — try again (F at the race marker).', '#ff6b6b'); failStep(S); },
    });
    return;
  }
  if (step.type === 'escape' || step.type === 'survive') {
    const stars = step.stars || (S.missionIndex === 2 ? 2 : 3);
    addWanted(S, stars === 2 ? 40 : stars === 3 ? 60 : stars === 5 ? 100 : 40);
  }
  updateObjectiveMarker(S);
}

function spawnHitman(S) {
  const p = S.player;
  const a = rand(0, Math.PI * 2);
  const x = clamp(p.x + Math.cos(a) * rand(260, 420), 60, CFG.WORLD_W - 60);
  const y = clamp(p.y + Math.sin(a) * rand(260, 420), 60, CFG.WORLD_H - 60);
  S.peds.push({
    x, y, angle: 0, speed: 120, shirt: '#222', skin: '#e0ac69',
    hp: 50, state: 'walk', kind: 'hitman', fireTimer: rand(0.5, 1.5), dead: false,
  });
}

// Objective marker position for the HUD / minimap.
export function updateObjectiveMarker(S) {
  const m = MISSIONS[S.missionIndex];
  if (!m) { S.objectiveText = ''; return; }
  const step = m.steps[S.missionStep];
  if (!step) return;
  let pos = null;
  if (step.at) pos = shopPos(S, step.at);
  if (step.to) pos = shopPos(S, step.to);
  if (step.type === 'tail' || step.type === 'chase') {
    if (S.missionData && S.missionData.targetCar) {
      pos = { x: S.missionData.targetCar.x, y: S.missionData.targetCar.y };
    }
  }
  if (step.type === 'race') pos = { x: 600, y: 1400 };
  S.objectivePos = pos;
  S.objectiveText = step.text;
}
// ---- Mission runtime (continued) ----

// Advance the active mission one frame.
export function updateMission(S, dt) {
  if (S.missionIndex < 0) return;
  const m = MISSIONS[S.missionIndex];
  const step = m.steps[S.missionStep];
  if (!step) return;
  const d = S.missionData;
  const p = S.player;

  switch (step.type) {
    case 'goto': {
      const pos = shopPos(S, step.at);
      if (Math.hypot(p.x - pos.x, p.y - pos.y) < 70) completeStep(S);
      break;
    }
    case 'deliver': {
      const pos = shopPos(S, step.at);
      if (Math.hypot(p.x - pos.x, p.y - pos.y) < 70) completeStep(S);
      break;
    }
    case 'collect': {
      if (d.collected >= step.count) completeStep(S);
      break;
    }
    case 'kill': {
      if (S.stats.kills - d.killsAtStart >= step.count) completeStep(S);
      break;
    }
    case 'hold': {
      const pos = shopPos(S, step.at);
      const dd = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (dd < 90) {
        d.hold += dt;
        S.objectiveText = step.text + ' — ' + Math.ceil(step.seconds - d.hold) + 's';
        if (d.hold >= step.seconds) completeStep(S);
      } else {
        d.hold = Math.max(0, d.hold - dt * 0.5);
      }
      break;
    }
    case 'tail': {
      const car = d.targetCar;
      if (!car || car.dead) { failStep(S); break; }
      // The snitch drives slowly along the roads.
      car.speed = 130;
      car.angle += Math.sin(S.time * 0.3) * 0.2 * dt;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const dd = Math.hypot(p.x - car.x, p.y - car.y);
      if (dd < 70) {
        d.spotted += dt;
        S.objectiveText = 'SPOTTED! Back off!';
        if (d.spotted > 1.5) { toast(S, 'He made you! Tail failed — start over.', '#ff6b6b'); failStep(S); }
      } else {
        d.spotted = 0;
        d.tailTime = (d.tailTime || 0) + dt;
        S.objectiveText = step.text + ' — ' + Math.ceil(25 - d.tailTime) + 's';
        if (d.tailTime >= 25) {
          // He stops: time to take him out.
          car.driver = 'none';
          car.speed = 0;
          const snitch = {
            x: car.x + 20, y: car.y + 20, angle: 0, speed: 90,
            shirt: '#2980b9', skin: '#f1c27d', hp: 30, state: 'walk',
            kind: 'snitch', fireTimer: 0, dead: false,
          };
          S.peds.push(snitch);
          d.snitch = snitch;
          completeStep(S);
        }
      }
      if (dd > 500) {
        d.lost += dt;
        if (d.lost > 5) { toast(S, 'You lost him! Tail failed — start over.', '#ff6b6b'); failStep(S); }
      } else d.lost = 0;
      break;
    }
    case 'chase': {
      const car = d.targetCar;
      if (!car) { failStep(S); break; }
      if (car.dead || car.hp <= 0) { completeStep(S); break; }
      // The traitor flees from the player.
      const a = Math.atan2(car.y - p.y, car.x - p.x);
      car.angle += (a - car.angle) * Math.min(1, dt * 1.5);
      car.speed = Math.min(car.maxSpeed, car.speed + 300 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      break;
    }
    case 'race': {
      // The race module calls completeStep / failStep itself.
      break;
    }
    case 'survive': {
      d.timer += dt;
      S.objectiveText = step.text + ' — ' + Math.ceil(step.seconds - d.timer) + 's';
      if (d.timer >= step.seconds) {
        S.objectiveText = 'Now lose the cops!';
        if (S.wanted === 0) completeStep(S);
      }
      break;
    }
    case 'escape': {
      const pos = shopPos(S, step.to || 'hideout');
      if (S.wanted === 0 && Math.hypot(p.x - pos.x, p.y - pos.y) < 90) completeStep(S);
      break;
    }
    default:
      break;
  }

  updateObjectiveMarker(S);
}

// Hitmen hunt the player: walk closer and shoot.
export function updateHitmen(S, dt) {
  const p = S.player;
  for (const ped of S.peds) {
    if (ped.dead || ped.kind !== 'hitman') continue;
    const d = Math.hypot(p.x - ped.x, p.y - ped.y);
    const a = Math.atan2(p.y - ped.y, p.x - ped.x);
    ped.angle = a;
    if (d > 160) {
      const nx = ped.x + Math.cos(a) * ped.speed * dt;
      const ny = ped.y + Math.sin(a) * ped.speed * dt;
      ped.x = nx; ped.y = ny;
    }
    if (d < 420) {
      ped.fireTimer -= dt;
      if (ped.fireTimer <= 0) {
        ped.fireTimer = rand(0.9, 1.6);
        S.bullets.push({
          x: ped.x + Math.cos(a) * 18, y: ped.y + Math.sin(a) * 18,
          vx: Math.cos(a + rand(-0.08, 0.08)) * 760,
          vy: Math.sin(a + rand(-0.08, 0.08)) * 760,
          damage: 7, from: 'hitman', life: 1.2, color: '#ff9f1c',
        });
      }
    }
  }
}

// Pick up mission items (and cash/health drops).
export function updatePickups(S, dt) {
  const p = S.player;
  for (const pk of S.pickups) {
    pk.bob += dt * 3;
    if (Math.hypot(p.x - pk.x, p.y - pk.y) < 30) {
      pk.dead = true;
      if (pk.mission) {
        S.missionData.collected++;
        toast(S, 'Picked up: ' + pk.kind + ' (' + S.missionData.collected + ')', '#7bd389');
        sfx.pickup();
      } else if (pk.kind === 'cash') {
        S.money += pk.amount || 50;
        toast(S, '+$' + (pk.amount || 50), '#ffd166');
        sfx.cash();
      } else if (pk.kind === 'health') {
        p.health = Math.min(CFG.PLAYER_HEALTH, p.health + 40);
        toast(S, '+40 health', '#7bd389');
        sfx.pickup();
      } else if (pk.kind === 'armor') {
        p.armor = Math.min(CFG.PLAYER_ARMOR_MAX, p.armor + 50);
        toast(S, '+50 armour', '#7bd389');
        sfx.pickup();
      }
    }
  }
  S.pickups = S.pickups.filter((pk) => !pk.dead);
}

function completeStep(S) {
  const m = MISSIONS[S.missionIndex];
  S.missionStep++;
  sfx.pickup();
  if (S.missionStep >= m.steps.length) {
    completeMission(S);
  } else {
    setupStep(S);
  }
}

function failStep(S) {
  // Restart the current step (keep the mission going).
  setupStep(S);
}

function completeMission(S) {
  const m = MISSIONS[S.missionIndex];
  S.money += m.reward;
  S.respect += m.respect;
  S.stats.missionsDone++;
  S.completedMissions.push(m.id);
  S.missionIndex = -1;
  S.missionStep = 0;
  S.missionData = null;
  S.objectiveText = '';
  S.objectivePos = null;
  toast(S, 'Mission complete: ' + m.name + '  +$' + m.reward + '  +' + m.respect + ' respect', '#ffd166');
  sfx.mission();
  // Drop a little cash nearby as a bonus.
  S.pickups.push({ kind: 'cash', amount: 100, x: S.player.x + 40, y: S.player.y, r: 12, bob: 0 });
}

// Is a mission currently running?
export function missionActive(S) { return S.missionIndex >= 0; }
