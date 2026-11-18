# MERIDIAN BAY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Amiou9/gta6-01-realistic/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Amiou9/gta6-01-realistic/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**MERIDIAN BAY** — a complete, realistic open-world crime game in the spirit of GTA 6, playable in a desktop browser from static files. Golden hour. One coastal city. One debt to pay.

Danny Reyes, an ex-delivery driver, owes fixer Marta Solano. She is calling it in — four jobs, one evening, and the whole Meridian Bay patrol watching. Steal cars, run the jobs, lose the heat, get paid.

> Built for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01). Referral code: `f2azfct1` — https://make.fun/r/f2azfct1

## Play it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network requests: `game/index.html` and its ES modules (three.js 0.187.0 vendored under `game/vendor/`) are all the game needs.

## Controls

| Key | Action |
| --- | --- |
| W / A / S / D | Walk / drive (W = throttle, S = brake / reverse) |
| Shift | Sprint (on foot) |
| E | Steal / enter / exit car |
| F | Punch |
| Mouse click | Fire pistol (semi-auto — one press, one shot) |
| R | Reload (12-round mag, ~1.6 s) |
| Space | Handbrake (in car) / confirm |
| C | Camera (chase / far) |
| P / Esc | Pause |
| M | Mute |

## What is in the city

- **A realistic 3D open world**: Meridian Bay — a golden-hour coastal city, 7×7 blocks, 8 avenues and 8 streets, a bay with a pier and docks, a hospital and the Harbor Hotel. Brick, concrete and glass facades with lit windows, lane markings, crosswalks, sidewalks, traffic lights on a 20-second cycle, lamps, trees, boats and glittering water. No neon, no cartoon colours.
- **Traffic and pedestrians**: cars drive the road grid and stop at red lights; 14 pedestrians walk the sidewalks, flee gunfire, and get knocked down by speeding cars.
- **Cars to steal**: five types with distinct handling — Meridian S sedan, Bay Cab taxi, Veloce GT coupe, Rancher pickup, Cargo Van. Merged body mesh, four steerable and spinning wheels, headlights and taillights, handbrake drift, building and car-car collision. Walk up to one and press **E**.
- **A wanted level and police**: stealing, assault and shooting raise the heat (1–5 stars); hitting a patrol car adds two. Patrol cars chase on the road graph, ram, brake to arrest, and search your last-known position when the trail goes cold. Break line of sight and the heat decays one star every 6 seconds. Get cornered while standing still and you are BUSTED.
- **Missions and a story**: four chained jobs for Marta Solano, each with a timer and a cash reward — **First Job** (steal a car to the garage, $500), **The Package** (pier pickup to the Harbor Hotel, $800), **Heat** (lose the heat to zero, $1,000), **The Getaway** (reach the dock warehouse at wanted 3, $2,500). Miss a timer and the job retries. Finish all four and the city is yours — free roam.
- **Combat**: punch and a semi-auto pistol, health that regenerates after 6 seconds out of danger, WASTED and BUSTED screens with a hospital respawn and a fine (max $50 or 10% of your cash).
- **HUD with a live minimap**: cash, wanted stars, health, mission objective and timer, speed, ammo, street name, in-game clock (from 17:35), crosshair, toasts and a damage vignette. The minimap tracks you, cars, police and the mission marker.
- **Start and save**: title screen with story and controls, automatic saves (cash, jobs done, best heat) with Continue.
- **Polish**: third-person and chase cameras, golden-hour sun with shadows and a cool fill light, smoke, sparks, muzzle flash and tracer, camera shake, and a fully synthesized WebAudio soundscape — engine hum, sirens, gunshots and ambience. No audio files.

## Screenshots

1. **The Getaway** — the red Veloce GT at 100 km/h down Main Ave with two patrol cars on its tail, wanted 3.
2. **First Job** — the Meridian S at 84 km/h up Sunset Ave, fresh off the steal.
3. **On foot** — Danny on Sunset Ave with the Bay Cab ahead, golden-hour street canyon.
4. **Job done** — "JOB DONE +$500", $750 in hand, the sedan at the garage, The Package next.

## Tech

- three.js 0.187.0, vendored byte-identical under `game/vendor/three/`.
- Plain ES modules, no build step, zero network requests at runtime.
- Deterministic: the same seed always builds the same city, and `main.ts` output is byte-identical across runs.
- Screenshots are staged from real play (`game/src/shots.js`, `?shot=chase|drive|street|mission&seed=1`).

## License

MIT — see [LICENSE](LICENSE).
