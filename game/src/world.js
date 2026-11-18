// MERIDIAN BAY — the game itself. Owns the scene, the player, traffic,
// police, pedestrians, the four chained missions, the wanted system, combat,
// particles, the minimap and the HUD data. main.js owns the renderer, the
// camera and the screens; this file owns everything that happens in play.
import * as THREE from 'three';
import {
  SAVE_KEY, MISSIONS, PLAYER, WANTED, TRAFFIC_COUNT, PARKED_COUNT, PED_COUNT,
  CLOCK_START_MINUTES, CLOCK_RATE, START_CASH, HOSPITAL, CAR_ORDER, ROADS,
  BAY_Z, PIER_END_Z, DOCKS,
} from './config.js';
import { createCity } from './city.js';
import { createCar, stepPlayerCar, stepTrafficCar, stepPoliceCar, collideCars, updateCarVisual, collideBuildings } from './vehicles.js';
import { createDanny, createPedestrian, makeSidewalkLoop, posePerson } from './people.js';
import { createRandom, pick, range } from './rand.js';

const BLOCK_CENTERS = [];
for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) BLOCK_CENTERS.push([-144 + i * 48, -144 + j * 48]);

export function createGame(random, audio) {
  const city = createCity(random);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd9a06a, 260, 820);
  scene.add(city.group);

  const state = {
    screen: 'title',
    cash: START_CASH, health: PLAYER.health, ammo: PLAYER.magSize,
    wanted: 0, bestHeat: 0, jobsDone: 0,
    missionIndex: 0, missionStage: 1, missionTimer: MISSIONS[0].time,
    storyDone: false,
    clockMinutes: CLOCK_START_MINUTES,
    time: 0, lastSeen: null, lastSeenAge: 0, bustTimer: 0, endKind: null,
    inCar: false, playerCar: null, reloading: 0, punchCooldown: 0,
    lastDamageAt: -99, muted: false, cameraFar: false,
    toast: '', toastUntil: 0, shake: 0, damageFlash: 0,
  };

  // ---- player ----
  const danny = createDanny();
  danny.x = PLAYER.startX; danny.z = PLAYER.startZ;
  scene.add(danny.mesh);

  // ---- cars ----
  const cars = [];
  function spawnTrafficCar() {
    const type = pick(random, CAR_ORDER);
    const node = city.nodes[Math.floor(random() * 64)];
    const heading = pick(random, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const car = createCar(type, node.x + range(random, -3, 3), node.z + range(random, -3, 3), heading, { traffic: true });
    car.route = newRoute(car);
    scene.add(car.group);
    cars.push(car);
    return car;
  }
  function newRoute(car) {
    const from = city.nearestNode(car.x, car.z);
    const to = Math.floor(random() * 64);
    return city.findPath(from, to);
  }
  function spawnParkedCar() {
    const type = pick(random, CAR_ORDER);
    const road = pick(random, ROADS);
    const along = range(random, -150, 150);
    const horizontal = random() < 0.5;
    const x = horizontal ? along : road + 4.6;
    const z = horizontal ? road + 4.6 : along;
    const heading = horizontal ? (range(random, 0, 1) < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (range(random, 0, 1) < 0.5 ? 0 : Math.PI);
    const car = createCar(type, x, z, heading, { parked: true });
    scene.add(car.group);
    cars.push(car);
    return car;
  }
  for (let i = 0; i < TRAFFIC_COUNT; i++) spawnTrafficCar();
  for (let i = 0; i < PARKED_COUNT; i++) spawnParkedCar();

  // ---- pedestrians ----
  const peds = [];
  for (let i = 0; i < PED_COUNT; i++) {
    const [bx, bz] = BLOCK_CENTERS[Math.floor(random() * BLOCK_CENTERS.length)];
    const loop = makeSidewalkLoop(bx, bz);
    const p = createPedestrian(random, loop[0].x, loop[0].z);
    p.loop = loop;
    p.loopIndex = 1;
    scene.add(p.mesh);
    peds.push(p);
  }

  // ---- mission marker ----
  const markerGroup = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.12, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xffd34d }),
  );
  ring.rotation.x = Math.PI / 2;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd34d }),
  );
  diamond.position.y = 3;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 15;
  markerGroup.add(ring); markerGroup.add(diamond); markerGroup.add(beam);
  scene.add(markerGroup);

  // ---- muzzle flash light + tracers + particles ----
  const flashLight = new THREE.PointLight(0xffcc66, 0, 18);
  scene.add(flashLight);
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 });
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  scene.add(tracer);
  let tracerLife = 0;

  const PMAX = 240;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PMAX * 3);
  const pCol = new Float32Array(PMAX * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.9 }));
  points.frustumCulled = false;
  scene.add(points);
  const particles = [];
  for (let i = 0; i < PMAX; i++) { particles.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0 }); pPos[i * 3 + 1] = -99; }
  function burst(x, y, z, color, n, speed) {
    let spawned = 0;
    for (const p of particles) {
      if (p.life > 0) continue;
      p.life = 0.4 + random() * 0.4;
      p.x = x; p.y = y; p.z = z;
      const a = random() * Math.PI * 2, e = (random() - 0.3) * Math.PI;
      p.vx = Math.cos(a) * Math.cos(e) * speed * random();
      p.vy = Math.abs(Math.sin(e)) * speed * random() + 1;
      p.vz = Math.sin(a) * Math.cos(e) * speed * random();
      p.r = color[0]; p.g = color[1]; p.b = color[2];
      if (++spawned >= n) break;
    }
  }
  function stepParticles(dt) {
    for (let i = 0; i < PMAX; i++) {
      const p = particles[i];
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= 6 * dt;
        pPos[i * 3] = p.x; pPos[i * 3 + 1] = Math.max(0.05, p.y); pPos[i * 3 + 2] = p.z;
        pCol[i * 3] = p.r; pCol[i * 3 + 1] = p.g; pCol[i * 3 + 2] = p.b;
      } else {
        pPos[i * 3 + 1] = -99;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  // ---- police ----
  function copCount() { return Math.min(state.wanted, 5); }
  function spawnCop() {
    // Spawn at a road edge far from the player so they arrive, not appear.
    let x = 0, z = 0;
    for (let tries = 0; tries < 12; tries++) {
      const edge = pick(random, ['n', 's', 'e', 'w']);
      if (edge === 'n') { x = range(random, -160, 160); z = -168; }
      if (edge === 's') { x = range(random, -160, 160); z = 168; }
      if (edge === 'e') { x = 168; z = range(random, -160, 160); }
      if (edge === 'w') { x = -168; z = range(random, -160, 160); }
      if (Math.hypot(x - danny.x, z - danny.z) > 70) break;
    }
    const car = createCar('sedan', x, z, 0, { police: true });
    car.route = null;
    scene.add(car.group);
    cars.push(car);
    return car;
  }
  function maintainCops() {
    const cops = cars.filter((c) => c.police);
    const want = state.wanted > 0 ? copCount() : 0;
    if (cops.length < want) {
      for (let i = cops.length; i < want; i++) spawnCop();
    } else if (cops.length > want) {
      // Extra cops drive off: remove the farthest ones.
      const sorted = [...cops].sort((a, b) => Math.hypot(b.x - danny.x, b.z - danny.z) - Math.hypot(a.x - danny.x, a.z - danny.z));
      for (let i = want; i < sorted.length; i++) {
        scene.remove(sorted[i].group);
        cars.splice(cars.indexOf(sorted[i]), 1);
      }
    }
  }

  function addWanted(n, x, z) {
    if (state.wanted >= 5) return;
    state.wanted = Math.min(5, state.wanted + n);
    state.bestHeat = Math.max(state.bestHeat, state.wanted);
    state.lastSeen = { x: x ?? danny.x, z: z ?? danny.z };
    state.lastSeenAge = 0;
    maintainCops();
  }

  // ---- missions ----
  function mission() { return MISSIONS[state.missionIndex]; }
  function missionTarget() {
    const m = mission();
    if (!m) return null;
    if (m.id === 2 && state.missionStage === 2) return m.target2;
    return m.target || null;
  }
  function startMission(i) {
    state.missionIndex = i;
    state.missionStage = 1;
    state.missionTimer = MISSIONS[i].time;
    if (MISSIONS[i].wanted) {
      state.wanted = MISSIONS[i].wanted;
      state.bestHeat = Math.max(state.bestHeat, state.wanted);
      state.lastSeen = { x: danny.x, z: danny.z };
      state.lastSeenAge = 0;
      maintainCops();
    }
    toast(`${MISSIONS[i].name} — ${MISSIONS[i].brief}`);
  }
  function failMission() {
    audio.fail();
    toast('MISSION FAILED — try again');
    state.wanted = 0;
    maintainCops();
    startMission(state.missionIndex);
  }
  function completeMission() {
    const m = mission();
    state.cash += m.reward;
    state.jobsDone += 1;
    audio.missionDone();
    toast(`JOB DONE +$${m.reward}`);
    if (state.missionIndex + 1 >= MISSIONS.length) {
      state.storyDone = true;
      state.missionIndex = MISSIONS.length; // no active mission
      toast('STORY COMPLETE — Meridian Bay is yours. Free roam.');
    } else {
      startMission(state.missionIndex + 1);
    }
    // Save AFTER advancing, so the stored mission matches the stored cash
    // (saving before the advance would let the reward be earned twice).
    saveGame();
  }
  function stepMissions(dt) {
    if (state.storyDone || state.missionIndex >= MISSIONS.length) return;
    const m = mission();
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) { failMission(); return; }
    const t = missionTarget();
    if (m.id === 1) {
      if (state.inCar && t && Math.hypot(danny.x - t.x, danny.z - t.z) < t.r) completeMission();
    } else if (m.id === 2) {
      if (t && Math.hypot(danny.x - t.x, danny.z - t.z) < t.r) {
        if (state.missionStage === 1) {
          state.missionStage = 2;
          audio.pickup();
          toast('Package picked up — take it to the Harbor Hotel');
        } else {
          completeMission();
        }
      }
    } else if (m.id === 3) {
      if (state.wanted === 0) completeMission();
    } else if (m.id === 4) {
      if (t && Math.hypot(danny.x - t.x, danny.z - t.z) < t.r) completeMission();
    }
  }

  // ---- combat ----
  function playerForward() {
    return { x: Math.sin(danny.heading), z: Math.cos(danny.heading) };
  }
  function shoot() {
    if (state.inCar || state.reloading > 0) return;
    if (state.ammo <= 0) { audio.click(); return; }
    state.ammo -= 1;
    audio.shoot();
    const f = playerForward();
    const gx = danny.x + f.x * 0.6, gy = 1.4, gz = danny.z + f.z * 0.6;
    flashLight.position.set(gx, gy, gz);
    flashLight.intensity = 14;
    let endX = gx + f.x * PLAYER.pistolRange, endY = gy, endZ = gz + f.z * PLAYER.pistolRange;
    let hitSomething = false;
    // nearest pedestrian in the firing cone
    let bestPed = null, bestD = Infinity;
    for (const p of peds) {
      if (p.down) continue;
      const dx = p.x - danny.x, dz = p.z - danny.z;
      const d = Math.hypot(dx, dz);
      if (d > PLAYER.pistolRange || d < 0.5) continue;
      const dot = (dx * f.x + dz * f.z) / d;
      if (dot > 0.985 && d < bestD) { bestD = d; bestPed = p; }
    }
    // nearest police car in the firing cone
    let bestCop = null, bestCopD = Infinity;
    for (const c of cars) {
      if (!c.police) continue;
      const dx = c.x - danny.x, dz = c.z - danny.z;
      const d = Math.hypot(dx, dz);
      if (d > PLAYER.pistolRange || d < 0.5) continue;
      const dot = (dx * f.x + dz * f.z) / d;
      if (dot > 0.97 && d < bestCopD) { bestCopD = d; bestCop = c; }
    }
    if (bestPed && (!bestCop || bestD < bestCopD)) {
      endX = bestPed.x; endY = 1.2; endZ = bestPed.z;
      bestPed.down = true; bestPed.downTimer = 4;
      burst(bestPed.x, 1.2, bestPed.z, [0.7, 0.1, 0.1], 10, 3);
      addWanted(WANTED.shoot, bestPed.x, bestPed.z);
      hitSomething = true;
    } else if (bestCop) {
      endX = bestCop.x; endY = 1; endZ = bestCop.z;
      burst(bestCop.x, 1, bestCop.z, [1, 0.8, 0.3], 12, 4);
      addWanted(WANTED.hitPolice, bestCop.x, bestCop.z);
      hitSomething = true;
    }
    const pos = tracerGeo.attributes.position.array;
    pos[0] = gx; pos[1] = gy; pos[2] = gz;
    pos[3] = endX; pos[4] = endY; pos[5] = endZ;
    tracerGeo.attributes.position.needsUpdate = true;
    tracerMat.opacity = 0.9;
    tracerLife = 0.09;
    // nearby pedestrians flee the shot
    for (const p of peds) {
      if (p.down) continue;
      const d = Math.hypot(p.x - danny.x, p.z - danny.z);
      if (d < 16) { p.flee = 3; p.fleeX = danny.x; p.fleeZ = danny.z; }
    }
    if (!hitSomething) {
      // a miss still draws the heat if a cop is near
      for (const c of cars) {
        if (c.police && Math.hypot(c.x - danny.x, c.z - danny.z) < 30) { addWanted(WANTED.shoot); break; }
      }
    }
  }
  function punch() {
    if (state.inCar || state.punchCooldown > 0) return;
    state.punchCooldown = PLAYER.punchCooldown;
    audio.punch();
    const f = playerForward();
    for (const p of peds) {
      if (p.down) continue;
      const dx = p.x - danny.x, dz = p.z - danny.z;
      const d = Math.hypot(dx, dz);
      if (d < PLAYER.punchRange && (dx * f.x + dz * f.z) / Math.max(d, 0.01) > 0.3) {
        p.down = true; p.downTimer = 4;
        burst(p.x, 1.2, p.z, [0.9, 0.9, 0.9], 6, 2);
        addWanted(WANTED.assault, p.x, p.z);
        break;
      }
    }
  }

  // ---- car enter / exit ----
  function nearestCar(maxD) {
    let best = null, bestD = maxD;
    for (const c of cars) {
      if (c.police || c === state.playerCar) continue;
      const d = Math.hypot(c.x - danny.x, c.z - danny.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
  function enterCar() {
    const car = nearestCar(3.5);
    if (!car) return;
    state.inCar = true;
    state.playerCar = car;
    car.parked = false; car.traffic = false;
    car.route = null;
    danny.mesh.visible = false;
    if (!car.stolen) {
      car.stolen = true;
      addWanted(WANTED.steal);
      toast(`Stole the ${car.name}`);
    }
  }
  function exitCar() {
    const car = state.playerCar;
    if (!car) return;
    const side = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
    danny.x = car.x + side.x * 2;
    danny.z = car.z + side.z * 2;
    danny.heading = car.heading;
    danny.mesh.visible = true;
    car.parked = true;
    state.inCar = false;
    state.playerCar = null;
  }

  // ---- damage / end ----
  function damagePlayer(amount, x, z) {
    if (state.screen !== 'play') return;
    state.health -= amount;
    state.lastDamageAt = state.time;
    state.damageFlash = 1;
    state.shake = Math.max(state.shake, 0.4);
    if (state.health <= 0) {
      state.health = 0;
      endGame('wasted');
    }
  }
  function endGame(kind) {
    if (state.screen === 'over') return; // idempotent: one fine, one save
    state.screen = 'over';
    state.endKind = kind;
    audio.busted();
    const fine = Math.max(50, Math.round(state.cash * 0.1));
    state.cash = Math.max(0, state.cash - fine);
    state.fine = fine;
    saveGame();
  }
  function respawn() {
    danny.x = HOSPITAL.x; danny.z = HOSPITAL.z; danny.heading = Math.PI;
    danny.mesh.visible = true;
    danny.down = false;
    if (state.playerCar) { state.playerCar.parked = true; state.playerCar = null; }
    state.inCar = false;
    state.health = PLAYER.health;
    state.ammo = PLAYER.magSize;
    state.wanted = 0;
    state.lastSeen = null; state.lastSeenAge = 0; state.bustTimer = 0;
    state.endKind = null;
    maintainCops();
    if (!state.storyDone) startMission(state.missionIndex >= MISSIONS.length ? 0 : state.missionIndex);
    state.screen = 'play';
  }

  // ---- save / load ----
  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash, jobsDone: state.jobsDone, bestHeat: state.bestHeat,
        missionIndex: Math.min(state.missionIndex, MISSIONS.length - 1),
        storyDone: state.storyDone,
      }));
    } catch { /* storage unavailable — play on without saving */ }
  }
  function loadGame() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }
  function hasSave() { return !!loadGame(); }
  function applySave() {
    const s = loadGame();
    if (!s) return;
    state.cash = s.cash; state.jobsDone = s.jobsDone; state.bestHeat = s.bestHeat || 0;
    state.storyDone = !!s.storyDone;
    if (state.storyDone) {
      state.missionIndex = MISSIONS.length;
    } else {
      startMission(s.missionIndex || 0);
    }
  }

  // ---- toast ----
  function toast(text) {
    state.toast = text;
    state.toastUntil = state.time + 4;
  }

  // ---- traffic light lookup for cars ----
  function lightAt(x, z) {
    // nearest traffic light within 10 m of the target node
    let best = null, bestD = 100;
    for (const L of city.lights) {
      const d = Math.hypot(L.x - x, L.z - z);
      if (d < bestD) { bestD = d; best = L; }
    }
    if (!best || bestD > 10) return null;
    const ph = city.lightPhase(state.time);
    return { state: ph.ns, ewState: ph.ew };
  }

  // ---- per-frame simulation ----
  function step(dt, input) {
    state.time += dt;
    state.clockMinutes += dt * CLOCK_RATE;
    city.setLightVisuals(state.time);
    // boats bob
    city.boats.forEach((b, i) => {
      b.position.y = Math.sin(state.time * 0.7 + i * 2) * 0.12;
      b.rotation.z = Math.sin(state.time * 0.5 + i) * 0.02;
    });
    // marker pulse
    const t = missionTarget();
    if (t && !state.storyDone) {
      markerGroup.visible = true;
      markerGroup.position.set(t.x, 0.4, t.z);
      const s = 1 + Math.sin(state.time * 4) * 0.12;
      ring.scale.set(t.r / 6 * s, t.r / 6 * s, 1);
      diamond.position.y = 3 + Math.sin(state.time * 2.5) * 0.5;
      diamond.rotation.y += dt * 1.5;
    } else {
      markerGroup.visible = false;
    }

    // ---- player ----
    const prevX = danny.x, prevZ = danny.z;
    if (state.inCar && state.playerCar) {
      stepPlayerCar(state.playerCar, input, dt, api);
      danny.x = state.playerCar.x; danny.z = state.playerCar.z;
      danny.heading = state.playerCar.heading;
    } else {
      const camH = api.camHeading;
      const fwd = (input.held.up ? 1 : 0) - (input.held.down ? 1 : 0);
      const strafe = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
      const mx = Math.sin(camH) * fwd + Math.cos(camH) * strafe;
      const mz = Math.cos(camH) * fwd - Math.sin(camH) * strafe;
      const len = Math.hypot(mx, mz);
      const speed = input.held.sprint ? PLAYER.run : PLAYER.walk;
      if (len > 0.01) {
        const targetHeading = Math.atan2(mx, mz);
        let diff = targetHeading - danny.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        danny.heading += diff * Math.min(1, dt * 12);
        danny.x += (mx / len) * speed * dt;
        danny.z += (mz / len) * speed * dt;
        danny.speed = speed;
        danny.phase += dt * speed * 1.6;
      } else {
        danny.speed = 0;
      }
      if (!city.isLand(danny.x, danny.z)) { danny.x = prevX; danny.z = prevZ; }
      // building collision (circle vs AABB)
      const probe = { x: danny.x, z: danny.z, radius: PLAYER.radius, speed: 0 };
      if (collideBuildings(probe, city.colliders)) { danny.x = probe.x; danny.z = probe.z; }
      // cars knocking the player down (traffic only — a police car touching
      // the player on foot arrests them via the bust timer, it never runs
      // them over, or a bust could never complete)
      for (const c of cars) {
        if (c === state.playerCar || c.parked || c.police) continue;
        const d = Math.hypot(c.x - danny.x, c.z - danny.z);
        if (d < c.radius + 0.4 && Math.abs(c.speed) > 3) {
          damagePlayer(20, c.x, c.z);
          danny.x += (danny.x - c.x) / Math.max(d, 0.01) * 1.5;
          danny.z += (danny.z - c.z) / Math.max(d, 0.01) * 1.5;
          burst(danny.x, 1, danny.z, [0.9, 0.9, 0.9], 8, 2);
          audio.crash();
          break;
        }
      }
      posePerson(danny.mesh, danny.shirt, danny.height, danny.phase, false);
      danny.mesh.position.set(danny.x, 0, danny.z);
      danny.mesh.rotation.y = danny.heading;
    }

    // enter / exit car
    if (input.take('enter')) {
      if (state.inCar) exitCar();
      else enterCar();
    }
    if (input.take('punch')) punch();
    if (input.take('shoot')) shoot();
    if (input.take('reload') && state.ammo < PLAYER.magSize && state.reloading <= 0) {
      state.reloading = PLAYER.reloadTime;
      audio.reload();
    }
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) state.ammo = PLAYER.magSize;
    }
    if (state.punchCooldown > 0) state.punchCooldown -= dt;

    // ---- traffic + police ----
    for (const c of cars) {
      if (c === state.playerCar) continue;
      if (c.police) stepPoliceCar(c, dt, api);
      else if (c.traffic) stepTrafficCar(c, dt, api);
      updateCarVisual(c, dt);
    }
    if (state.playerCar) updateCarVisual(state.playerCar, dt);
    collideCars(cars);
    // Crash events from the player car: sound, shake, sparks.
    for (const ev of api.events) {
      if (ev.type === 'crash') {
        audio.crash();
        state.shake = Math.max(state.shake, 0.35);
        burst(ev.x, 1, ev.z, [1, 0.8, 0.3], 6, 2);
      }
    }
    api.events.length = 0;

    // ---- pedestrians ----
    for (const p of peds) {
      if (p.down) {
        p.downTimer -= dt;
        if (p.downTimer <= 0) { p.down = false; posePerson(p.mesh, p.shirt, p.height, p.phase, false); }
        else { posePerson(p.mesh, p.shirt, p.height, p.phase, true); }
        p.mesh.position.set(p.x, 0, p.z);
        p.mesh.rotation.y = p.heading;
        continue;
      }
      if (p.flee > 0) {
        p.flee -= dt;
        const dx = p.x - p.fleeX, dz = p.z - p.fleeZ;
        const d = Math.hypot(dx, dz) || 1;
        p.x += (dx / d) * 4 * dt;
        p.z += (dz / d) * 4 * dt;
        p.heading = Math.atan2(dx, dz);
        p.phase += dt * 6;
      } else {
        const target = p.loop[p.loopIndex];
        const dx = target.x - p.x, dz = target.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 1) {
          p.loopIndex = (p.loopIndex + 1) % p.loop.length;
        } else {
          p.x += (dx / d) * p.speed * dt;
          p.z += (dz / d) * p.speed * dt;
          p.heading = Math.atan2(dx, dz);
          p.phase += dt * p.speed * 1.6;
        }
      }
      // knocked down by a moving car
      for (const c of cars) {
        if (c.parked) continue;
        if (Math.hypot(c.x - p.x, c.z - p.z) < c.radius + 0.3 && Math.abs(c.speed) > 3) {
          p.down = true; p.downTimer = 4;
          burst(p.x, 1, p.z, [0.9, 0.9, 0.9], 8, 2);
          break;
        }
      }
      posePerson(p.mesh, p.shirt, p.height, p.phase, p.down);
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
    }

    // ---- wanted: sight, decay, bust ----
    const m4 = !state.storyDone && state.missionIndex < MISSIONS.length && MISSIONS[state.missionIndex].id === 4;
    if (state.wanted > 0) {
      let seen = false;
      for (const c of cars) {
        if (!c.police) continue;
        if (Math.hypot(c.x - danny.x, c.z - danny.z) < WANTED.copSightRange) { seen = true; break; }
      }
      if (seen) {
        state.lastSeen = { x: danny.x, z: danny.z };
        state.lastSeenAge = 0;
      } else {
        state.lastSeenAge += dt;
        if (!m4 && state.lastSeenAge >= WANTED.decaySeconds) {
          state.wanted = Math.max(0, state.wanted - 1);
          state.lastSeenAge = 0;
          if (state.wanted === 0) maintainCops();
        }
      }
      // BUSTED: a cop close by while the player is nearly still.
      let nearestCop = Infinity;
      for (const c of cars) {
        if (!c.police) continue;
        nearestCop = Math.min(nearestCop, Math.hypot(c.x - danny.x, c.z - danny.z));
      }
      const playerSpeed = state.inCar && state.playerCar ? Math.abs(state.playerCar.speed) : danny.speed;
      if (nearestCop < WANTED.bustDistance && playerSpeed < 1.5) {
        state.bustTimer += dt;
        if (state.bustTimer >= WANTED.bustStillSeconds) endGame('busted');
      } else {
        state.bustTimer = 0;
      }
      // Cop rams the player's car: push + shake + a little damage.
      if (state.inCar && state.playerCar) {
        for (const c of cars) {
          if (!c.police || c.ramCooldown > 0) continue;
          const d = Math.hypot(c.x - danny.x, c.z - danny.z);
          if (d < 3.2 && Math.abs(c.speed) > 4) {
            c.ramCooldown = 1.2;
            state.playerCar.speed *= 0.85;
            state.shake = Math.max(state.shake, 0.5);
            damagePlayer(5, c.x, c.z);
            audio.crash();
            burst(danny.x, 1, danny.z, [1, 0.8, 0.3], 10, 3);
          }
          if (c.ramCooldown > 0) c.ramCooldown -= dt;
        }
      }
    }

    // ---- missions, health regen, effects ----
    stepMissions(dt);
    if (state.time - state.lastDamageAt > PLAYER.regenDelay && state.health > 0 && state.health < PLAYER.health) {
      state.health = Math.min(PLAYER.health, state.health + PLAYER.regenRate * dt);
    }
    if (flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 160);
    if (tracerLife > 0) {
      tracerLife -= dt;
      if (tracerLife <= 0) tracerMat.opacity = 0;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.5);
    if (state.damageFlash > 0) state.damageFlash = Math.max(0, state.damageFlash - dt * 1.2);
    stepParticles(dt);
    audio.update(dt, state.inCar && state.playerCar ? state.playerCar.speed : danny.speed, state.wanted);
  }

  // ---- minimap ----
  function drawMinimap(ctx, w, h) {
    const scale = w / 560;
    const ox = w / 2, oy = h / 2;
    const px = (x) => ox + x * scale;
    const pz = (z) => oy + (z - 50) * scale;
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, w, h);
    // water
    ctx.fillStyle = '#14425f';
    ctx.fillRect(0, pz(BAY_Z), w, h - pz(BAY_Z));
    // roads
    ctx.strokeStyle = '#3a3d42';
    ctx.lineWidth = Math.max(2, 12 * scale);
    for (const r of ROADS) {
      ctx.beginPath(); ctx.moveTo(px(r), pz(-174)); ctx.lineTo(px(r), pz(174)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(-174), pz(r)); ctx.lineTo(px(174), pz(r)); ctx.stroke();
    }
    // pier + docks
    ctx.fillStyle = '#6b5136';
    ctx.fillRect(px(-5), pz(BAY_Z), 10 * scale, (PIER_END_Z - BAY_Z) * scale);
    ctx.fillStyle = '#555';
    ctx.fillRect(px(DOCKS.minX), pz(DOCKS.minZ), (DOCKS.maxX - DOCKS.minX) * scale, (DOCKS.maxZ - DOCKS.minZ) * scale);
    // mission marker
    const t = missionTarget();
    if (t && !state.storyDone) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.moveTo(px(t.x), pz(t.z) - 6); ctx.lineTo(px(t.x) + 6, pz(t.z)); ctx.lineTo(px(t.x), pz(t.z) + 6); ctx.lineTo(px(t.x) - 6, pz(t.z));
      ctx.fill();
    }
    // cars
    for (const c of cars) {
      ctx.fillStyle = c.police ? '#4da3ff' : '#c8c8c8';
      ctx.beginPath(); ctx.arc(px(c.x), pz(c.z), c.police ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow
    ctx.save();
    ctx.translate(px(danny.x), pz(danny.z));
    ctx.rotate(Math.atan2(Math.sin(danny.heading), Math.cos(danny.heading)) * -1 + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function hud() {
    const m = state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
    const mm = Math.floor(state.clockMinutes / 60) % 24;
    const clk = `${String(mm).padStart(2, '0')}:${String(Math.floor(state.clockMinutes % 60)).padStart(2, '0')}`;
    const t = missionTarget();
    const dist = t ? Math.round(Math.hypot(danny.x - t.x, danny.z - t.z)) : 0;
    return {
      cash: state.cash, health: Math.round(state.health), ammo: state.ammo,
      wanted: state.wanted, stars: '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted),
      missionName: state.storyDone ? 'FREE ROAM' : (m ? m.name : ''),
      missionBrief: state.storyDone ? 'Meridian Bay is yours.' : (m ? m.brief : ''),
      missionTimer: state.storyDone ? '' : formatTimer(state.missionTimer),
      targetLabel: t ? t.label : '', targetDist: dist,
      speed: state.inCar && state.playerCar ? Math.round(Math.abs(state.playerCar.speed) * 3.6) : Math.round(danny.speed * 3.6),
      carName: state.inCar && state.playerCar ? state.playerCar.name : '',
      street: city.streetName(danny.x, danny.z),
      clock: clk,
      toast: state.time < state.toastUntil ? state.toast : '',
      inCar: state.inCar, reloading: state.reloading > 0,
      jobsDone: state.jobsDone, bestHeat: state.bestHeat,
      screen: state.screen, endKind: state.endKind, fine: state.fine || 0,
      damageFlash: state.damageFlash, shake: state.shake,
    };
  }
  function formatTimer(s) {
    const t = Math.max(0, Math.ceil(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  const api = {
    scene, city, cars, peds, state, danny,
    camHeading: 0,
    // Aliases the vehicle AI reads (getters so they always track live state).
    get player() { return danny; },
    get wanted() { return state.wanted; },
    get lastSeenAge() { return state.lastSeenAge; },
    get lastSeen() { return state.lastSeen; },
    events: [],
    step, hud, drawMinimap, lightAt, newRoute,
    startGame(continueSave) {
      if (continueSave) applySave();
      else {
        state.cash = START_CASH; state.jobsDone = 0; state.bestHeat = 0;
        state.storyDone = false;
        startMission(0);
      }
      danny.x = PLAYER.startX; danny.z = PLAYER.startZ; danny.heading = Math.PI;
      danny.mesh.visible = true;
      state.health = PLAYER.health; state.ammo = PLAYER.magSize;
      state.wanted = 0; state.lastSeen = null; state.lastSeenAge = 0;
      state.screen = 'play';
      state.endKind = null;
      maintainCops();
    },
    pause() { if (state.screen === 'play') state.screen = 'paused'; },
    resume() { if (state.screen === 'paused') state.screen = 'play'; },
    respawn() { respawn(); },
    hasSave, applySave, saveGame,
    startMission,
    setWanted(n) { state.wanted = n; state.lastSeen = { x: danny.x, z: danny.z }; state.lastSeenAge = 0; maintainCops(); },
    teleport(x, z) {
      if (state.inCar && state.playerCar) { state.playerCar.x = x; state.playerCar.z = z; state.playerCar.speed = 0; }
      danny.x = x; danny.z = z;
      danny.mesh.position.set(x, 0, z);
    },
    giveCar(type) {
      const car = createCar(type, danny.x + 3, danny.z, 0, { parked: true });
      scene.add(car.group);
      cars.push(car);
      return car;
    },
    setHealth(h) { state.health = h; },
    setCash(c) { state.cash = c; },
    hurt(n) { damagePlayer(n); },
  };
  return api;
}
