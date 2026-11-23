// Neon City — the city itself: road grid, blocks, buildings, shops,
// props and the collision helpers every system uses. The map is built once
// from a fixed seed, so it is identical on every run.

import { CFG } from './config.js';
import { mulberry32, rand, randi, pick, chance } from './random.js';

const BUILDING_COLORS = [
  '#5d6d7e', '#6e7f80', '#7d6b91', '#8a7d6b', '#5b7a8c',
  '#7a6a5f', '#6b7a5e', '#836f6f', '#4f6d7a', '#757575',
];
const ROOF_COLORS = ['#3d4852', '#4a3f35', '#37474f', '#5d4037', '#455a64'];

// Named locations. Each shop sits in its own building; the door point is
// where the player stands to interact (F).
const SHOP_DEFS = [
  { kind: 'gunsmith', name: 'Ironworks Guns', bx: 2, by: 2, color: '#7a4a3a' },
  { kind: 'spray', name: 'Spray & Go', bx: 5, by: 1, color: '#3a6e7a' },
  { kind: 'hospital', name: 'St. Marina Hospital', bx: 1, by: 5, color: '#7a7a8c' },
  { kind: 'police', name: 'NCPD Headquarters', bx: 6, by: 6, color: '#3a4a6e' },
  { kind: 'club', name: 'Club Mirage', bx: 4, by: 4, color: '#8a3a6e' },
  { kind: 'warehouse', name: 'Harbor Warehouse', bx: 7, by: 2, color: '#6e5a3a' },
  { kind: 'bank', name: 'Neon Bank', bx: 3, by: 6, color: '#4a6e5a' },
  { kind: 'hideout', name: 'Safehouse', bx: 2, by: 7, color: '#5e4a7a' },
  { kind: 'diner', name: 'Sunset Diner', bx: 6, by: 3, color: '#a05a3a' },
];

export function buildCity(S) {
  const rng = mulberry32(20261123);
  S.roadLines = [];
  for (let i = 0; i < 9; i++) {
    S.roadLines.push({ axis: 'v', at: CFG.FIRST_ROAD + i * CFG.BLOCK_PITCH });
    S.roadLines.push({ axis: 'h', at: CFG.FIRST_ROAD + i * CFG.BLOCK_PITCH });
  }

  S.buildings = [];
  S.props = [];
  S.shops = [];
  S.markers = [];

  const half = CFG.ROAD_W / 2 + 14; // sidewalk margin around a block
  const shopByBlock = {};
  for (const s of SHOP_DEFS) shopByBlock[s.bx + ',' + s.by] = s;

  // Blocks: 8 x 8 between the 9 road lines.
  for (let bx = 0; bx < 8; bx++) {
    for (let by = 0; by < 8; by++) {
      const x0 = CFG.FIRST_ROAD + bx * CFG.BLOCK_PITCH + half;
      const y0 = CFG.FIRST_ROAD + by * CFG.BLOCK_PITCH + half;
      const x1 = CFG.FIRST_ROAD + (bx + 1) * CFG.BLOCK_PITCH - half;
      const y1 = CFG.FIRST_ROAD + (by + 1) * CFG.BLOCK_PITCH - half;
      const key = bx + ',' + by;
      const shop = shopByBlock[key];

      // Central park (blocks 3,3 / 4,3) and the plaza (block 4,5).
      if ((bx === 3 && by === 3) || (bx === 4 && by === 3)) {
        makePark(S, x0, y0, x1, y1, rng);
        continue;
      }
      if (bx === 4 && by === 5) {
        makePlaza(S, x0, y0, x1, y1, rng);
        continue;
      }

      if (shop) {
        // One big named building filling most of the block.
        const b = {
          x: x0 + 14, y: y0 + 14, w: (x1 - x0) - 28, h: (y1 - y0) - 28,
          color: shop.color, roof: pick(ROOF_COLORS, rng),
          sign: shop.name, kind: shop.kind, lit: chance(0.8, rng),
        };
        S.buildings.push(b);
        S.shops.push({
          kind: shop.kind, name: shop.name,
          x: b.x + b.w / 2, y: b.y + b.h + 26, // door on the south sidewalk
          building: b,
        });
        continue;
      }

      // Ordinary block: 1-4 buildings with gaps.
      const n = randi(1, 3, rng);
      if (n === 1) {
        pushBuilding(S, x0 + 20, y0 + 20, (x1 - x0) - 40, (y1 - y0) - 40, rng);
      } else if (n === 2) {
        const split = chance(0.5, rng);
        if (split) {
          const mid = (x0 + x1) / 2;
          pushBuilding(S, x0 + 14, y0 + 16, mid - x0 - 28, (y1 - y0) - 32, rng);
          pushBuilding(S, mid + 14, y0 + 16, x1 - mid - 28, (y1 - y0) - 32, rng);
        } else {
          const mid = (y0 + y1) / 2;
          pushBuilding(S, x0 + 16, y0 + 14, (x1 - x0) - 32, mid - y0 - 28, rng);
          pushBuilding(S, x0 + 16, mid + 14, (x1 - x0) - 32, y1 - mid - 28, rng);
        }
      } else {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        pushBuilding(S, x0 + 12, y0 + 12, mx - x0 - 24, my - y0 - 24, rng);
        pushBuilding(S, mx + 12, y0 + 12, x1 - mx - 24, my - y0 - 24, rng);
        pushBuilding(S, x0 + 12, my + 12, mx - x0 - 24, y1 - my - 24, rng);
        pushBuilding(S, mx + 12, my + 12, x1 - mx - 24, y1 - my - 24, rng);
      }

      // Sidewalk props: trees and lamps around the block edge.
      const treeCount = randi(2, 5, rng);
      for (let i = 0; i < treeCount; i++) {
        S.props.push({
          kind: 'tree',
          x: rand(x0, x1, rng), y: chance(0.5, rng) ? y0 + 6 : y1 - 6,
          r: rand(7, 11, rng),
        });
      }
    }
  }

  // Lamps at every intersection.
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const x = CFG.FIRST_ROAD + i * CFG.BLOCK_PITCH;
      const y = CFG.FIRST_ROAD + j * CFG.BLOCK_PITCH;
      S.props.push({ kind: 'lamp', x: x + CFG.ROAD_W / 2 + 8, y: y + CFG.ROAD_W / 2 + 8, r: 4 });
      if (chance(0.4, rng)) S.props.push({ kind: 'hydrant', x: x - CFG.ROAD_W / 2 - 10, y: y - CFG.ROAD_W / 2 - 10, r: 5 });
    }
  }

  // Crates near the warehouse block.
  for (let i = 0; i < 8; i++) {
    S.props.push({ kind: 'crate', x: rand(2950, 3250, rng), y: rand(950, 1250, rng), r: 10 });
  }

  // Beach along the south edge, harbour along the north edge.
  S.beach = { y0: CFG.WORLD_H - 130, waterY: CFG.WORLD_H - 52 };
  S.harbour = { y1: 120, waterY: 52 };
}

function pushBuilding(S, x, y, w, h, rng) {
  if (w < 40 || h < 40) return;
  S.buildings.push({
    x, y, w, h,
    color: pick(BUILDING_COLORS, rng),
    roof: pick(ROOF_COLORS, rng),
    sign: null, kind: null,
    lit: chance(0.7, rng),
    windows: randi(2, 5, rng),
  });
}

function makePark(S, x0, y0, x1, y1, rng) {
  for (let i = 0; i < 14; i++) {
    S.props.push({ kind: 'tree', x: rand(x0 + 10, x1 - 10, rng), y: rand(y0 + 10, y1 - 10, rng), r: rand(9, 15, rng) });
  }
  S.props.push({ kind: 'pond', x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: 52 });
  for (let i = 0; i < 4; i++) {
    S.props.push({ kind: 'bench', x: rand(x0 + 20, x1 - 20, rng), y: rand(y0 + 20, y1 - 20, rng), r: 8 });
  }
}

function makePlaza(S, x0, y0, x1, y1, rng) {
  S.props.push({ kind: 'fountain', x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: 34 });
  for (let i = 0; i < 6; i++) {
    S.props.push({ kind: 'tree', x: rand(x0 + 12, x1 - 12, rng), y: rand(y0 + 12, y1 - 12, rng), r: rand(8, 12, rng) });
  }
  void rng;
}

// Is the point on a road (or in the beach/harbour strips)?
export function isOnRoad(S, x, y) {
  const hw = CFG.ROAD_W / 2;
  for (const line of S.roadLines) {
    if (line.axis === 'v' && Math.abs(x - line.at) <= hw) return true;
    if (line.axis === 'h' && Math.abs(y - line.at) <= hw) return true;
  }
  return false;
}

// Snap a point to the nearest road centre line.
export function nearestRoadPoint(S, x, y) {
  let best = null, bestD = Infinity;
  for (const line of S.roadLines) {
    const d = line.axis === 'v' ? Math.abs(x - line.at) : Math.abs(y - line.at);
    if (d < bestD) { bestD = d; best = line; }
  }
  if (!best) return { x, y };
  return best.axis === 'v' ? { x: best.at, y } : { x, y: best.at };
}

// A random point on a random road (for spawning traffic / peds).
export function randomRoadPos(S, rng = Math.random) {
  const line = S.roadLines[Math.floor(rng() * S.roadLines.length)];
  const along = rand(120, CFG.WORLD_W - 120, rng);
  return line.axis === 'v'
    ? { x: line.at + rand(-28, 28, rng), y: along, axis: 'v' }
    : { x: along, y: line.at + rand(-28, 28, rng), axis: 'h' };
}

// Find the building containing a point (or null).
export function buildingAt(S, x, y) {
  for (const b of S.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of every building it overlaps. Returns corrected x/y.
export function collideBuildings(S, x, y, r) {
  for (const b of S.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else {
        // Centre inside the building: push out along the smallest axis.
        const left = x - b.x, right = b.x + b.w - x;
        const top = y - b.y, bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  return { x, y };
}

// Keep a point inside the world (the beach and harbour are walkable).
export function clampToWorld(x, y, r) {
  return {
    x: Math.max(r, Math.min(CFG.WORLD_W - r, x)),
    y: Math.max(r, Math.min(CFG.WORLD_H - r, y)),
  };
}
