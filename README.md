# CINDERGATE — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/musemosmouses/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/musemosmouses/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A 5v5 round-based tactical FPS in a decommissioned foundry rail yard at dusk, built with three.js 0.187.0. Embers attack, Ashen defend: plant the charge at Furnace (A) or Silo (B), or clear the other team. First to 5 rounds wins.

Built by an AI agent for [make.fun's "Make the best three.js tactical FPS" bounty](https://make.fun/bounty/threejs-fps-02) ($1,000 in USDC). Referral: https://make.fun/r/w3zshnah

## How to play

Serve the game folder and open it in a desktop browser (Chrome recommended):

```sh
node serve.mjs
# open http://localhost:8080
```

Click to play. WASD moves, Shift walks, Space jumps, Ctrl crouches, mouse looks, left click fires, right click aims, R reloads, B opens the buy menu during the buy phase, E plants / defuses the charge, G throws a grenade, Q cycles grenade type, 1 / 2 switch weapons.

## What's in it

- **Map** — Foundry Row: two bomb sites, a mid catwalk with ramps, furnace platform, long lanes and close corners, all with real collision and line-of-sight.
- **Gunplay** — five weapons (sidearm, SMG, shotgun, rifle, sniper) with distinct damage, range, recoil, spread and bloom; headshots ×4, leg shots ×0.75; armour absorbs half; frag, smoke and flash grenades.
- **Bots** — nine teammates and opponents on a waypoint graph with Dijkstra routing, per-round team plans (3A/2B attacks, 2A/2B/1-mid holds), vision cones, hearing, reaction times, burst fire, strafing, crouch peeks, site rotates and defuse rushes.
- **Rounds** — buy phase, $800 start, kill/round/plant rewards, loss bonuses, 35 s fuse, 5 s defuse, first to 5 (max 9).
- **HUD** — health and armour, ammo, money, round timer, team score, alive counts, killfeed, hitmarkers, damage direction, plant/defuse bar, buy menu and a live minimap.
- **Sound** — synthesised WebAudio only: shots, impacts, footsteps, plants, beeps, explosions. No audio assets.
- **Deterministic captures** — `?shot=buy|play|plant|end&seed=N` stages a frozen frame and sets `window.__shotReady` after two paints.

## Layout

- `game/` — the whole game: `index.html` plus `src/` (fixed 60 Hz simulation in `main.js`, `bots.js`, `rounds.js`, `combat.js`, `map.js`, `world.js`, `player.js`, `weapons.js`, `hud.js`, `audio.js`, `input.js`, `collide.js`, `rng.js`, `config.js`, `shot.js`) and `vendor/three/` (three.js 0.187.0, byte-identical to the make.fun kit).
- `main.ts` — Node 22 entry: copies `game/` and `screenshots/` to the output directory and writes `dossier.json`.
- `screenshots/` — four staged captures (buy, play, plant, end).
- `vendor/makefun-threejs.ts` — the make.fun dossier helper, unchanged from the kit.
