// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens: title,
// play, paused, busted, wasted and story-complete. Progress is saved to
// localStorage when the game is paused or a mission is finished, and a saved
// game can be continued from the title screen.
//
// ?seed=N fixes the city. ?shot=start|play|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { STEP, SAVE_KEY } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_WASTED, EVENT_MISSION } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_MELEE, ACTION_MUTE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_WASTED, SCREEN_STORY } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const player = world.state.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: player.cash,
      missionIndex: world.state.missionIndex,
      health: player.health,
      ammo: player.ammo,
      x: player.x,
      y: player.y,
      wanted: world.state.wanted,
    }));
  } catch {
    // Storage can be off (private windows): the game then lasts one visit.
  }
}

function applySave(save) {
  const player = world.state.player;
  player.cash = save.cash;
  player.health = save.health;
  player.ammo = save.ammo;
  player.x = save.x;
  player.y = save.y;
  world.state.wanted = save.wanted;
  world.startMission(Math.min(save.missionIndex, 3));
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, readSave());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  let continuePressed = false;

  window.addEventListener('keydown', (event) => {
    audio.unlock();
    if (event.code === 'KeyC' && screen === SCREEN_TITLE && save) continuePressed = true;
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh) {
      world.reset();
    } else if (save) {
      world.reset();
      applySave(save);
    }
    input.mouse.down = false;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Vex is waiting — steal a car and reach the garage.');
  }

  function pauseGame() {
    screen = SCREEN_PAUSED;
    writeSave();
    announce('Paused. Progress saved.');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) audio.setMuted(!audio.isMuted());
    if (continuePressed) {
      continuePressed = false;
      if (screen === SCREEN_TITLE && save) startGame(false);
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_STORY)) {
      startGame(screen === SCREEN_TITLE);
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      pauseGame();
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function buildInput(actions) {
    const drive = input.drive();
    const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
    return {
      up: drive.up,
      down: drive.down,
      left: drive.left,
      right: drive.right,
      run: drive.run,
      enter: !!(actions & ACTION_ENTER),
      melee: !!(actions & ACTION_MELEE),
      shoot: input.mouse.down,
      aimX: aim.x,
      aimY: aim.y,
    };
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      // The title screen shows the living city behind its panel.
      world.step(STEP, { up: false, down: false, left: false, right: false, run: false, enter: false, melee: false, shoot: false }, null);
      return;
    }
    const events = world.step(STEP, buildInput(actions), audio);
    if (events & EVENT_BUSTED) {
      world.applyArrest();
      audio.busted();
      writeSave();
      screen = SCREEN_BUSTED;
      announce('Busted. The police caught you.');
    } else if (events & EVENT_WASTED) {
      world.applyWasted();
      audio.busted();
      writeSave();
      screen = SCREEN_WASTED;
      announce('Wasted. The hospital patched you up.');
    } else if (events & EVENT_MISSION) {
      audio.mission();
      writeSave();
      if (world.state.storyDone) {
        screen = SCREEN_STORY;
        announce('Story complete. Neon City is yours.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // One take of the one-shot presses per frame, shared by the screen
    // handler and the world step, so no press is lost or counted twice.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        // One-shot presses act on the first step only: E toggles enter/exit,
        // so repeating it across catch-up steps would undo itself.
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, save);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) pauseGame();
  });

  announce('Neon City. Press Space or click to start. Press C to continue a saved game.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
