// Drawing only: the world's state and the current screen in, pixels out.
// A camera follows the player across the 3200x3200 city and shows a
// 1280x720 logical view, scaled to the window. Flat vector shapes, canvas
// text for the HUD, and a live minimap in the corner.

import { WORLD, PALETTE, FONT, MISSIONS, WEAPONS, WEAPON_ORDER, RESPECT_RANKS, DAYNIGHT } from './config.js';
import { districtAt } from './city.js';

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
    // Buildings with lit windows — at night, far more windows are lit.
    for (const b of city.buildings) {
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = PALETTE.roof;
      context.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      for (const win of b.windows) {
        const lit = win.lit || state.nightness > 0.55;
        context.fillStyle = lit ? PALETTE.window : '#3a3f4a';
        context.fillRect(b.x + win.dx, b.y + win.dy, 7, 7);
      }
    }
    // Story places.
    drawPlace(city.garage.x, city.garage.y, 'GARAGE', '#39d0ff');
    drawPlace(city.hideout.x, city.hideout.y, 'HIDEOUT', '#ff4fd8');
    drawPlace(city.hospital.x, city.hospital.y, 'HOSPITAL', '#3ddc5f');
    // Shops.
    for (const shop of city.shops) {
      drawPlace(shop.x, shop.y, shop.label, PALETTE.shop);
    }
    // Street race start: a chequered line on the central crossroads.
    for (let i = 0; i < 6; i += 1) {
      context.fillStyle = i % 2 === 0 ? '#f2f5f8' : '#14181d';
      context.fillRect(city.raceStart.x - 45 + i * 15, city.raceStart.y - 8, 15, 16);
    }
    context.fillStyle = PALETTE.race;
    context.font = font(13);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('RACE', city.raceStart.x, city.raceStart.y - 24);
    // Turf corners, purple rings that fill as the crew holds them.
    for (const spot of city.turfSpots) {
      context.strokeStyle = PALETTE.turf;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(spot.x, spot.y, 44, 0, Math.PI * 2);
      context.stroke();
      if (spot.held) {
        context.fillStyle = PALETTE.turf;
        context.globalAlpha = 0.35;
        context.beginPath();
        context.arc(spot.x, spot.y, 44, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      } else if (spot.hold > 0) {
        context.fillStyle = PALETTE.turf;
        context.globalAlpha = 0.35 * (spot.hold / 3);
        context.beginPath();
        context.arc(spot.x, spot.y, 44, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
    }
    // The pinned crew member, waiting for a rescue.
    if (state.crew && !state.crew.pickedUp) {
      context.strokeStyle = '#ffcf3f';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(state.crew.x, state.crew.y, 26, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#ffcf3f';
      context.font = font(13);
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillText('CREW', state.crew.x, state.crew.y - 30);
    }
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
    // Sport cars are longer and lower; taxis carry a roof sign.
    const len = car.tier === 'sport' ? 60 : CAR_LEN;
    const half = len / 2;
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(-half + 3, -CAR_HALF_W + 4, len, CAR_W);
    // Body.
    context.fillStyle = car.color;
    roundRect(-half, -CAR_HALF_W, len, CAR_W, 7);
    context.fill();
    // Windshield and rear window.
    context.fillStyle = '#1b2a3a';
    context.fillRect(6, -CAR_HALF_W + 4, 12, CAR_W - 8);
    context.fillRect(-18, -CAR_HALF_W + 4, 8, CAR_W - 8);
    if (car.tier === 'taxi') {
      context.fillStyle = '#ffd23f';
      context.fillRect(-4, -CAR_HALF_W - 4, 14, 5);
      context.fillStyle = '#14181d';
      context.font = font(7);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('TAXI', 3, -CAR_HALF_W - 1);
    }
    // Headlights.
    context.fillStyle = '#fff6c9';
    context.fillRect(half - 3, -CAR_HALF_W + 3, 3, 5);
    context.fillRect(half - 3, CAR_HALF_W - 8, 3, 5);
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
      roundRect(-half - 2, -CAR_HALF_W - 2, len + 4, CAR_W + 4, 9);
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
      } else if (pickup.kind === 'vault') {
        // The Big Score: a heavy cash bag with a purple strap.
        context.fillStyle = '#b06fff';
        context.beginPath();
        context.arc(pickup.x, y, 12, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffffff';
        context.font = font(13);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('$', pickup.x, y + 1);
      } else if (pickup.kind === 'weapon-shotgun') {
        context.fillStyle = '#ff5e7a';
        context.fillRect(pickup.x - 12, y - 4, 24, 8);
        context.fillStyle = '#ffffff';
        context.font = font(10);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('SG', pickup.x, y + 1);
      } else if (pickup.kind === 'weapon-smg') {
        context.fillStyle = '#ff5e7a';
        context.fillRect(pickup.x - 12, y - 4, 24, 8);
        context.fillStyle = '#ffffff';
        context.font = font(10);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('SMG', pickup.x, y + 1);
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

  function drawHeli(state) {
    const heli = state.heli;
    if (!heli.active) return;
    // Ground shadow, then the searchlight cone sweeping toward the player.
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(heli.x, heli.y, 46, 30, 0, 0, Math.PI * 2);
    context.fill();
    const px = state.player.x;
    const py = state.player.y;
    const a = Math.atan2(py - heli.y, px - heli.x);
    context.fillStyle = 'rgba(255, 246, 201, 0.12)';
    context.beginPath();
    context.moveTo(heli.x, heli.y);
    context.arc(heli.x, heli.y, 190, a - 0.22, a + 0.22);
    context.closePath();
    context.fill();
    // Body and spinning rotor.
    context.save();
    context.translate(heli.x, heli.y);
    context.rotate(heli.angle);
    context.fillStyle = '#c9c9c9';
    context.beginPath();
    context.ellipse(0, 0, 26, 13, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2244cc';
    context.fillRect(-8, -13, 16, 26);
    context.strokeStyle = 'rgba(255,255,255,0.7)';
    context.lineWidth = 3;
    const rotor = (state.time * 9) % Math.PI;
    context.beginPath();
    context.moveTo(Math.cos(rotor) * 44, Math.sin(rotor) * 44);
    context.lineTo(-Math.cos(rotor) * 44, -Math.sin(rotor) * 44);
    context.stroke();
    context.restore();
    context.fillStyle = PALETTE.heli;
    context.font = font(13);
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.fillText('AIR ONE', heli.x, heli.y - 34);
  }

  function drawRoadblocks(state) {
    for (const block of state.roadblocks) {
      // Striped barricade across the road between the two parked cruisers.
      context.save();
      context.translate(block.x, block.y);
      context.rotate(block.angle);
      for (let i = -2; i <= 2; i += 1) {
        context.fillStyle = i % 2 === 0 ? '#ffcf3f' : '#14181d';
        context.fillRect(i * 16 - 8, -10, 16, 20);
      }
      context.restore();
    }
  }

  function drawHeadlights(state) {
    if (state.nightness < 0.25) return;
    // A cone of light ahead of every car once the night comes down.
    const cars = state.player.inCar ? [state.player.inCar] : [];
    for (const car of state.cars) {
      if (car.driver === 'traffic' || car.driver === 'police' || car.driver === 'racer') cars.push(car);
    }
    for (const car of cars) {
      const a = car.angle;
      context.fillStyle = PALETTE.headlight;
      context.beginPath();
      context.moveTo(car.x + Math.cos(a) * 24, car.y + Math.sin(a) * 24);
      context.arc(car.x + Math.cos(a) * 24, car.y + Math.sin(a) * 24, 190, a - 0.28, a + 0.28);
      context.closePath();
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
    // Top-left: health, cash, weapon slots, respect, radio.
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
    // Weapon slots: 1 pistol, 2 shotgun, 3 SMG — the current one is boxed.
    let slotX = 24;
    for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
      const key = WEAPON_ORDER[i];
      const def = WEAPONS[key];
      const ammo = player.weapons[key].ammo;
      const owned = key === 'pistol' || ammo > 0;
      const current = player.weaponSlot === i;
      const label = `${i + 1} ${def.name} ${owned ? ammo : '—'}`;
      const w = 104;
      context.fillStyle = current ? 'rgba(57,208,255,0.25)' : 'rgba(32,38,43,0.85)';
      context.fillRect(slotX, 100, w, 22);
      if (current) {
        context.strokeStyle = '#39d0ff';
        context.lineWidth = 2;
        context.strokeRect(slotX, 100, w, 22);
      }
      text(label, slotX + 6, 104, 13, owned ? PALETTE.hud : PALETTE.hudDim, 'left', 'top');
      slotX += w + 8;
    }
    // Respect rank and radio, under the slots.
    let rank = RESPECT_RANKS[0].name;
    for (const entry of RESPECT_RANKS) {
      if (state.respect >= entry.at) rank = entry.name;
    }
    text(`Respect: ${rank} (${state.respect})   ${districtAt(player.x, player.y)}`, 24, 130, 15, PALETTE.hudDim, 'left', 'top');
    text(`♪ ${state.radioStation}  [R]`, 24, 152, 14, PALETTE.hudDim, 'left', 'top');
    // Day/night clock, top centre.
    const hours = Math.floor(((state.timeOfDay + 0.25) % 1) * 24);
    const minutes = Math.floor((((state.timeOfDay + 0.25) % 1) * 24 % 1) * 60);
    const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    text(state.nightness > 0.5 ? `☾ ${clock}` : `☀ ${clock}`, VIEW_W / 2, 18, 18, PALETTE.hudDim, 'center', 'top');
    // Helicopter warning.
    if (state.heli.active) {
      text('⚠ AIR ONE OVERHEAD — the heat will not fade', VIEW_W / 2, 48, 17, PALETTE.heli, 'center', 'top');
    }
    // Race banner: checkpoint progress and the clock.
    if (state.race.active) {
      text(`RACE  ${state.race.next}/${state.race.checkpoints.length} checkpoints  •  ${state.race.timer.toFixed(1)}s`, VIEW_W / 2, 76, 18, PALETTE.race, 'center', 'top');
    }
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
    // Race checkpoints, green.
    if (state.race.active) {
      context.fillStyle = PALETTE.race;
      for (let i = state.race.next; i < state.race.checkpoints.length; i += 1) {
        const point = state.race.checkpoints[i];
        context.fillRect(x0 + point.x * scale - 3, y0 + point.y * scale - 3, 6, 6);
      }
    }
    // Shops, yellow; turf corners, purple.
    context.fillStyle = PALETTE.shop;
    for (const shop of state.city.shops) {
      context.fillRect(x0 + shop.x * scale - 2, y0 + shop.y * scale - 2, 4, 4);
    }
    context.fillStyle = PALETTE.turf;
    for (const spot of state.city.turfSpots) {
      context.fillRect(x0 + spot.x * scale - 2, y0 + spot.y * scale - 2, 4, 4);
    }
    // Helicopter, orange.
    if (state.heli.active) {
      context.fillStyle = PALETTE.heli;
      context.beginPath();
      context.arc(x0 + state.heli.x * scale, y0 + state.heli.y * scale, 4, 0, Math.PI * 2);
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
    drawRoadblocks(state);
    drawHeli(state);
    drawHeadlights(state);
    // Night falls over the city: a dark blue wash in screen space.
    if (state.nightness > 0.03) {
      context.setTransform(view.scale, 0, 0, view.scale, ox, oy);
      context.fillStyle = PALETTE.night;
      context.globalAlpha = state.nightness * DAYNIGHT.nightAlpha;
      context.fillRect(0, 0, VIEW_W, VIEW_H);
      context.globalAlpha = 1;
    }
    // HUD in screen space.
    context.setTransform(view.scale, 0, 0, view.scale, ox, oy);
    if (screen === SCREEN_TITLE) {
      const lines = [
        'Neon City, 2:14 AM. Vex runs the streets,',
        'and you are his new driver.',
        'WASD / arrows — move & drive · E — enter / exit car · F — punch',
        'Mouse + click — aim & shoot · 1/2/3 — pistol / shotgun / SMG · Q — swap gun',
        'R — switch radio station · Shift — run · P — pause · M — mute',
        'Nine jobs for Vex: heists, a street race, Air One, turf wars —',
        'and a city that goes dark at night. Respect is everything.',
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
