// Keyboard and mouse input. Held keys give a steering direction; one-shot
// presses (enter a car, punch, pause, mute) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or counted
// twice. The mouse aims the pistol.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MELEE = 8;
export const ACTION_MUTE = 16;
export const ACTION_RADIO = 32;
export const ACTION_SLOT1 = 64;
export const ACTION_SLOT2 = 128;
export const ACTION_SLOT3 = 256;
export const ACTION_CYCLE = 512;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const MELEE = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);
const RADIO = new Set(['KeyR']);
const SLOT1 = new Set(['Digit1']);
const SLOT2 = new Set(['Digit2']);
const SLOT3 = new Set(['Digit3']);
const CYCLE = new Set(['KeyQ']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (MELEE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MELEE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RADIO.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RADIO;
    } else if (SLOT1.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SLOT1;
    } else if (SLOT2.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SLOT2;
    } else if (SLOT3.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SLOT3;
    } else if (CYCLE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CYCLE;
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.down = true;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  function has(codes) {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  }

  return {
    mouse,
    /** -1..1 steering and throttle, from held keys. */
    drive() {
      return {
        up: has(UP),
        down: has(DOWN),
        left: has(LEFT),
        right: has(RIGHT),
        run: held.has('ShiftLeft') || held.has('ShiftRight'),
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
