// Neon City — HUD and menus. The HUD (health, money, wanted stars,
// minimap, mission tracker) is drawn on the canvas in screen space; the
// title, pause, shop, dialogue and death screens are DOM overlays wired
// up here.

import { CFG, rankIndex, clamp } from './config.js';
import { clockString, isNight } from './state.js';
import { racePosition } from './races.js';

// ---- Canvas HUD ----
export function drawHUD(S, ctx, view) {
  const p = S.player;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Health + armour bars (top left).
  bar(ctx, 16, 16, 220, 16, p.health / CFG.PLAYER_HEALTH, '#2ecc71', '#222');
  bar(ctx, 16, 36, 220, 10, p.armor / CFG.PLAYER_ARMOR_MAX, '#3498db', '#222');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(Math.ceil(p.health) + ' HP', 244, 29);
  if (p.armor > 0) ctx.fillText(Math.ceil(p.armor) + ' ARMOUR', 244, 45);

  // Money + respect (top left, under bars).
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#7CFC00';
  ctx.fillText('$' + S.money.toLocaleString('en-US'), 16, 76);
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#ffd166';
  ctx.fillText('RESPECT: ' + CFG.RANKS[rankIndex(S.respect)].name + '  (' + S.respect + ')', 16, 96);

  // Mission tracker.
  if (S.objectiveText) {
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('▶ ' + S.objectiveText, 16, 122);
    if (S.objectivePos) {
      const d = Math.hypot(p.x - S.objectivePos.x, p.y - S.objectivePos.y);
      ctx.fillStyle = '#fff';
      ctx.fillText(Math.round(d) + 'm', 16, 142);
    }
  }

  // Wanted stars (top right).
  const stars = S.wanted;
  ctx.font = '28px monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ffcf3f' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', view.w - 16 - i * 30, 40);
  }
  ctx.textAlign = 'left';

  // Clock + radio (top right, under stars).
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.fillText(clockString(S) + (isNight(S) ? '  ☾' : '  ☀'), view.w - 16, 64);
  ctx.fillStyle = S.radioOn ? '#7bd389' : '#888';
  ctx.fillText('♪ ' + CFG.RADIO[S.radioStation].name + (S.radioOn ? '' : ' (off)'), view.w - 16, 84);
  ctx.textAlign = 'left';

  // Weapon + ammo (bottom left).
  const def = CFG.WEAPONS[p.weapon];
  const slot = p.weapons[p.weapon];
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#fff';
  const ammoText = slot.reserve === Infinity ? slot.mag + ' / ∞' : slot.mag + ' / ' + slot.reserve;
  ctx.fillText(def.name + '  ' + ammoText + (p.reloadTimer > 0 ? '  RELOADING…' : ''), 16, view.h - 52);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#aaa';
  ctx.fillText('[1] Pistol  [2] Shotgun  [3] SMG    [E] Enter car  [F] Interact  [R] Reload  [M] Radio  [H] Help', 16, view.h - 28);

  // Toasts (top centre).
  ctx.textAlign = 'center';
  let ty = 56;
  for (const m of S.messages) {
    ctx.globalAlpha = clamp(m.t / 1.2, 0, 1);
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = m.color;
    ctx.fillText(m.text, view.w / 2, ty);
    ty += 24;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  // Race HUD.
  if (S.race) {
    const r = S.race;
    ctx.textAlign = 'center';
    if (r.countdown > 0) {
      ctx.font = 'bold 64px monospace';
      ctx.fillStyle = '#ffd166';
      ctx.fillText(Math.ceil(r.countdown), view.w / 2, view.h / 2 - 40);
    } else {
      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText('LAP ' + r.lap + '/' + r.totalLaps + '   —   ' + racePosition(S) + (['st', 'nd', 'rd', 'th'][racePosition(S) - 1] || 'th'), view.w / 2, 110);
    }
    ctx.textAlign = 'left';
  }

  // Minimap (bottom right).
  drawMinimap(S, ctx, view);

  // Low-health vignette.
  if (p.health < 30 && p.health > 0) {
    const pulse = 0.12 + 0.08 * Math.sin(S.time * 6);
    ctx.fillStyle = `rgba(255,0,0,${pulse})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }
  ctx.restore();
}

function bar(ctx, x, y, w, h, frac, color, bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

function drawMinimap(S, ctx, view) {
  const size = 168;
  const x0 = view.w - size - 14;
  const y0 = view.h - size - 14;
  const scale = size / CFG.WORLD_W;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.82)';
  ctx.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 - 4.5, y0 - 4.5, size + 9, size + 9);
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  // Water + beach.
  ctx.fillStyle = '#2e86c1';
  ctx.fillRect(x0, y0 + (CFG.WORLD_H - 52) * scale, size, 52 * scale);
  // Roads.
  ctx.strokeStyle = '#7a7f88';
  ctx.lineWidth = 2;
  for (const line of S.roadLines) {
    ctx.beginPath();
    if (line.axis === 'v') {
      ctx.moveTo(x0 + line.at * scale, y0);
      ctx.lineTo(x0 + line.at * scale, y0 + size);
    } else {
      ctx.moveTo(x0, y0 + line.at * scale);
      ctx.lineTo(x0 + size, y0 + line.at * scale);
    }
    ctx.stroke();
  }
  // Shops.
  ctx.fillStyle = '#7bd389';
  for (const s of S.shops) {
    ctx.fillRect(x0 + s.x * scale - 2, y0 + s.y * scale - 2, 4, 4);
  }
  // Race checkpoints.
  if (S.race) {
    ctx.fillStyle = '#ff8c42';
    for (const cp of S.race.checkpoints) {
      ctx.fillRect(x0 + cp.x * scale - 2, y0 + cp.y * scale - 2, 4, 4);
    }
  }
  // Police.
  ctx.fillStyle = '#ff2e2e';
  for (const car of S.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    ctx.beginPath(); ctx.arc(x0 + car.x * scale, y0 + car.y * scale, 3, 0, Math.PI * 2); ctx.fill();
  }
  if (S.heli) {
    ctx.beginPath(); ctx.arc(x0 + S.heli.x * scale, y0 + S.heli.y * scale, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Mission marker (pulsing yellow).
  const marker = S.objectivePos || missionMarkerPos(S);
  if (marker) {
    const pulse = 3 + Math.sin(S.time * 5) * 1.5;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(x0 + marker.x * scale, y0 + marker.y * scale, pulse, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow.
  const p = S.player;
  ctx.save();
  ctx.translate(x0 + p.x * scale, y0 + p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // North label.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('N', x0 + size / 2 - 3, y0 + 11);
  ctx.restore();
}

function missionMarkerPos(S) {
  if (S.missionIndex >= 0) return null;
  return null;
}

// ---- DOM overlays ----
const $ = (id) => document.getElementById(id);

export function showOverlay(id) {
  for (const name of ['title', 'pause', 'help', 'shop', 'dead', 'dialogue']) {
    const el = $(name);
    if (el) el.style.display = name === id ? 'flex' : 'none';
  }
  if (!id) {
    for (const name of ['title', 'pause', 'help', 'shop', 'dead', 'dialogue']) {
      const el = $(name);
      if (el) el.style.display = 'none';
    }
  }
}

export function setDialogue(S) {
  const d = S.dialogue;
  const box = $('dialogue');
  if (!d || !box) return;
  box.style.display = 'flex';
  $('dlg-speaker').textContent = d.speaker;
  const line = d.lines[d.i] || '';
  $('dlg-text').textContent = line.slice(0, Math.floor(d.chars));
}

export function setDeadScreen(S) {
  const title = S.deathKind === 'busted' ? 'BUSTED' : 'WASTED';
  $('dead-title').textContent = title;
  $('dead-title').style.color = S.deathKind === 'busted' ? '#7db3ff' : '#ff5b5b';
  $('dead-loss').textContent = 'You lost $' + (S.deathLoss || 0) + ' — the city keeps moving.';
}

export function buildShopMenu(S, kind, onBuy) {
  const panel = $('shop-items');
  panel.innerHTML = '';
  const title = kind === 'gunsmith' ? 'Ironworks Guns' : kind === 'spray' ? 'Spray & Go' : 'Shop';
  $('shop-title').textContent = title;
  $('shop-money').textContent = 'Cash: $' + S.money.toLocaleString('en-US');
  $('shop-msg').textContent = '';

  if (kind === 'gunsmith') {
    const stock = [
      { id: 'pistol_ammo', label: 'Pistol ammo (12)', price: 25 },
      { id: 'shotgun', label: 'Shotgun', price: 900 },
      { id: 'shotgun_ammo', label: 'Shotgun shells (12)', price: 60 },
      { id: 'smg', label: 'SMG', price: 1600 },
      { id: 'smg_ammo', label: 'SMG ammo (32)', price: 80 },
      { id: 'armor', label: 'Body armour (50)', price: 300 },
      { id: 'health', label: 'First-aid kit (full heal)', price: 150 },
    ];
    for (const item of stock) {
      const b = document.createElement('button');
      b.className = 'shop-btn';
      b.textContent = item.label + ' — $' + item.price;
      b.onclick = () => {
        const msg = onBuy(item.id);
        $('shop-msg').textContent = msg;
        $('shop-money').textContent = 'Cash: $' + S.money.toLocaleString('en-US');
      };
      panel.appendChild(b);
    }
  } else if (kind === 'spray') {
    const car = S.player.car;
    const b1 = document.createElement('button');
    b1.className = 'shop-btn';
    b1.textContent = 'Repair car — $' + CFG.REPAIR_COST + (car ? ' (HP ' + Math.ceil(car.hp) + '/100)' : ' (no car)');
    b1.onclick = () => {
      if (!car) { $('shop-msg').textContent = 'Bring a car first.'; return; }
      if (S.money < CFG.REPAIR_COST) { $('shop-msg').textContent = 'Not enough cash.'; return; }
      S.money -= CFG.REPAIR_COST;
      car.hp = 100; car.dead = false;
      $('shop-msg').textContent = 'Car repaired to full.';
      $('shop-money').textContent = 'Cash: $' + S.money.toLocaleString('en-US');
    };
    panel.appendChild(b1);
    const colors = ['#ff2e63', '#08d9d6', '#f9ed69', '#ff8c42', '#c0392b', '#2980b9'];
    for (const c of colors) {
      const b = document.createElement('button');
      b.className = 'shop-btn';
      b.textContent = 'Repaint ' + c + ' — $80';
      b.style.borderLeft = '12px solid ' + c;
      b.onclick = () => {
        if (S.money < 80) { $('shop-msg').textContent = 'Not enough cash.'; return; }
        S.money -= 80;
        S.player.paint = c;
        if (car) car.color = c;
        $('shop-msg').textContent = 'Fresh paint: ' + c;
        $('shop-money').textContent = 'Cash: $' + S.money.toLocaleString('en-US');
      };
      panel.appendChild(b);
    }
  }
}
