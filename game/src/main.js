// Meridian Bay: boot, the one loop and the screens. The world advances in fixed 1/60 s steps;
// the renderer paints what is there. Screens: title, play, paused, wasted, busted, complete.
// ?seed=N fixes the city. ?shot=chase|drive|street|mission stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CITY, PALETTE, PLAYER, MISSIONS, SAVE_KEY, STEP, CAR_TYPE_KEYS } from './config.js';
import { createRandom, pick, range } from './random.js';
import { createCity } from './city.js';
import { createCar, stepPlayerCar, stepTrafficCar, collideCars, updateCarVisual, isLand } from './vehicles.js';
import { createPlayer, createPedestrian, stepPedestrian, stepPlayerOnFoot, tryPunch, tryShoot, damagePlayer, updatePersonVisual } from './people.js';
import { createPolice, raiseWanted, stepPolice } from './police.js';
import { createMissions, currentMarker, objectiveText, stepMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput, ACTION_ENTER, ACTION_PUNCH, ACTION_RELOAD, ACTION_PAUSE, ACTION_CAMERA, ACTION_MUTE, ACTION_CONFIRM, ACTION_SHOOT } from './input.js';
import { stageShot } from './shots.js';
import { makeSkyTexture } from './textures.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
const input = createInput(canvas);
const audio = createAudio();
const hud = createHud();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('keydown', () => audio.ensure(), { once: true });
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });

function announce(message) {
  status.textContent = message;
}

function readSave() {
  try {
    return JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function writeSave(game) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.cash, jobsDone: game.missions.done, bestHeat: game.bestHeat, missionIndex: game.missions.index,
    }));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

/** Build a fresh world: the city, the player, the traffic, the pedestrians, the story. */
function buildWorld(seedValue) {
  const rng = createRandom(seedValue);
  const scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(PALETTE.fog, 200, 760);
  const city = createCity(rng);
  scene.add(city.group);

  const player = createPlayer(city.playerSpawn.x, city.playerSpawn.z);
  scene.add(player.group);

  const cars = [];
  for (let i = 0; i < 12; i += 1) {
    const ni = Math.floor(rng() * 8);
    const nj = Math.floor(rng() * 8);
    const node = city.nodePos(ni, nj);
    const type = pick(rng, CAR_TYPE_KEYS);
    const car = createCar(type, node.x, node.z, rng() * Math.PI * 2, { traffic: true });
    car.route = null;
    cars.push(car);
    scene.add(car.group);
  }
  for (const spawn of city.parkedSpawns) {
    const car = createCar(spawn.type, spawn.x, spawn.z, spawn.heading, { parked: true });
    cars.push(car);
    scene.add(car.group);
  }
  // One car of each type waits near the start, so the first job is never a long walk.
  const starterSpots = [
    { x: 38.5, z: 168, heading: Math.PI, type: 'sedan' },
    { x: 38.5, z: 140, heading: Math.PI, type: 'coupe' },
    { x: 31.5, z: 182, heading: 0, type: 'taxi' },
  ];
  for (const s of starterSpots) {
    const car = createCar(s.type, s.x, s.z, s.heading, { parked: true });
    cars.push(car);
    scene.add(car.group);
  }

  const peds = [];
  for (let i = 0; i < 14; i += 1) {
    const bi = Math.floor(rng() * 7);
    const bj = Math.floor(rng() * 7);
    const cx = (bi - 3) * 70;
    const cz = (bj - 3) * 70;
    const ped = createPedestrian(cx + range(rng, -28, 28), cz + range(rng, -28, 28), rng, [cx, cz]);
    peds.push(ped);
    scene.add(ped.group);
  }

  const police = createPolice();
  const missions = createMissions();

  const game = {
    rng, scene, city, colliders: city.colliders, cars, peds, player, police, missions,
    cash: PLAYER.startCash, time: 0, bestHeat: 0, events: [],
    screen: 'title', cameraMode: 0, cameraYaw: player.heading, damageFlash: 0,
    lightTimer: 0, minimapTimer: 0, shotCamera: null, effects: [],
    threatX: 0, threatZ: 0,
    muzzleLight: null,
    get marker() { return currentMarker(missions); },
    playerPos() {
      const c = player.inCar;
      return c ? { x: c.x, z: c.z } : { x: player.x, z: player.z };
    },
    playerHeading() {
      return player.inCar ? player.inCar.heading : player.heading;
    },
    setWanted(n) {
      police.wanted = n;
      const p = game.playerPos();
      police.lastSeen = { x: p.x, z: p.z };
      police.sightTimer = 0;
      police.decayTimer = 0;
    },
    raiseWanted(n) {
      raiseWanted(game, n);
      game.bestHeat = Math.max(game.bestHeat, police.wanted);
    },
    damagePlayer(n) {
      damagePlayer(player, n, game);
    },
    toast(text) {
      missions.toast = { text, until: 4 };
    },
    lightAt(x, z) {
      const i = Math.round((x + 245) / 70);
      const j = Math.round((z + 245) / 70);
      if (i < 0 || i > 7 || j < 0 || j > 7) return null;
      if (Math.abs((i - 3.5) * 70 - x) > 12 || Math.abs((j - 3.5) * 70 - z) > 12) return null;
      return city.trafficLights.find((L) => L.i === i && L.j === j) || null;
    },
    newRoute(car) {
      let ci = Math.max(0, Math.min(7, Math.round((car.x + 245) / 70)));
      let cj = Math.max(0, Math.min(7, Math.round((car.z + 245) / 70)));
      const pts = [];
      let prev = { x: car.x, z: car.z };
      const steps = 6 + Math.floor(rng() * 5);
      for (let s = 0; s < steps; s += 1) {
        const nb = city.neighbours(ci, cj);
        const [ni, nj] = pick(rng, nb);
        const node = city.nodePos(ni, nj);
        const dx = node.x - prev.x;
        const dz = node.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        pts.push({ x: node.x + (-dz / len) * CITY.lane, z: node.z + (dx / len) * CITY.lane });
        prev = node;
        ci = ni;
        cj = nj;
      }
      return pts;
    },
  };
  for (const car of cars) {
    if (car.traffic) car.route = game.newRoute(car);
  }
  game.muzzleLight = new THREE.PointLight(0xffd9a0, 0, 18, 1.5);
  scene.add(game.muzzleLight);
  return game;
}

function disposeWorld(game) {
  game.scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}

let game = buildWorld(seed);
game.enterCar = enterCar;
game.exitCar = exitCar;
game.nearestCar = nearestCar;
game.step = stepWorld;
window.__game = game;

/** Put a patrol car at a chosen spot, heading toward the player (used by the chase shot). */
function spawnPoliceAt(x, z) {
  const p = game.playerPos();
  const heading = Math.atan2(p.x - x, p.z - z);
  const car = createCar('sedan', x, z, heading, { police: true });
  car.top = 36;
  car.accel = 11;
  car.ramCooldown = 0;
  car.speed = 24;
  game.cars.push(car);
  game.police.cars.push(car);
  game.scene.add(car.group);
  return car;
}
game.spawnPoliceAt = spawnPoliceAt;

function nearestCar(maxDist) {
  const p = game.player;
  let best = null;
  let bestD = maxDist;
  for (const car of game.cars) {
    if (car.police) continue;
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function enterCar(car) {
  const player = game.player;
  if (car.police) {
    game.toast('Locked — that one belongs to the police.');
    return;
  }
  if (!car.owned) {
    car.owned = true;
    game.raiseWanted(1);
    game.toast('Car stolen — the heat is on.');
  }
  if (car.traffic) {
    car.traffic = false;
    car.route = null;
  }
  car.parked = false;
  player.inCar = car;
  player.group.visible = false;
  audio.click();
}

function exitCar() {
  const player = game.player;
  const car = player.inCar;
  if (!car) return;
  const right = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
  const spots = [
    { x: car.x + right.x * 2.6, z: car.z + right.z * 2.6 },
    { x: car.x - right.x * 2.6, z: car.z - right.z * 2.6 },
    { x: car.x + Math.sin(car.heading) * 3, z: car.z + Math.cos(car.heading) * 3 },
    { x: car.x - Math.sin(car.heading) * 3, z: car.z - Math.cos(car.heading) * 3 },
  ];
  const spot = spots.find((s) => isLand(s.x, s.z)) || spots[0];
  player.x = spot.x;
  player.z = spot.z;
  player.heading = car.heading;
  player.speed = 0;
  player.inCar = null;
  player.group.visible = true;
  car.parked = true;
  car.speed = 0;
  audio.click();
}

function addEffect(mesh, life, vel) {
  mesh.userData.life = life;
  mesh.userData.maxLife = life;
  mesh.userData.vel = vel;
  game.scene.add(mesh);
  game.effects.push(mesh);
}

function spawnSparks(x, z) {
  for (let i = 0; i < 5; i += 1) {
    const spark = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true }),
    );
    spark.position.set(x, 0.8, z);
    addEffect(spark, 0.4, new THREE.Vector3((Math.random() - 0.5) * 8, 3 + Math.random() * 3, (Math.random() - 0.5) * 8));
  }
}

function spawnSmoke(x, z) {
  for (let i = 0; i < 6; i += 1) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 }),
    );
    puff.position.set(x + (Math.random() - 0.5) * 2, 1 + i * 0.4, z + (Math.random() - 0.5) * 2);
    addEffect(puff, 1.6, new THREE.Vector3(0, 1.2, 0));
  }
}

function stepEffects(dt) {
  for (let i = game.effects.length - 1; i >= 0; i -= 1) {
    const mesh = game.effects[i];
    mesh.userData.life -= dt;
    if (mesh.userData.life <= 0) {
      game.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      game.effects.splice(i, 1);
      continue;
    }
    mesh.position.addScaledVector(mesh.userData.vel, dt);
    mesh.userData.vel.y -= 4 * dt;
    mesh.material.opacity = 0.6 * (mesh.userData.life / mesh.userData.maxLife);
  }
  if (game.muzzleLight.intensity > 0) game.muzzleLight.intensity = Math.max(0, game.muzzleLight.intensity - dt * 60);
}

function showEnd(title, text, stats) {
  game.screen = 'end';
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-text').textContent = text;
  document.getElementById('end-stats').textContent = stats;
  document.getElementById('overlay-end').classList.remove('hidden');
  announce(`${title}. ${text}`);
}

function respawn() {
  const player = game.player;
  const fine = Math.max(50, Math.floor(game.cash * 0.1));
  game.cash -= fine;
  player.health = PLAYER.health;
  player.lastDamage = -99;
  game.setWanted(0);
  for (const car of game.police.cars) game.scene.remove(car.group);
  game.police.cars = [];
  game.cars = game.cars.filter((c) => !c.police);
  if (player.inCar) {
    player.inCar.parked = true;
    player.inCar.speed = 0;
    player.inCar = null;
    player.group.visible = true;
  }
  player.x = game.city.hospitalSpawn.x;
  player.z = game.city.hospitalSpawn.z;
  player.heading = Math.PI;
  player.speed = 0;
  const def = MISSIONS[game.missions.index];
  game.missions.timer = def ? def.time : 0;
  game.missions.hasPackage = false;
  if (game.missions.index === 1) game.missions.phase = 'toPickup';
  if (game.missions.index === 2) game.setWanted(2);
  document.getElementById('overlay-end').classList.add('hidden');
  game.screen = 'play';
  writeSave(game);
  announce('Back on the street. The fine came off your cash.');
}

function startGame(fresh) {
  if (fresh) {
    disposeWorld(game);
    game = buildWorld(seed);
    game.enterCar = enterCar;
    game.exitCar = exitCar;
    game.nearestCar = nearestCar;
    game.step = stepWorld;
    game.spawnPoliceAt = spawnPoliceAt;
    window.__game = game;
  } else {
    const save = readSave();
    if (save) {
      game.cash = save.cash;
      game.bestHeat = save.bestHeat || 0;
      game.missions.done = save.jobsDone || 0;
      game.missions.index = Math.min(save.missionIndex || 0, MISSIONS.length - 1);
      const def = MISSIONS[game.missions.index];
      game.missions.timer = def.time;
      game.missions.phase = game.missions.index === 1 ? 'toPickup' : game.missions.index === 2 ? 'loseHeat' : 'toMarker';
      if (game.missions.index === 2) game.setWanted(2);
      if (game.missions.index === 3) game.setWanted(3);
    }
  }
  document.getElementById('overlay-start').classList.add('hidden');
  document.getElementById('overlay-end').classList.add('hidden');
  game.screen = 'play';
  announce('Playing. Follow the objective at the top of the screen.');
}

function pauseGame() {
  game.screen = 'paused';
  document.getElementById('overlay-pause').classList.remove('hidden');
  announce('Paused.');
}

function resumeGame() {
  document.getElementById('overlay-pause').classList.add('hidden');
  game.screen = 'play';
  announce('Playing.');
}

/** One fixed step of the world. `fake` replaces the real input for scripted scenes. */
function stepWorld(dt, fake) {
  const inp = fake || input;
  game.time += dt;
  game.lightTimer += dt;
  if (game.lightTimer > 0.5) {
    game.city.updateLights(game.time);
    game.lightTimer = 0;
  }
  game.city.glitterTex.offset.x += dt * 0.008;
  game.city.boats.forEach((boat, i) => {
    boat.position.y = Math.sin(game.time * 0.8 + i * 2) * 0.15;
  });

  const playing = game.screen === 'play';
  const title = game.screen === 'title';
  // Actions are drained on every screen, so P resumes from pause instead of queueing up.
  const actions = inp.takeActions();
  if (game.screen === 'paused') {
    if (actions & ACTION_PAUSE) resumeGame();
    stepEffects(dt);
    return;
  }
  if (game.screen === 'end') {
    stepEffects(dt);
    return;
  }

  // The city lives even on the title screen.
  for (const car of game.cars) {
    if (car.traffic && !car.disabled) stepTrafficCar(car, dt, game);
  }
  for (const ped of game.peds) stepPedestrian(ped, dt, game);
  collideCars(game.cars, game.colliders);

  if (title) {
    for (const car of game.cars) updateCarVisual(car, dt);
    for (const ped of game.peds) updatePersonVisual(ped, dt);
    stepEffects(dt);
    return;
  }

  if (actions & ACTION_PAUSE) { pauseGame(); return; }
  if (actions & ACTION_CAMERA) game.cameraMode = 1 - game.cameraMode;
  if (actions & ACTION_MUTE) audio.setMuted(!audio.muted);
  if (actions & ACTION_ENTER) {
    if (game.player.inCar) exitCar();
    else {
      const car = nearestCar(4);
      if (car) enterCar(car);
    }
  }
  if (actions & ACTION_PUNCH) tryPunch(game.player, game);
  if (actions & ACTION_RELOAD && game.player.ammo < PLAYER.magSize && game.player.reloading <= 0) {
    game.player.reloading = PLAYER.reloadTime;
  }
  if (actions & ACTION_SHOOT) tryShoot(game.player, camera, dt, game);

  const player = game.player;
  if (player.inCar) {
    stepPlayerCar(player.inCar, inp, dt, game);
  } else {
    stepPlayerOnFoot(player, inp, game.cameraYaw, dt, game);
  }
  // A speeding car knocks a pedestrian down.
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    for (const car of game.cars) {
      if (Math.abs(car.speed) < 3) continue;
      if (Math.hypot(car.x - ped.x, car.z - ped.z) < car.radius + 0.6) {
        ped.state = 'down';
        ped.stateTimer = 6;
        ped.group.rotation.x = Math.PI / 2 - 0.2;
        if (car === player.inCar) {
          game.raiseWanted(1);
          game.events.push({ type: 'pedHit', x: ped.x, z: ped.z });
        }
        break;
      }
    }
  }
  stepPolice(game, dt);
  stepMissions(game.missions, game, dt);

  for (const car of game.cars) updateCarVisual(car, dt);
  for (const ped of game.peds) updatePersonVisual(ped, dt);
  updatePersonVisual(player, dt);
  stepEffects(dt);

  // What happened this step, in sound and sparks.
  for (const ev of game.events) {
    if (ev.type === 'crash') { audio.crash(); game.damageFlash = Math.max(game.damageFlash, 0.25); spawnSparks(ev.x, ev.z); }
    else if (ev.type === 'ram') { audio.ram(); game.damageFlash = Math.max(game.damageFlash, 0.45); }
    else if (ev.type === 'shot') {
      audio.shot();
      game.muzzleLight.position.copy(ev.from);
      game.muzzleLight.intensity = 4;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([ev.from, ev.to]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true }));
      addEffect(line, 0.09, new THREE.Vector3(0, 0, 0));
    } else if (ev.type === 'punch') audio.punch();
    else if (ev.type === 'pedHit') audio.punch();
    else if (ev.type === 'jobDone') { audio.pickup(); writeSave(game); }
    else if (ev.type === 'carDead') spawnSmoke(ev.x, ev.z);
    else if (ev.type === 'wasted') {
      audio.busted();
      writeSave(game);
      showEnd('WASTED', 'Danny is down. The hospital patches him up — for a fee.', `Cash $${Math.floor(game.cash).toLocaleString('en-US')} · Jobs done ${game.missions.done} of 4`);
    } else if (ev.type === 'busted') {
      audio.busted();
      writeSave(game);
      showEnd('BUSTED', 'The patrol had you cornered. Bail and the fine come off your cash.', `Cash $${Math.floor(game.cash).toLocaleString('en-US')} · Jobs done ${game.missions.done} of 4`);
    } else if (ev.type === 'storyDone') {
      writeSave(game);
      showEnd('STORY COMPLETE', `All four jobs done. Danny walks away with $${Math.floor(game.cash).toLocaleString('en-US')} — and Meridian Bay is his to roam.`, `Best heat ${'★'.repeat(game.bestHeat)}${'☆'.repeat(5 - game.bestHeat)} · Jobs done 4 of 4`);
    }
  }
  game.events.length = 0;
  game.damageFlash = Math.max(0, game.damageFlash - dt * 1.5);
}

function updateCamera(dt) {
  if (game.shotCamera) {
    camera.position.copy(game.shotCamera.pos);
    camera.lookAt(game.shotCamera.lookAt);
    return;
  }
  const player = game.player;
  if (game.screen === 'title') {
    const a = game.time * 0.04;
    camera.position.set(Math.cos(a) * 190, 75, Math.sin(a) * 190);
    camera.lookAt(0, 8, 0);
    return;
  }
  const heading = game.playerHeading();
  let diff = heading - game.cameraYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const moving = player.inCar ? Math.abs(player.inCar.speed) > 1 : player.speed > 0.5;
  if (moving) game.cameraYaw += diff * Math.min(1, dt * (player.inCar ? 3.5 : 2));
  const dist = player.inCar ? (game.cameraMode ? 12.5 : 9.5) : (game.cameraMode ? 9 : 6.5);
  const height = player.inCar ? (game.cameraMode ? 4.2 : 3.4) : (game.cameraMode ? 3.4 : 2.6);
  const p = game.playerPos();
  const fx = Math.sin(game.cameraYaw);
  const fz = Math.cos(game.cameraYaw);
  const target = new THREE.Vector3(p.x - fx * dist, height, p.z - fz * dist);
  camera.position.lerp(target, 1 - Math.exp(-dt * 7));
  camera.lookAt(p.x + fx * 5, 1.4, p.z + fz * 5);
}

function updateHud() {
  const player = game.player;
  const car = player.inCar;
  const marker = game.marker;
  const p = game.playerPos();
  hud.update({
    cash: game.cash,
    wanted: game.police.wanted,
    health: player.health,
    objectiveTitle: game.missions.storyDone ? 'Free Roam' : MISSIONS[game.missions.index].title,
    objectiveText: objectiveText(game.missions),
    timer: game.missions.timer,
    speed: car ? car.speed : 0,
    inCar: !!car,
    carName: car ? car.name : '',
    ammo: player.ammo,
    reloading: player.reloading > 0,
    x: p.x,
    z: p.z,
    time: game.time,
    damageFlash: game.damageFlash,
    toast: game.missions.toast ? game.missions.toast.text : null,
  });
  game.minimapTimer += STEP;
  if (game.minimapTimer > 0.12) {
    game.minimapTimer = 0;
    hud.drawMinimap(game, game.time);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  accumulator += dt;
  while (accumulator >= STEP && game.screen !== 'end') {
    stepWorld(STEP, null);
    accumulator -= STEP;
    if (game.screen === 'paused') break;
  }
  if (game.screen === 'end') accumulator = 0;
  updateCamera(dt);
  if (game.screen === 'play') {
    const car = game.player.inCar;
    audio.update({
      inCar: !!car,
      speed: car ? car.speed : 0,
      throttle: input.held.up,
      siren: game.police.wanted > 0 && game.police.cars.length > 0,
      sirenDist: game.police.cars.length ? Math.min(...game.police.cars.map((c) => Math.hypot(c.x - game.playerPos().x, c.z - game.playerPos().z))) : 999,
    });
    updateHud();
  }
  renderer.render(game.scene, camera);
  if (!window.__gameReady) window.__gameReady = true;
}

let last = performance.now();
let accumulator = 0;

// Buttons and keys on the overlays.
document.getElementById('btn-new').addEventListener('click', () => { audio.ensure(); audio.click(); startGame(true); });
document.getElementById('btn-continue').addEventListener('click', () => { audio.ensure(); audio.click(); startGame(false); });
document.getElementById('btn-resume').addEventListener('click', () => { audio.click(); resumeGame(); });
document.getElementById('btn-restart').addEventListener('click', () => { audio.click(); document.getElementById('overlay-pause').classList.add('hidden'); startGame(true); });
document.getElementById('btn-mute').addEventListener('click', (event) => {
  audio.setMuted(!audio.muted);
  event.target.textContent = audio.muted ? 'Unmute' : 'Mute';
});
document.getElementById('btn-end').addEventListener('click', () => { audio.click(); respawn(); });
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Enter' && event.code !== 'Space') return;
  if (game.screen === 'title') startGame(true);
  else if (game.screen === 'end') respawn();
  else if (game.screen === 'paused') resumeGame();
});

const save = readSave();
document.getElementById('btn-continue').style.display = save ? '' : 'none';
document.getElementById('start-stats').textContent = save
  ? `Saved: $${Math.floor(save.cash).toLocaleString('en-US')} · ${save.jobsDone || 0} of 4 jobs · best heat ${'★'.repeat(save.bestHeat || 0)}${'☆'.repeat(5 - (save.bestHeat || 0))}`
  : 'No save yet — start a new game.';

if (shot) {
  game.screen = 'play';
  audio.setMuted(true);
  // A staged shot is already playing: hide the title/end overlays, or they sit
  // on top of the frame and the screenshot is a menu instead of the game.
  document.getElementById('overlay-start').classList.add('hidden');
  document.getElementById('overlay-end').classList.add('hidden');
  stageShot(shot, game);
  updateCamera(1);
  updateHud();
  hud.drawMinimap(game, game.time);
  let painted = 0;
  const paint = () => {
    renderer.render(game.scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  announce('Meridian Bay. Press Enter or click New Game to start.');
  requestAnimationFrame(frame);
}
