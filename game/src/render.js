// Neon City — rendering: the city, the cars and people in it, bullets,
// particles and the day/night lighting. Everything is drawn with the
// canvas 2D API; all art is procedural, nothing is loaded from a file.

import { CFG, clamp, lerp } from './config.js';
import { dayFraction, isNight } from './state.js';
import { nextMissionMarker } from './missions.js';

// Sky tint for the time of day: [r, g, b, alpha] overlay.
export function skyTint(S) {
  const f = dayFraction(S);
  if (f < 0.06) return [255, 150, 80, lerp(0.20, 0.05, f / 0.06)]; // dawn
  if (f < 0.45) return [255, 240, 200, 0.03]; // day
  if (f < 0.55) return [255, 120, 60, lerp(0.05, 0.22, (f - 0.45) / 0.10)]; // dusk
  if (f < 0.92) return [10, 20, 60, 0.42]; // night
  return [10, 20, 60, lerp(0.42, 0.20, (f - 0.92) / 0.08)]; // late night
}

export function render(S, ctx, view) {
  const cam = S.camera;
  ctx.save();
  ctx.clearRect(0, 0, view.w, view.h);
  // Camera transform (with screen shake).
  const shx = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
  const shy = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
  ctx.translate(view.w / 2 + shx, view.h / 2 + shy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const vx0 = cam.x - view.w / 2 / cam.zoom - 60;
  const vy0 = cam.y - view.h / 2 / cam.zoom - 60;
  const vx1 = cam.x + view.w / 2 / cam.zoom + 60;
  const vy1 = cam.y + view.h / 2 / cam.zoom + 60;
  const inView = (x, y, m = 0) => x >= vx0 - m && x <= vx1 + m && y >= vy0 - m && y <= vy1 + m;

  drawGround(S, ctx, vx0, vy0, vx1, vy1);
  drawRoads(S, ctx, vx0, vy0, vx1, vy1);
  drawBeach(S, ctx);
  drawBlocks(S, ctx, inView);
  drawProps(S, ctx, inView);
  drawMarkers(S, ctx, inView);
  drawPickups(S, ctx, inView);
  drawCars(S, ctx, inView);
  drawPeds(S, ctx, inView);
  drawPolice(S, ctx, inView);
  drawHeli(S, ctx, inView);
  drawBullets(S, ctx);
  drawParticles(S, ctx);

  // Night lighting: dark overlay, then pools of light.
  const night = isNight(S);
  if (night) drawNightLights(S, ctx, vx0, vy0, vx1, vy1);
  const [r, g, b, a] = skyTint(S);
  if (a > 0.005) {
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  }

  // Damage flash.
  if (S.flash > 0.01) {
    ctx.fillStyle = `rgba(255,0,0,${S.flash * 0.25})`;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  }
  ctx.restore();
}

function drawGround(S, ctx, vx0, vy0, vx1, vy1) {
  // Base ground: warm grey-green city floor.
  ctx.fillStyle = '#5a6b52';
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  // City floor inside the road grid is pale pavement.
  ctx.fillStyle = '#8a8f7a';
  ctx.fillRect(120, 120, CFG.WORLD_W - 240, CFG.WORLD_H - 240);
}

function drawRoads(S, ctx, vx0, vy0, vx1, vy1) {
  ctx.fillStyle = '#2e3138';
  for (const line of S.roadLines) {
    if (line.axis === 'v') {
      if (line.at < vx0 - 100 || line.at > vx1 + 100) continue;
      ctx.fillRect(line.at - CFG.ROAD_W / 2, 0, CFG.ROAD_W, CFG.WORLD_H);
    } else {
      if (line.at < vy0 - 100 || line.at > vy1 + 100) continue;
      ctx.fillRect(0, line.at - CFG.ROAD_W / 2, CFG.WORLD_W, CFG.ROAD_W);
    }
  }
  // Lane dashes.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const line of S.roadLines) {
    if (line.axis === 'v') {
      if (line.at < vx0 - 100 || line.at > vx1 + 100) continue;
      ctx.moveTo(line.at, 0);
      ctx.lineTo(line.at, CFG.WORLD_H);
    } else {
      if (line.at < vy0 - 100 || line.at > vy1 + 100) continue;
      ctx.moveTo(0, line.at);
      ctx.lineTo(CFG.WORLD_W, line.at);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const x = CFG.FIRST_ROAD + i * CFG.BLOCK_PITCH;
      const y = CFG.FIRST_ROAD + j * CFG.BLOCK_PITCH;
      if (x < vx0 - 60 || x > vx1 + 60 || y < vy0 - 60 || y > vy1 + 60) continue;
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(x - CFG.ROAD_W / 2 + 8, y + k * 14 - 4, 18, 8);
        ctx.fillRect(x + CFG.ROAD_W / 2 - 26, y + k * 14 - 4, 18, 8);
      }
    }
  }
}

function drawBeach(S, ctx) {
  // South beach: sand then water.
  ctx.fillStyle = '#e0c98f';
  ctx.fillRect(0, S.beach.y0, CFG.WORLD_W, CFG.WORLD_H - S.beach.y0);
  ctx.fillStyle = '#2e86c1';
  ctx.fillRect(0, S.beach.waterY, CFG.WORLD_W, CFG.WORLD_H - S.beach.waterY);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = 40; x < CFG.WORLD_W; x += 160) {
    ctx.fillRect(x, S.beach.waterY + 6, 70, 3);
  }
  // North harbour: water then docks.
  ctx.fillStyle = '#2e86c1';
  ctx.fillRect(0, 0, CFG.WORLD_W, S.harbour.waterY);
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(0, S.harbour.waterY, CFG.WORLD_W, S.harbour.y1 - S.harbour.waterY);
}

function drawBlocks(S, ctx, inView) {
  for (const b of S.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 5, b.y + 7, b.w, b.h);
    // Body and roof edge.
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.roof;
    ctx.lineWidth = 6;
    ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    // Windows.
    const cols = Math.max(2, Math.floor(b.w / 34));
    const rows = Math.max(2, Math.floor(b.h / 34));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const wx = b.x + 10 + i * ((b.w - 20) / cols);
        const wy = b.y + 10 + j * ((b.h - 20) / rows);
        const lit = b.lit && ((i * 7 + j * 13 + (b.x | 0)) % 3 !== 0);
        ctx.fillStyle = lit ? '#ffe9a8' : 'rgba(20,30,45,0.55)';
        ctx.fillRect(wx, wy, 12, 12);
      }
    }
    // Sign.
    if (b.sign) {
      ctx.fillStyle = '#111';
      ctx.fillRect(b.x + 6, b.y + b.h / 2 - 13, b.w - 12, 26);
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 1, b.w - 16);
    }
  }
}

function drawProps(S, ctx, inView) {
  for (const p of S.props) {
    if (!inView(p.x, p.y, 60)) continue;
    if (p.kind === 'tree') {
      ctx.fillStyle = '#2d5a27';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d7a33';
      ctx.beginPath(); ctx.arc(p.x - 3, p.y - 3, p.r * 0.6, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'lamp') {
      ctx.fillStyle = '#222';
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      if (isNight(S)) {
        ctx.fillStyle = 'rgba(255,220,130,0.9)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      }
    } else if (p.kind === 'hydrant') {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(p.x - 4, p.y - 5, 8, 10);
    } else if (p.kind === 'crate') {
      ctx.fillStyle = '#a67c52';
      ctx.fillRect(p.x - 9, p.y - 9, 18, 18);
      ctx.strokeStyle = '#7a5a35';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 9, p.y - 9, 18, 18);
    } else if (p.kind === 'pond') {
      ctx.fillStyle = '#2e86c1';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(p.x - 12, p.y - 8, p.r * 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'fountain') {
      ctx.fillStyle = '#7f8c8d';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5dade2';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.7, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'bench') {
      ctx.fillStyle = '#7a5a35';
      ctx.fillRect(p.x - 10, p.y - 4, 20, 8);
    }
  }
}

function drawMarkers(S, ctx, inView) {
  // Next mission contact (yellow diamond, bobbing).
  if (S.missionIndex < 0 && S.completedMissions.length < 10 && S.mode === 'playing') {
    const marker = nextMissionMarker(S);
    if (marker && inView(marker.x, marker.y, 60)) {
      const bob = Math.sin(S.time * 3) * 5;
      ctx.save();
      ctx.translate(marker.x, marker.y - 30 + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.restore();
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('JOB', marker.x, marker.y - 52 + bob);
    }
  }
  // Objective marker (pulsing ring).
  if (S.objectivePos && S.mode === 'playing') {
    const pulse = 18 + Math.sin(S.time * 5) * 6;
    ctx.strokeStyle = 'rgba(255,209,102,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(S.objectivePos.x, S.objectivePos.y, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,209,102,0.25)';
    ctx.beginPath(); ctx.arc(S.objectivePos.x, S.objectivePos.y, pulse * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  // Race start flag.
  if (inView(600, 660, 80)) {
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(600, 660); ctx.lineTo(600, 620); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(600, 620, 22, 14);
    ctx.fillStyle = '#111';
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      if ((i + j) % 2 === 0) ctx.fillRect(600 + i * 11, 620 + j * 7, 11, 7);
    }
  }
}

function drawPickups(S, ctx, inView) {
  for (const pk of S.pickups) {
    if (!inView(pk.x, pk.y, 30)) continue;
    const bob = Math.sin(pk.bob) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(-10, -6, 20, 12);
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(-2, -7, 4, 14);
      ctx.fillRect(-7, -2, 14, 4);
    } else if (pk.kind === 'armor') {
      ctx.fillStyle = '#3498db';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('A', 0, 0);
    } else {
      // Mission package / crate.
      ctx.fillStyle = pk.kind === 'crate' ? '#a67c52' : '#f39c12';
      ctx.fillRect(-11, -8, 22, 16);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.strokeRect(-11, -8, 22, 16);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pk.kind === 'crate' ? 'CRATE' : 'PKG', 0, 0);
    }
    ctx.restore();
  }
}
// ---- Entities (render.js continued) ----

function drawCars(S, ctx, inView) {
  for (const car of S.cars) {
    if (car.dead && car.exploded) continue;
    if (!inView(car.x, car.y, 80)) continue;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const L = car.length, W = car.width;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
    // Body.
    ctx.fillStyle = car.dead ? '#333' : car.color;
    roundRect(ctx, -L / 2, -W / 2, L, W, 7);
    ctx.fill();
    // Roof / cabin.
    ctx.fillStyle = car.dead ? '#222' : 'rgba(20,30,45,0.85)';
    roundRect(ctx, -L / 2 + 10, -W / 2 + 4, L * 0.42, W - 8, 4);
    ctx.fill();
    // Windshield.
    ctx.fillStyle = 'rgba(180,220,255,0.5)';
    ctx.fillRect(L / 2 - 12, -W / 2 + 4, 6, W - 8);
    // Wheels.
    ctx.fillStyle = '#111';
    ctx.fillRect(-L / 2 + 4, -W / 2 - 3, 10, 4);
    ctx.fillRect(-L / 2 + 4, W / 2 - 1, 10, 4);
    ctx.fillRect(L / 2 - 14, -W / 2 - 3, 10, 4);
    ctx.fillRect(L / 2 - 14, W / 2 - 1, 10, 4);
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(L / 2 - 2, -W / 2 + 3, 3, 5);
    ctx.fillRect(L / 2 - 2, W / 2 - 8, 3, 5);
    // Police livery.
    if (car.kind === 'cop') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-L / 2 + 2, -W / 2, L - 4, 5);
      ctx.fillRect(-L / 2 + 2, W / 2 - 5, L - 4, 5);
      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('NCPD', 0, 0);
      // Light bar (alternating).
      const phase = Math.floor(S.time * 4) % 2 === 0;
      ctx.fillStyle = phase ? '#ff2e2e' : '#2e7dff';
      ctx.fillRect(-4, -W / 2 - 2, 8, 4);
      ctx.fillStyle = phase ? '#2e7dff' : '#ff2e2e';
      ctx.fillRect(-4, W / 2 - 2, 8, 4);
    }
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', 0, 0);
    }
    // Damage smoke is spawned by the physics; draw scorch if dead.
    if (car.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, -L / 2, -W / 2, L, W, 7);
      ctx.fill();
    }
    ctx.restore();
    // Brake light glow when the player car reverses / brakes.
    if (car.driver === 'player' && car.speed < -10) {
      ctx.fillStyle = 'rgba(255,40,40,0.5)';
      ctx.beginPath(); ctx.arc(car.x - Math.cos(car.angle) * (L / 2), car.y - Math.sin(car.angle) * (L / 2), 12, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawPeds(S, ctx, inView) {
  for (const ped of S.peds) {
    if (!inView(ped.x, ped.y, 40)) continue;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.dead) {
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(-9, -4, 18, 8);
      ctx.restore();
      continue;
    }
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 3, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    // Body.
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(Math.cos(ped.angle) * 4, Math.sin(ped.angle) * 4, 5, 0, Math.PI * 2); ctx.fill();
    // Hitman marker.
    if (ped.kind === 'hitman') {
      ctx.fillStyle = '#ff2e2e';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, -16);
    }
    ctx.restore();
  }
  // Player on foot.
  const p = S.player;
  if (p.onFoot && !p.dead) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 4, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Jacket.
    ctx.fillStyle = '#ff2e63';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 5, Math.sin(p.angle) * 5, 6, 0, Math.PI * 2); ctx.fill();
    // Weapon in hand.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.angle) * 8, Math.sin(p.angle) * 8);
    ctx.lineTo(Math.cos(p.angle) * 20, Math.sin(p.angle) * 20);
    ctx.stroke();
    // Muzzle flash.
    if (p.muzzle > 0) {
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 26, Math.sin(p.angle) * 26, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawPolice(S, ctx, inView) {
  for (const off of S.police) {
    if (!inView(off.x, off.y, 40)) continue;
    ctx.save();
    ctx.translate(off.x, off.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 3, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a2a4a';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(Math.cos(off.angle) * 4, Math.sin(off.angle) * 4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(0, -11, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawHeli(S, ctx, inView) {
  const h = S.heli;
  if (!h || !inView(h.x, h.y, 200)) return;
  ctx.save();
  ctx.translate(h.x, h.y);
  // Spotlight cone onto the player.
  const p = S.player;
  const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 260);
  grad.addColorStop(0, 'rgba(255,250,200,0.20)');
  grad.addColorStop(1, 'rgba(255,250,200,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(p.x - h.x, p.y - h.y, 260, 0, Math.PI * 2); ctx.fill();
  // Body.
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); ctx.ellipse(0, 0, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('AIR ONE', 0, 0);
  // Rotor.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 3;
  const ra = h.angle;
  ctx.beginPath();
  ctx.moveTo(Math.cos(ra) * -34, Math.sin(ra) * -34);
  ctx.lineTo(Math.cos(ra) * 34, Math.sin(ra) * 34);
  ctx.stroke();
  ctx.restore();
}

function drawBullets(S, ctx) {
  for (const b of S.bullets) {
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawParticles(S, ctx) {
  for (const pt of S.particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawNightLights(S, ctx, vx0, vy0, vx1, vy1) {
  // Headlight cone from the player's car at night.
  const p = S.player;
  if (!p.onFoot && p.car) {
    const car = p.car;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const grad = ctx.createLinearGradient(0, 0, 260, 0);
    grad.addColorStop(0, 'rgba(255,240,180,0.20)');
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(car.length / 2, -10);
    ctx.lineTo(car.length / 2 + 260, -70);
    ctx.lineTo(car.length / 2 + 260, 70);
    ctx.lineTo(car.length / 2, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Lamp glows.
  for (const prop of S.props) {
    if (prop.kind !== 'lamp') continue;
    if (prop.x < vx0 - 80 || prop.x > vx1 + 80 || prop.y < vy0 - 80 || prop.y > vy1 + 80) continue;
    const grad = ctx.createRadialGradient(prop.x, prop.y, 4, prop.x, prop.y, 70);
    grad.addColorStop(0, 'rgba(255,220,130,0.16)');
    grad.addColorStop(1, 'rgba(255,220,130,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(prop.x, prop.y, 70, 0, Math.PI * 2); ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
