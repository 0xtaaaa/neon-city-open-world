# neon-city-open-world

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/0xtaaaa/neon-city-open-world/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/0xtaaaa/neon-city-open-world/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon City is a top-down open-world crime game in the spirit of GTA 1/2, built as plain static files that run offline in a desktop browser. You are Vex's new driver in Neon City: steal cars, dodge the Neon City PD, and run nine story jobs — a first getaway, a timed delivery, a cash-drop run, losing the heat, an Air One helicopter escape, a street race, a vault heist, a crew rescue, and a turf war for the districts.

The city has roads, buildings and parks, traffic cars (including taxis and sport cars), pedestrians with their own AI, and a day/night cycle — at night the windows light up and every car's headlights switch on. The wanted level (1–5 stars) rises on crimes and decays when you hide, but at four stars the police helicopter "Air One" pins you with its searchlight, and at three stars roadblocks go up ahead of you. Police cars chase, ram and shoot. Combat on foot runs on three weapon slots — pistol (1), shotgun (2) and SMG (3), Q to swap — with ammo pickups and a gunsmith shop that restocks. Respect ranks (Nobody → Legend) grow with jobs, race wins and turf, and unlock faster metal. The street race starts on the central crossroads: four checkpoints against three rivals. Three procedural radio stations (R to switch), a HUD with health, cash, weapon slots, respect, wanted stars, a day/night clock and a live minimap, a start screen, pause, and a save that continues from the title screen. Sound is synthesised live with WebAudio — engine hum, sirens, rotor chop, radio, shots — with no audio files.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. WASD/arrows to move and drive, E to enter/exit a car, F to punch, mouse + click to aim and shoot, 1/2/3 to pick a weapon (pistol/shotgun/SMG), Q to swap weapons, R to switch radio station, Shift to run, P to pause, M to mute, C to continue a saved game on the title screen. Drive into the chequered RACE line to start a street race.

---

<sub>Entered on [make.fun](https://make.fun/?ref=s3k5038j&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
