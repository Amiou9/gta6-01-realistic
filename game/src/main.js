// MERIDIAN BAY — boot and the one loop. Fixed 1/60 s steps (several in a slow
// frame, none in a fast one), a chase camera that sits behind the player or
// the car, DOM HUD + minimap, and the four screens: title, play, paused and
// game over. ?seed=N fixes the city; ?shot=chase|drive|street|mission stages
// one screenshot scene instead of running the loop.
import * as THREE from 'three';
import { createRandom } from './random.js';
import { createGame } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const audio = createAudio();
const input = createInput(canvas);
const game = createGame(createRandom(seed), audio);

// ---- HUD element cache ----
const el = {};
for (const id of ['cash', 'stars', 'mission-name', 'mission-timer', 'mission-brief', 'mission-target', 'minimap', 'clock', 'street', 'health-fill', 'ammo', 'speed', 'car-name', 'crosshair', 'toast', 'vignette', 'overlay-start', 'overlay-pause', 'overlay-over', 'over-title', 'over-text', 'btn-start', 'btn-continue', 'btn-respawn']) {
  el[id] = document.getElementById(id);
}
const minimapCtx = el['minimap'].getContext('2d');

function showOverlay(which) {
  el['overlay-start'].classList.toggle('hidden', which !== 'start');
  el['overlay-pause'].classList.toggle('hidden', which !== 'pause');
  el['overlay-over'].classList.toggle('hidden', which !== 'over');
  const inPlay = which === null;
  for (const id of ['hud-left', 'hud-right', 'hud-bottom-left', 'hud-bottom-right']) {
    document.getElementById(id).style.display = inPlay ? '' : 'none';
  }
  el['minimap'].style.display = inPlay ? '' : 'none';
}

function updateHud() {
  const h = game.hud();
  el['cash'].textContent = `$${h.cash}`;
  el['stars'].textContent = h.stars;
  el['mission-name'].textContent = h.missionName;
  el['mission-timer'].textContent = h.missionTimer;
  el['mission-brief'].textContent = h.missionBrief;
  el['mission-target'].textContent = h.targetLabel ? `${h.targetLabel} · ${h.targetDist} m` : '';
  el['clock'].textContent = h.clock;
  el['street'].textContent = h.street;
  el['health-fill'].style.width = `${Math.max(0, h.health)}%`;
  el['health-fill'].style.background = h.health > 50 ? '#4caf50' : h.health > 25 ? '#ff9800' : '#f44336';
  el['ammo'].textContent = h.reloading ? 'RELOADING…' : `AMMO ${h.ammo}/12`;
  el['speed'].innerHTML = `${h.speed} <span id="speed-unit">km/h</span>`;
  el['car-name'].textContent = h.carName;
  el['crosshair'].style.display = !h.inCar && h.screen === 'play' ? 'block' : 'none';
  if (h.toast) {
    el['toast'].style.display = 'block';
    el['toast'].textContent = h.toast;
  } else {
    el['toast'].style.display = 'none';
  }
  el['vignette'].style.opacity = String(h.damageFlash * 0.85);
  game.drawMinimap(minimapCtx, 176, 176);
  status.textContent = `${h.missionName}. Cash $${h.cash}. Wanted ${h.wanted}. Health ${h.health}.`;
}

// ---- camera ----
let camHeading = Math.PI;
let camDist = 0, camHeight = 0;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}
function updateCamera(dt, time) {
  const s = game.state;
  const d = game.danny;
  let px, py, pz, lx, ly, lz;
  if (s.screen === 'title') {
    const a = time * 0.045;
    px = Math.sin(a) * 230; py = 95; pz = Math.cos(a) * 230 + 40;
    lx = 0; ly = 12; lz = 40;
  } else if (s.inCar && s.playerCar) {
    const car = s.playerCar;
    camHeading = lerpAngle(camHeading, car.heading, dt * 4);
    const dist = s.cameraFar ? 15 : 11;
    const height = s.cameraFar ? 5.5 : 4.2;
    px = car.x - Math.sin(camHeading) * dist;
    py = height;
    pz = car.z - Math.cos(camHeading) * dist;
    lx = car.x + Math.sin(car.heading) * 10;
    ly = 1.6;
    lz = car.z + Math.cos(car.heading) * 10;
  } else {
    if (d.speed > 0.5) camHeading = lerpAngle(camHeading, d.heading, dt * 6);
    const dist = s.cameraFar ? 11 : 7;
    const height = s.cameraFar ? 4.6 : 3.4;
    px = d.x - Math.sin(camHeading) * dist;
    py = height;
    pz = d.z - Math.cos(camHeading) * dist;
    lx = d.x + Math.sin(camHeading) * 2;
    ly = 1.6;
    lz = d.z + Math.cos(camHeading) * 2;
  }
  game.camHeading = camHeading;
  if (s.shake > 0) {
    px += (Math.random() - 0.5) * s.shake;
    py += (Math.random() - 0.5) * s.shake * 0.6;
  }
  camera.position.set(px, py, pz);
  camera.lookAt(lx, ly, lz);
}

// ---- screens ----
function startNew() {
  audio.unlock();
  audio.click();
  game.startGame(false);
  showOverlay(null);
}
function startContinue() {
  audio.unlock();
  audio.click();
  game.startGame(true);
  showOverlay(null);
}
el['btn-start'].addEventListener('click', startNew);
el['btn-continue'].addEventListener('click', startContinue);
el['btn-respawn'].addEventListener('click', () => {
  audio.click();
  game.respawn();
  showOverlay(null);
});
el['btn-continue'].style.display = game.hasSave() ? '' : 'none';
canvas.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock(), { once: true });

// ---- test hooks (also how the screenshot stager drives the game) ----
window.__game = {
  game, input, audio,
  state() {
    const s = game.state;
    return {
      screen: s.screen, cash: s.cash, wanted: s.wanted, health: Math.round(s.health),
      ammo: s.ammo, missionIndex: s.missionIndex, missionStage: s.missionStage,
      missionTimer: Math.round(s.missionTimer), jobsDone: s.jobsDone, storyDone: s.storyDone,
      x: Math.round(game.danny.x * 10) / 10, z: Math.round(game.danny.z * 10) / 10,
      heading: Math.round(game.danny.heading * 100) / 100,
      inCar: s.inCar, speed: s.inCar && s.playerCar ? Math.round(Math.abs(s.playerCar.speed) * 10) / 10 : Math.round(game.danny.speed * 10) / 10,
      endKind: s.endKind, cars: game.cars.length,
      cops: game.cars.filter((c) => c.police).length,
      traffic: game.cars.filter((c) => c.traffic).length,
      peds: game.peds.length,
    };
  },
  teleport: (x, z) => game.teleport(x, z),
  setWanted: (n) => game.setWanted(n),
  setHealth: (h) => game.setHealth(h),
  setCash: (c) => game.setCash(c),
  startMission: (i) => game.startMission(i),
  giveCar: (type) => game.giveCar(type),
  key(code, down) {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  },
  click() {
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
  },
};

// ---- main loop ----
let last = performance.now();
let acc = 0;
let elapsed = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  elapsed += dtReal;
  const s = game.state;
  if (s.screen === 'play') {
    acc += dtReal;
    let steps = 0;
    while (acc >= STEP && steps < 20) {
      game.step(STEP, input);
      acc -= STEP;
      steps += 1;
    }
    if (steps === 20) acc = 0;
    if (input.take('pause')) { game.pause(); showOverlay('pause'); }
    if (input.take('camera')) s.cameraFar = !s.cameraFar;
    if (input.take('mute')) {
      const m = audio.toggleMute();
      game.state.toast = m ? 'Sound off' : 'Sound on';
      game.state.toastUntil = game.state.time + 2;
    }
  } else if (s.screen === 'title') {
    if (input.take('confirm')) startNew();
  } else if (s.screen === 'paused') {
    if (input.take('pause')) { game.resume(); showOverlay(null); }
  } else if (s.screen === 'over') {
    el['over-title'].textContent = s.endKind === 'busted' ? 'BUSTED' : 'WASTED';
    el['over-title'].className = s.endKind === 'busted' ? 'busted' : 'wasted';
    el['over-text'].textContent = `The hospital patched you up. Fine: $${s.fine}. Your cash is $${s.cash}.`;
    showOverlay('over');
    if (input.take('confirm')) { game.respawn(); showOverlay(null); }
  }
  updateCamera(dtReal, elapsed);
  updateHud();
  renderer.render(game.scene, camera);
}

showOverlay('start');
if (shot) {
  // Screenshot mode: stage the scene, render twice, signal readiness.
  const cam = stageShot(game, input, shot, seed);
  showOverlay(null);
  if (cam) {
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
  } else {
    updateCamera(0, 0);
  }
  updateHud();
  renderer.render(game.scene, camera);
  renderer.render(game.scene, camera);
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}
