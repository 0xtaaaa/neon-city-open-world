// Neon City — save / load through localStorage. Saves money, respect,
// missions, weapons, position and the time of day. Loading restores the
// open world exactly where the player left it.

import { CFG } from './config.js';

export function saveGame(S) {
  try {
    const p = S.player;
    const data = {
      version: 3,
      money: S.money,
      respect: S.respect,
      dayTime: S.dayTime,
      completedMissions: S.completedMissions,
      player: {
        x: p.x, y: p.y, angle: p.angle,
        health: p.health, armor: p.armor,
        weapon: p.weapon,
        // JSON turns Infinity into null, so store it as -1.
        weapons: Object.fromEntries(Object.entries(p.weapons).map(([k, w]) => [
          k, { owned: w.owned, mag: w.mag, reserve: w.reserve === Infinity ? -1 : w.reserve },
        ])),
        paint: p.paint,
      },
      stats: S.stats,
    };
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 3) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function applySave(S, data) {
  S.money = data.money;
  S.respect = data.respect;
  S.dayTime = data.dayTime || 60;
  S.completedMissions = data.completedMissions || [];
  const p = S.player;
  p.x = data.player.x; p.y = data.player.y; p.angle = data.player.angle || 0;
  p.health = data.player.health ?? CFG.PLAYER_HEALTH;
  p.armor = data.player.armor || 0;
  p.weapon = data.player.weapon || 'pistol';
  if (data.player.weapons) {
    for (const [k, w] of Object.entries(data.player.weapons)) {
      if (p.weapons[k]) {
        p.weapons[k].owned = !!w.owned;
        p.weapons[k].mag = w.mag || 0;
        // -1 (or null from an old save) means unlimited reserve.
        p.weapons[k].reserve = (w.reserve === -1 || w.reserve === null || w.reserve === undefined)
          ? Infinity : w.reserve;
      }
    }
  }
  p.paint = data.player.paint || p.paint;
  p.onFoot = true; p.car = null;
  S.stats = Object.assign(S.stats, data.stats || {});
  S.camera.x = p.x; S.camera.y = p.y;
}

export function hasSave() {
  try {
    return !!localStorage.getItem(CFG.SAVE_KEY);
  } catch (err) {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(CFG.SAVE_KEY); } catch (err) { /* ignore */ }
}
