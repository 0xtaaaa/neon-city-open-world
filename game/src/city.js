// Neon City's map: a grid of roads, the blocks between them, and the
// buildings and parks that fill those blocks. Everything is laid out once,
// from the seeded random, so the city never changes between visits.

import { WORLD, PALETTE } from './config.js';
import { pick } from './random.js';

/** True when the point is on a road (within half a road width of a road line). */
export function onRoad(x, y) {
  const half = WORLD.roadWidth / 2;
  for (const line of WORLD.lines) {
    if (Math.abs(x - line) <= half || Math.abs(y - line) <= half) return true;
  }
  return false;
}

/** The nearest point on a road centre line, for snapping spawns onto streets. */
export function nearestRoadPoint(x, y) {
  let bestX = WORLD.lines[0];
  let bestY = WORLD.lines[0];
  for (const line of WORLD.lines) {
    if (Math.abs(line - x) < Math.abs(bestX - x)) bestX = line;
    if (Math.abs(line - y) < Math.abs(bestY - y)) bestY = line;
  }
  // Snap to whichever axis is closer, so the point lands on a road, not a corner.
  return Math.abs(bestX - x) < Math.abs(bestY - y) ? { x: bestX, y } : { x, y: bestY };
}

/** All road intersections, for mission targets and traffic waypoints. */
export function intersections() {
  const points = [];
  for (const x of WORLD.lines) {
    for (const y of WORLD.lines) points.push({ x, y });
  }
  return points;
}

/**
 * Build the city. Blocks are the squares between neighbouring road lines;
 * most hold one to three buildings, a few are parks, and the corners hold
 * the story places: the garage, the hideout and the hospital.
 */
export function generateCity(random) {
  const buildings = [];
  const parks = [];
  const lines = WORLD.lines;
  const half = WORLD.roadWidth / 2;

  for (let i = 0; i < lines.length - 1; i += 1) {
    for (let j = 0; j < lines.length - 1; j += 1) {
      const x0 = lines[i] + half + 14;
      const y0 = lines[j] + half + 14;
      const x1 = lines[i + 1] - half - 14;
      const y1 = lines[j + 1] - half - 14;
      const w = x1 - x0;
      const h = y1 - y0;
      // One block in seven is a park; the rest are built up.
      if (random() < 0.14) {
        const trees = [];
        const count = 6 + Math.floor(random() * 6);
        for (let t = 0; t < count; t += 1) {
          trees.push({
            x: x0 + 20 + random() * (w - 40),
            y: y0 + 20 + random() * (h - 40),
            r: 9 + random() * 9,
          });
        }
        parks.push({ x: x0, y: y0, w, h, trees });
        continue;
      }
      const count = 1 + Math.floor(random() * 3);
      for (let b = 0; b < count; b += 1) {
        const bw = 60 + random() * 90;
        const bh = 60 + random() * 90;
        const bx = x0 + random() * Math.max(1, w - bw);
        const by = y0 + random() * Math.max(1, h - bh);
        buildings.push({
          x: bx,
          y: by,
          w: bw,
          h: bh,
          color: pick(random, PALETTE.building),
          // Window lights, fixed at build time so they never flicker.
          windows: Array.from({ length: 6 }, () => ({
            dx: 8 + random() * (bw - 16),
            dy: 8 + random() * (bh - 16),
            lit: random() < 0.45,
          })),
        });
      }
    }
  }

  return {
    buildings,
    parks,
    garage: { x: 600, y: 200 },
    hideout: { x: 2600, y: 2600 },
    hospital: { x: 200, y: 2600 },
    // Where the player starts: on foot, outside the garage.
    playerStart: { x: 600, y: 280 },
    // Shops: the gunsmith restocks weapon pickups, the diner heals,
    // the clothes shop is pure Neon City flavour. All three are drawn
    // on the map and the minimap.
    shops: [
      { x: 1000, y: 600, label: 'GUNSMITH', kind: 'guns' },
      { x: 2200, y: 1400, label: 'DINER', kind: 'food' },
      { x: 1400, y: 2200, label: 'CLOTHES', kind: 'clothes' },
    ],
    // The street race starts on the central crossroads.
    raceStart: { x: 1800, y: 1800 },
    // Turf War corners: hold all three and the districts are yours.
    turfSpots: [
      { x: 600, y: 2600, label: 'West Turf' },
      { x: 2600, y: 600, label: 'East Turf' },
      { x: 1400, y: 1400, label: 'Central Turf' },
    ],
  };
}

/** The district name for a point, for the HUD and the turf war. */
export function districtAt(x, y) {
  const mid = WORLD.size / 2;
  if (x < mid && y < mid) return 'Downtown';
  if (x >= mid && y < mid) return 'Harbor';
  if (x < mid && y >= mid) return 'Old Town';
  return 'Southside';
}

/**
 * Push a circle out of every building it overlaps and report whether it hit
 * one. Cars and the player use the same test, so nobody walks through walls.
 */
export function collideBuildings(body, radius, buildings) {
  let hit = false;
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) continue;
    hit = true;
    if (distSq === 0) {
      // Centre inside the building: push out along the shortest side.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) body.x = b.x - radius;
      else if (min === right) body.x = b.x + b.w + radius;
      else if (min === top) body.y = b.y - radius;
      else body.y = b.y + b.h + radius;
    } else {
      const dist = Math.sqrt(distSq);
      const push = (radius - dist) / dist;
      body.x += dx * push;
      body.y += dy * push;
    }
  }
  return hit;
}

/** Keep a point inside the world, with a margin. */
export function clampToWorld(body, margin) {
  body.x = Math.max(margin, Math.min(WORLD.size - margin, body.x));
  body.y = Math.max(margin, Math.min(WORLD.size - margin, body.y));
}
