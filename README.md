# Neon City — Open-World Crime Game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/0xtaaaa/neon-city-open-world/rank.svg)](https://make.fun/competitions/gta6-01)
[![reward](https://make.fun/badge/gta6-01/0xtaaaa/neon-city-open-world/reward.svg)](https://make.fun/competitions/gta6-01)

**Neon City** is a complete top-down 2D open-world crime game that runs
offline in a desktop browser from static files — no build step, no network
requests, no external assets. Everything (city, cars, people, music) is
generated in code.

## What is in the game

- **A living city**: a 9×9 road grid with buildings, a central park, a plaza,
  a beach and a harbour, traffic cars, pedestrians, street lamps that glow
  at night.
- **On foot and by car**: walk, sprint, steal any car with **E**, arcade car
  physics with damage, smoke and explosions. Repair and repaint at Spray & Go.
- **10 story missions** with dialogue, objectives and cash + respect rewards:
  pickups, getaways, a tail job, a warehouse heist, a bank job, a betrayal
  and a finale. Missions unlock by respect rank.
- **Wanted system**: 1–5 stars. Patrol cars chase and ram, officers on foot
  try to bust you, roadblocks form at 3+ stars and the **Air One** police
  helicopter hunts you at 4–5 stars. Break line of sight to cool off.
- **Combat**: pistol, shotgun and SMG weapon slots (mouse aim), ammo and
  armour from the Ironworks Guns gunsmith, muzzle flashes, particles, screen
  shake.
- **Respect ranks**: Nobody → Hustler → Street → Made → Kingpin → Legend.
  Ranks gate missions and unlocks.
- **Street races**: a checkpoint loop against 3 AI rivals with laps,
  positions and a $600 purse. Championship race in the final mission.
- **3 radio stations** (NEON FM, VICE WAVE, BASSLINE 88) — all music is
  generated live with WebAudio. **M** changes station, **N** mutes.
- **240-second day/night cycle**: dawn, day, dusk and night with street
  lights, lit windows and headlight cones.
- **HUD + minimap**: health, armour, cash, respect, wanted stars, weapon and
  ammo, mission tracker with distance, live minimap (roads, police, mission
  marker, shops).
- **Save / load**: progress autosaves to localStorage — money, respect,
  missions, weapons and position. Continue from the title screen.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move on foot / drive |
| Mouse + Click | Aim / shoot |
| E | Enter or exit a car, talk, interact (mission, shop, race) |
| F | Interact (same as E) |
| R | Reload |
| 1 / 2 / 3 | Pistol / Shotgun / SMG |
| Shift | Sprint |
| Space | Handbrake |
| M / N | Radio station / mute |
| P / Esc | Pause |
| H | Help |

## How to play

Open `game/index.html` in desktop Chrome (or serve `game/` with any static
file server). Click **NEW GAME**. Follow the yellow ◆ marker to start your
first job with Vinnie. Earn cash and respect, buy better guns, win races,
and survive the heat.

## Structure

```
game/
  index.html        page shell, HUD overlays, menus
  src/
    main.js         game loop, state machine, interaction, camera
    config.js       tuning constants, weapons, ranks, radio
    state.js        the shared game state + wanted/day helpers
    world.js        city generation, roads, buildings, collision
    vehicles.js     car physics, enter/exit, damage, explosions
    entities.js     player, pedestrians, police, helicopter, wanted
    weapons.js      shooting, bullets, reload, gunsmith
    missions.js     10 story missions, dialogue, objectives
    races.js        street races vs 3 AI rivals
    render.js       canvas drawing, day/night lighting
    ui.js           HUD, minimap, menus, shop, dialogue
    audio.js        WebAudio SFX + 3 procedural radio stations
    input.js        keyboard / mouse
    save.js         localStorage save / load
    shots.js        screenshot scene presets (?shot=cover|chase|mission|race)
```

## Screenshots

Four real gameplay renders (1280×720):

1. `1-cover.jpg` — daytime drive with a mission active, HUD + minimap.
2. `2-chase.jpg` — night, 4 stars, police cars and the Air One helicopter.
3. `3-mission.jpg` — on foot with a shotgun, hitmen closing in.
4. `4-race.jpg` — dusk street race against three rivals.

## License

MIT — see `LICENSE`.
