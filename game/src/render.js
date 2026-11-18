// Drawing only: the world's state and the current screen in, pixels out.
// A camera follows the player across the 3200x3200 city and shows a
// 1280x720 logical view, scaled to the window. Flat vector shapes, canvas
// text for the HUD, and a live minimap in the corner.

import { WORLD, PALETTE, FONT, MISSIONS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_STORY = 'story';

const VIEW_W = 1280;
const VIEW_H = 720;
const MINIMAP = 184;

const fonts = new Map();
function font(size) {
  if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
  return fonts.get(size);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, w: 0, h: 0 };
  const camera = { x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW_W, height / VIEW_H);
    view.w = width;
    view.h = height;
    view.x = (width - VIEW_W * view.scale) / 2;
    view.y = (height - VIEW_H * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    context.font = font(size);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = baseline ?? 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Screen pixels (CSS px) to world coordinates, for mouse aiming. */
  function screenToWorld(sx, sy) {
    const ratio = window.devicePixelRatio || 1;
    return {
      x: camera.x - VIEW_W / 2 + (sx * ratio - view.x) / view.scale,
      y: camera.y - VIEW_H / 2 + (sy * ratio - view.y) / view.scale,
    };
  }

  function drawCity(state) {
    const city = state.city;
    // Ground and blocks.
    context.fillStyle = PALETTE.ground;
    context.fillRect(0, 0, WORLD.size, WORLD.size);
    // Parks.
    for (const park of city.parks) {
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
      for (const tree of park.trees) {
        context.fillStyle = PALETTE.tree;
        context.beginPath();
        context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Roads: dark asphalt with lighter edges and dashed centre lines.
    context.fillStyle = PALETTE.road;
    for (const line of WORLD.lines) {
      context.fillRect(line - WORLD.roadWidth / 2, 0, WORLD.roadWidth, WORLD.size);
      context.fillRect(0, line - WORLD.roadWidth / 2, WORLD.size, WORLD.roadWidth);
    }
    context.strokeStyle = PALETTE.lane;
    context.lineWidth = 3;
    context.setLineDash([26, 30]);
    for (const line of WORLD.lines) {
      context.beginPath();
      context.moveTo(line, 0);
      context.lineTo(line, WORLD.size);
      context.stroke();
      context.beginPath();
      context.moveTo(0, line);
      context.lineTo(WORLD.size, line);
      context.stroke();
    }
    context.setLineDash([]);
    // Buildings with lit windows.
    for (const b of city.buildings) {
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = PALETTE.roof;
      context.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      for (const win of b.windows) {
        context.fillStyle = win.lit ? PALETTE.window : '#3a3f4a';
        context.fillRect(b.x + win.dx, b.y + win.dy, 7, 7);
      }
    }
    // Story places.
    drawPlace(city.garage.x, city.garage.y, 'GARAGE', '#39d0ff');
    drawPlace(city.hideout.x, city.hideout.y, 'HIDEOUT', '#ff4fd8');
    drawPlace(city.hospital.x, city.hospital.y, 'HOSPITAL', '#3ddc5f');
  }

  function drawPlace(x, y, label, color) {
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.strokeRect(x - 46, y - 30, 92, 60);
    context.fillStyle = color;
    context.font = font(13);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, x, y);
  }

  function drawCar(car, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(-CAR_HALF + 3, -CAR_HALF_W + 4, CAR_LEN, CAR_W);
    // Body.
    context.fillStyle = car.color;
    roundRect(-CAR_HALF, -CAR_HALF_W, CAR_LEN, CAR_W, 7);
    context.fill();
    // Windshield and rear window.
    context.fillStyle = '#1b2a3a';
    context.fillRect(6, -CAR_HALF_W + 4, 12, CAR_W - 8);
    context.fillRect(-18, -CAR_HALF_W + 4, 8, CAR_W - 8);
    // Headlights.
    context.fillStyle = '#fff6c9';
    context.fillRect(CAR_HALF - 3, -CAR_HALF_W + 3, 3, 5);
    context.fillRect(CAR_HALF - 3, CAR_HALF_W - 8, 3, 5);
    if (car.driver === 'police') {
      // Light bar, alternating with time.
      const red = Math.floor(performance.now() / 260) % 2 === 0;
      context.fillStyle = red ? '#ff2e3e' : '#2e6bff';
      context.fillRect(-6, -CAR_HALF_W + 2, 12, 8);
      context.fillStyle = red ? '#2e6bff' : '#ff2e3e';
      context.fillRect(-6, CAR_HALF_W - 10, 12, 8);
    }
    if (isPlayer) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      roundRect(-CAR_HALF - 2, -CAR_HALF_W - 2, CAR_LEN + 4, CAR_W + 4, 9);
      context.stroke();
    }
    context.restore();
  }

  const CAR_LEN = 52;
  const CAR_W = 26;
  const CAR_HALF = CAR_LEN / 2;
  const CAR_HALF_W = CAR_W / 2;

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawPed(ped) {
    if (ped.state === 'down') {
      // Lying flat, arms out.
      context.fillStyle = ped.color;
      context.beginPath();
      context.ellipse(ped.x, ped.y, 13, 7, ped.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(0,0,0,0.5)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(ped.x, ped.y);
    context.lineTo(ped.x + Math.cos(ped.angle) * 12, ped.y + Math.sin(ped.angle) * 12);
    context.stroke();
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.inCar) return;
    // Blink while invulnerable after an arrest or a hit.
    if (player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0) return;
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y, 13, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#0a2a3a';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(player.x, player.y);
    context.lineTo(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18);
    context.stroke();
    // Pistol in hand.
    context.fillStyle = '#222';
    context.fillRect(player.x + Math.cos(player.angle) * 14 - 3, player.y + Math.sin(player.angle) * 14 - 2, 7, 4);
  }

  function drawMarker(state) {
    const target = state.missionTarget;
    if (!target) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    context.strokeStyle = PALETTE.marker;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(target.x, target.y - 52 * pulse);
    context.lineTo(target.x - 10, target.y - 30);
    context.lineTo(target.x + 10, target.y - 30);
    context.closePath();
    context.fillStyle = PALETTE.marker;
    context.fill();
    context.font = font(15);
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.fillText(target.label, target.x, target.y - 58 * pulse);
    // Edge arrow when the target is off-screen.
    const px = state.player.x;
    const py = state.player.y;
    const dx = target.x - px;
    const dy = target.y - py;
    const d = Math.hypot(dx, dy);
    if (d > 620) {
      const ax = px + (dx / d) * 300;
      const ay = py + (dy / d) * 300;
      const a = Math.atan2(dy, dx);
      context.save();
      context.translate(ax, ay);
      context.rotate(a);
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.moveTo(18, 0);
      context.lineTo(-10, -11);
      context.lineTo(-10, 11);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      const bob = Math.sin(pickup.bob) * 3;
      const y = pickup.y + bob;
      if (pickup.kind === 'cash') {
        context.fillStyle = PALETTE.cash;
        context.fillRect(pickup.x - 9, y - 6, 18, 12);
        context.fillStyle = '#7a5c00';
        context.font = font(11);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('$', pickup.x, y + 1);
      } else if (pickup.kind === 'health') {
        context.fillStyle = PALETTE.health;
        context.fillRect(pickup.x - 8, y - 8, 16, 16);
        context.fillStyle = '#ffffff';
        context.fillRect(pickup.x - 2, y - 6, 4, 12);
        context.fillRect(pickup.x - 6, y - 2, 12, 4);
      } else {
        context.fillStyle = PALETTE.ammo;
        context.beginPath();
        context.arc(pickup.x, y, 9, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#4a2400';
        context.font = font(11);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('A', pickup.x, y + 1);
      }
    }
  }

  function drawBullets(state) {
    context.fillStyle = '#ffe27a';
    for (const bullet of state.bullets) {
      context.beginPath();
      context.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawHud(state) {
    const player = state.player;
    // Top-left: health, cash, ammo, mission.
    context.textBaseline = 'top';
    context.textAlign = 'left';
    text('NEON CITY', 24, 18, 22, PALETTE.hud, 'left', 'top');
    // Health bar.
    context.fillStyle = '#20262b';
    context.fillRect(24, 48, 220, 16);
    context.fillStyle = player.health > 30 ? PALETTE.health : PALETTE.danger;
    context.fillRect(24, 48, Math.max(0, 220 * player.health / 100), 16);
    text(`HP ${Math.max(0, Math.ceil(player.health))}`, 252, 48, 16, PALETTE.hud, 'left', 'top');
    text(`$${player.cash}`, 24, 72, 22, PALETTE.cash, 'left', 'top');
    text(`Ammo ${player.ammo}   Cars stolen ${state.stats.stolen}`, 24, 100, 15, PALETTE.hudDim, 'left', 'top');
    // Mission banner, bottom centre.
    const mission = MISSIONS[state.missionIndex];
    const title = state.storyDone ? 'Free roam' : `Mission ${state.missionIndex + 1}/${MISSIONS.length} — ${mission.name}`;
    const timer = state.missionStage === 'deliver' ? `  (${Math.max(0, Math.ceil(state.missionTimer))}s)` : '';
    context.textAlign = 'center';
    text(title + timer, VIEW_W / 2, VIEW_H - 58, 19, PALETTE.hud, 'center', 'top');
    text(state.missionText, VIEW_W / 2, VIEW_H - 32, 15, PALETTE.hudDim, 'center', 'top');
    // Speed, bottom right.
    if (player.inCar) {
      const kmh = Math.round(Math.abs(player.inCar.speed) * 0.45);
      text(`${kmh} km/h`, VIEW_W - 24, VIEW_H - 58, 26, PALETTE.hud, 'right', 'top');
      text('E — exit car', VIEW_W - 24, VIEW_H - 30, 14, PALETTE.hudDim, 'right', 'top');
    } else {
      text('E — enter car    F — punch    Click — shoot', VIEW_W - 24, VIEW_H - 30, 14, PALETTE.hudDim, 'right', 'top');
    }
    // Wanted stars, top right above the minimap.
    const starY = 22;
    for (let i = 0; i < 5; i += 1) {
      const x = VIEW_W - MINIMAP - 30 - i * 30;
      text('★', x, starY, 26, i < state.wanted ? PALETTE.star : '#3a4148', 'center', 'top');
    }
    drawMinimap(state);
    // Mission-complete flash.
    if (state.flash > 0) {
      context.globalAlpha = state.flash * 0.25;
      context.fillStyle = PALETTE.cash;
      context.fillRect(0, 0, VIEW_W, VIEW_H);
      context.globalAlpha = 1;
      context.textAlign = 'center';
      text('MISSION COMPLETE', VIEW_W / 2, VIEW_H / 2 - 120, 40, PALETTE.cash, 'center', 'top');
    }
  }

  function drawMinimap(state) {
    const x0 = VIEW_W - MINIMAP - 16;
    const y0 = 56;
    const scale = MINIMAP / WORLD.size;
    context.fillStyle = 'rgba(10,14,18,0.85)';
    context.fillRect(x0 - 4, y0 - 4, MINIMAP + 8, MINIMAP + 8);
    context.fillStyle = '#20262b';
    context.fillRect(x0, y0, MINIMAP, MINIMAP);
    // Roads.
    context.fillStyle = '#4a5058';
    for (const line of WORLD.lines) {
      context.fillRect(x0 + (line - WORLD.roadWidth / 2) * scale, y0, WORLD.roadWidth * scale, MINIMAP);
      context.fillRect(x0, y0 + (line - WORLD.roadWidth / 2) * scale, MINIMAP, WORLD.roadWidth * scale);
    }
    // Mission target.
    if (state.missionTarget) {
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(x0 + state.missionTarget.x * scale, y0 + state.missionTarget.y * scale, 5, 0, Math.PI * 2);
      context.fill();
    }
    // Police, red.
    context.fillStyle = '#ff4f5e';
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      context.fillRect(x0 + car.x * scale - 2, y0 + car.y * scale - 2, 4, 4);
    }
    // Player, cyan.
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(x0 + state.player.x * scale, y0 + state.player.y * scale, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.stroke();
    // Viewport box.
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.strokeRect(x0 + (camera.x - VIEW_W / 2) * scale, y0 + (camera.y - VIEW_H / 2) * scale, VIEW_W * scale, VIEW_H * scale);
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const lineH = 30;
    const height = 150 + lines.length * lineH + 70;
    const x = (VIEW_W - width) / 2;
    const y = (VIEW_H - height) / 2;
    context.fillStyle = 'rgba(16,20,26,0.92)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = '#39d0ff';
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    text(title, VIEW_W / 2, y + 72, 44, PALETTE.hud, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW_W / 2, y + 118 + i * lineH, 19, PALETTE.hudDim, 'center');
    }
    text(prompt, VIEW_W / 2, y + height - 34, 20, PALETTE.cash, 'center');
  }

  function draw(state, screen, save) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0e12';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Camera follows the player, clamped to the world.
    camera.x = Math.max(VIEW_W / 2, Math.min(WORLD.size - VIEW_W / 2, state.player.x));
    camera.y = Math.max(VIEW_H / 2, Math.min(WORLD.size - VIEW_H / 2, state.player.y));
    const ox = view.x;
    const oy = view.y;
    context.setTransform(view.scale, 0, 0, view.scale, ox - (camera.x - VIEW_W / 2) * view.scale, oy - (camera.y - VIEW_H / 2) * view.scale);
    drawCity(state);
    drawMarker(state);
    drawPickups(state);
    for (const car of state.cars) drawCar(car, car.driver === 'player');
    for (const ped of state.peds) drawPed(ped);
    drawPlayer(state);
    drawBullets(state);
    drawParticles(state);
    // HUD in screen space.
    context.setTransform(view.scale, 0, 0, view.scale, ox, oy);
    if (screen === SCREEN_TITLE) {
      const lines = [
        'Neon City, 2:14 AM. Vex runs the streets,',
        'and you are his new driver.',
        'WASD / arrows — move & drive · E — enter / exit car · F — punch',
        'Mouse + click — aim & shoot · Shift — run · P — pause · M — mute',
        'Steal cars, dodge the law, run four jobs for Vex — and stay alive.',
        save ? `Saved game found: $${save.cash}, mission ${save.missionIndex + 1} — press C to continue it.` : '',
      ].filter((line) => line !== '');
      drawPanel('NEON CITY', lines, 'Press Space or click to start');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for no one — except now.', 'Progress saves automatically when you pause.'], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', [`The Neon City PD caught you on foot.`, `-$100 bail. The hospital patched you up.`], 'Press Space to get back out there');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Neon City is not kind to the careless.', '-$150 hospital bill. Vex is not impressed.'], 'Press Space to try again');
    } else if (screen === SCREEN_STORY) {
      drawPanel('STORY COMPLETE', ['Every job done. Vex owes you, and Neon City knows your name.', `Cash earned on jobs: $${state.stats.earned} · Cars stolen: ${state.stats.stolen}`], 'Press Space to keep roaming');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld, camera };
}
