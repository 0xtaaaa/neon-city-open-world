// Neon City — weapons: pistol, shotgun and SMG. Mouse aim, magazines,
// reloads, bullet flight, impacts and the gunsmith shop.

import { CFG, clamp } from './config.js';
import { buildingAt } from './world.js';
import { sfx } from './audio.js';
import { aimAngle } from './input.js';
import { killPed, bloodBurst } from './entities.js';
import { hurtPlayer } from './vehicles.js';
import { addWanted } from './state.js';
import { damageCar } from './vehicles.js';
import { rand } from './random.js';

// Fire the player's current weapon (on foot only).
export function tryShoot(S) {
  const p = S.player;
  if (p.onFoot === false) return;
  const def = CFG.WEAPONS[p.weapon];
  const slot = p.weapons[p.weapon];
  if (!slot || !slot.owned) return;
  if (p.fireTimer > 0 || p.reloadTimer > 0) return;
  if (slot.mag <= 0) {
    startReload(S);
    return;
  }
  p.fireTimer = def.rate;
  slot.mag -= 1;
  S.stats.shotsFired++;
  p.muzzle = 0.06;
  p.angle = aimAngle(S, p.x, p.y);
  const base = p.angle;
  for (let i = 0; i < def.pellets; i++) {
    const a = base + rand(-def.spread, def.spread);
    S.bullets.push({
      x: p.x + Math.cos(base) * 22, y: p.y + Math.sin(base) * 22,
      vx: Math.cos(a) * def.bulletSpeed, vy: Math.sin(a) * def.bulletSpeed,
      damage: def.damage, from: 'player', life: def.range / def.bulletSpeed,
      color: def.color,
    });
  }
  sfx.shoot(p.weapon);
  S.shake = Math.max(S.shake, def.kick * 0.6);
  // Firing in public draws attention.
  if (Math.random() < 0.5) addWanted(S, 5);
  if (slot.mag === 0) startReload(S);
}

export function startReload(S) {
  const p = S.player;
  const def = CFG.WEAPONS[p.weapon];
  const slot = p.weapons[p.weapon];
  if (!slot || p.reloadTimer > 0) return;
  if (slot.reserve !== Infinity && slot.reserve <= 0) {
    return; // dry: buy ammo at the gunsmith
  }
  p.reloadTimer = def.reload;
  sfx.reload();
}

export function finishReload(S) {
  const p = S.player;
  const def = CFG.WEAPONS[p.weapon];
  const slot = p.weapons[p.weapon];
  if (!slot) return;
  const need = def.mag - slot.mag;
  if (slot.reserve === Infinity) {
    slot.mag = def.mag;
  } else {
    const take = Math.min(need, slot.reserve);
    slot.mag += take;
    slot.reserve -= take;
  }
}

// Switch to a weapon slot (1/2/3) if owned.
export function switchWeapon(S, key) {
  const p = S.player;
  const map = { pistol: 'pistol', shotgun: 'shotgun', smg: 'smg' };
  const want = map[key];
  if (!want) return;
  if (p.weapons[want] && p.weapons[want].owned) {
    p.weapon = want;
    p.reloadTimer = 0;
    sfx.click();
  }
}

// Advance all bullets: move, collide with buildings, peds, cars, player.
export function updateBullets(S, dt) {
  for (const b of S.bullets) {
    b.life -= dt;
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    b.x = nx; b.y = ny;
    if (b.life <= 0) { b.dead = true; continue; }
    // Buildings stop bullets.
    if (buildingAt(S, b.x, b.y)) {
      impact(S, b.x, b.y, '#c9c9c9');
      b.dead = true;
      continue;
    }
    // Player-fired bullets hit peds, police and cars.
    if (b.from === 'player') {
      let hit = false;
      for (const ped of S.peds) {
        if (!ped.dead && Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
          ped.hp -= b.damage;
          bloodBurst(S, b.x, b.y);
          if (ped.hp <= 0) killPed(S, ped, true);
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const off of S.police) {
          if (Math.hypot(off.x - b.x, off.y - b.y) < 14) {
            off.hp -= b.damage;
            bloodBurst(S, b.x, b.y);
            if (off.hp <= 0) {
              S.police.splice(S.police.indexOf(off), 1);
              S.stats.kills++;
              addWanted(S, 10);
            }
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        for (const car of S.cars) {
          if (car.dead) continue;
          const dx = b.x - car.x, dy = b.y - car.y;
          const along = Math.abs(Math.cos(car.angle) * dx + Math.sin(car.angle) * dy);
          const across = Math.abs(-Math.sin(car.angle) * dx + Math.cos(car.angle) * dy);
          if (along < car.length / 2 + 4 && across < 14) {
            damageCar(S, car, b.damage);
            impact(S, b.x, b.y, '#ffcf5c');
            hit = true;
            break;
          }
        }
      }
      if (hit) { b.dead = true; continue; }
    }
    // Enemy bullets hit the player (and their car).
    if (b.from === 'police' || b.from === 'heli' || b.from === 'hitman') {
      const p = S.player;
      const target = p.onFoot ? { x: p.x, y: p.y, r: 14 } : p.car
        ? { x: p.car.x, y: p.car.y, r: 24 } : null;
      if (target && Math.hypot(target.x - b.x, target.y - b.y) < target.r) {
        if (p.onFoot) hurtPlayer(S, b.damage);
        else if (p.car) damageCar(S, p.car, b.damage * 0.5);
        impact(S, b.x, b.y, '#ff6b6b');
        b.dead = true;
      }
    }
  }
  S.bullets = S.bullets.filter((b) => !b.dead);
}

function impact(S, x, y, color) {
  for (let i = 0; i < 5; i++) {
    S.particles.push({
      kind: 'spark', x, y,
      vx: rand(-90, 90), vy: rand(-90, 90),
      life: rand(0.15, 0.35), maxLife: 0.35, size: rand(1, 3), color,
    });
  }
}

// ---- Gunsmith shop ----
export const GUNSMITH_STOCK = [
  { id: 'pistol_ammo', label: 'Pistol ammo (12)', price: 25, apply(S) { S.player.weapons.pistol.reserve = Infinity; } },
  { id: 'shotgun', label: 'Shotgun', price: 900, apply(S) { buyWeapon(S, 'shotgun'); } },
  { id: 'shotgun_ammo', label: 'Shotgun shells (12)', price: 60, apply(S) { S.player.weapons.shotgun.reserve += 12; } },
  { id: 'smg', label: 'SMG', price: 1600, apply(S) { buyWeapon(S, 'smg'); } },
  { id: 'smg_ammo', label: 'SMG ammo (32)', price: 80, apply(S) { S.player.weapons.smg.reserve += 32; } },
  { id: 'armor', label: 'Body armour (50)', price: 300, apply(S) { S.player.armor = Math.min(CFG.PLAYER_ARMOR_MAX, S.player.armor + 50); } },
  { id: 'health', label: 'First-aid kit (full heal)', price: 150, apply(S) { S.player.health = CFG.PLAYER_HEALTH; } },
];

function buyWeapon(S, key) {
  const def = CFG.WEAPONS[key];
  const slot = S.player.weapons[key];
  slot.owned = true;
  slot.mag = def.mag;
  slot.reserve = key === 'pistol' ? Infinity : def.mag * 2;
  S.player.weapon = key;
}

// Buy a gunsmith item by id. Returns a message for the UI.
export function buyFromGunsmith(S, id) {
  const item = GUNSMITH_STOCK.find((i) => i.id === id);
  if (!item) return 'No such item.';
  if (id === 'shotgun' && S.player.weapons.shotgun.owned) return 'You already own the shotgun.';
  if (id === 'smg' && S.player.weapons.smg.owned) return 'You already own the SMG.';
  if ((id === 'shotgun_ammo' || id === 'smg_ammo') && !S.player.weapons[id.split('_')[0]].owned) {
    return 'Buy the weapon first.';
  }
  if (S.money < item.price) return 'Not enough cash.';
  S.money -= item.price;
  item.apply(S);
  sfx.cash();
  return 'Bought: ' + item.label + ' ($' + item.price + ')';
}
