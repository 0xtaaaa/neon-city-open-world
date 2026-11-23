// Neon City — keyboard and mouse input. Tracks held keys, edge-triggered
// presses (cleared once per frame by main.js) and the mouse position in
// both screen and world coordinates.

export function initInput(S, canvas) {
  const keyMap = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
    KeyE: 'interact',
    KeyF: 'action',
    KeyR: 'reload',
    KeyM: 'radio',
    KeyN: 'mute',
    KeyH: 'help',
    KeyP: 'pause', Escape: 'escape',
    Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3',
    Space: 'space', Enter: 'enter',
  };

  window.addEventListener('keydown', (e) => {
    const name = keyMap[e.code];
    if (!name) return;
    if (['up', 'down', 'left', 'right', 'space'].includes(name)) e.preventDefault();
    if (!S.keys[name]) S.pressed[name] = true;
    S.keys[name] = true;
  });
  window.addEventListener('keyup', (e) => {
    const name = keyMap[e.code];
    if (name) S.keys[name] = false;
  });
  window.addEventListener('blur', () => { S.keys = {}; });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    S.mouse.x = e.clientX - r.left;
    S.mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { S.mouse.down = true; S.mouse.clicked = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) S.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Movement vector from WASD / arrows, normalised.
export function moveVector(S) {
  let x = 0, y = 0;
  if (S.keys.left) x -= 1;
  if (S.keys.right) x += 1;
  if (S.keys.up) y -= 1;
  if (S.keys.down) y += 1;
  if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
  return { x, y };
}

// Aim angle from the player to the mouse, in world coordinates.
export function aimAngle(S, px, py) {
  return Math.atan2(S.mouse.wy - py, S.mouse.wx - px);
}
