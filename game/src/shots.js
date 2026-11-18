// The screenshot scenes behind ?shot=chase|drive|street|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple autopilot,
// so the frame is what a short game really looks like and the same seed always gives the
// same frame. The camera is placed after the run, from the final positions.
import * as THREE from 'three';
import { STEP } from './config.js';

function fakeInput() {
  return {
    held: { up: false, down: false, left: false, right: false, shift: false, space: false },
    mouseDown: false,
    takeActions() { return 0; },
  };
}

/** Held keys that steer a car toward a point. */
function driveKeys(car, tx, tz) {
  const dx = tx - car.x;
  const dz = tz - car.z;
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const inp = fakeInput();
  inp.held.up = true;
  if (diff > 0.06) inp.held.left = true;
  else if (diff < -0.06) inp.held.right = true;
  return inp;
}

function runSteps(game, seconds, inputFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP, inputFn(i));
}

function chaseCamera(game, car) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  game.shotCamera = {
    pos: new THREE.Vector3(car.x - fx * 9.5 + 3, 3.4, car.z - fz * 9.5 + 3),
    lookAt: new THREE.Vector3(car.x + fx * 8, 1.2, car.z + fz * 8),
  };
}

function sideCamera(game, car, dx, dy, dz, lx, ly, lz) {
  game.shotCamera = {
    pos: new THREE.Vector3(car.x + dx, dy, car.z + dz),
    lookAt: new THREE.Vector3(car.x + lx, ly, car.z + lz),
  };
}

/** The cover: Danny in the red coupe, three stars, three patrol cars on his tail, the getaway live. */
function stageChase(game) {
  const coupe = game.cars.find((c) => c.type === 'coupe' && c.parked);
  coupe.x = -35;
  coupe.z = 190;
  coupe.heading = Math.PI;
  coupe.speed = 0;
  game.player.x = -35;
  game.player.z = 190;
  game.player.heading = Math.PI;
  game.enterCar(coupe);
  game.setWanted(3);
  game.missions.index = 3;
  game.missions.phase = 'toMarker';
  game.missions.timer = 150;
  game.spawnPoliceAt(-35, 214);
  game.spawnPoliceAt(-38.5, 228);
  game.spawnPoliceAt(-31.5, 242);
  runSteps(game, 6, () => driveKeys(coupe, -35, -200));
  // From ahead on the road, looking back south: the coupe comes at the camera
  // with the patrol cars behind it. A side view puts the sidewalk trees
  // between the camera and the car and hides the chase entirely.
  sideCamera(game, coupe, 5, 5, -22, 0, 1.5, 12);
}

/** Downtown at golden hour: the sedan in traffic, the mission clock running. */
function stageDrive(game) {
  const sedan = game.cars.find((c) => c.type === 'sedan' && c.parked);
  sedan.x = 105;
  sedan.z = 180;
  sedan.heading = Math.PI;
  sedan.speed = 0;
  game.player.x = 105;
  game.player.z = 180;
  game.player.heading = Math.PI;
  game.enterCar(sedan);
  game.missions.index = 0;
  game.missions.phase = 'toMarker';
  game.missions.timer = 140;
  runSteps(game, 8, () => driveKeys(sedan, 105, -180));
  // Three-quarter rear view: dead behind, the sedan reads as a flat slab; from
  // the rear-left you see the side, the cabin and the wheels, and it reads as a car.
  sideCamera(game, sedan, -8, 4.5, 11, 0, 1, -6);
}

/** On foot on the waterfront sidewalk: pedestrians, parked cars, the city ahead. */
function stageStreet(game) {
  game.player.x = 44;
  game.player.z = 235;
  game.player.heading = Math.PI;
  game.cameraYaw = Math.PI;
  game.missions.index = 0;
  game.missions.phase = 'toMarker';
  game.missions.timer = 140;
  runSteps(game, 5, () => {
    const inp = fakeInput();
    inp.held.up = true;
    return inp;
  });
  const p = game.player;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  game.shotCamera = {
    pos: new THREE.Vector3(p.x - fx * 6.5, 2.6, p.z - fz * 6.5),
    lookAt: new THREE.Vector3(p.x + fx * 4, 1.3, p.z + fz * 4),
  };
}

/** The first job, done: the sedan at the garage, the payout on screen. */
function stageMission(game) {
  const sedan = game.cars.find((c) => c.type === 'sedan' && c.parked);
  sedan.x = 0;
  sedan.z = -245;
  sedan.heading = 0;
  sedan.speed = 0;
  game.player.x = 0;
  game.player.z = -245;
  game.player.heading = 0;
  game.enterCar(sedan);
  game.cash = 750;
  game.missions.done = 1;
  game.missions.index = 1;
  game.missions.phase = 'toPickup';
  game.missions.timer = 200;
  game.missions.toast = { text: 'JOB DONE  +$500', until: 4 };
  runSteps(game, 1.5, () => fakeInput());
  // Three-quarter front view: the car, the garage behind it, the payout toast above.
  sideCamera(game, sedan, 9, 3.5, -9, 0, 1, 4);
}

/** Set the game to the named scene (chase, drive, street, mission; anything else is drive). */
export function stageShot(name, game) {
  if (name === 'chase') stageChase(game);
  else if (name === 'street') stageStreet(game);
  else if (name === 'mission') stageMission(game);
  else stageDrive(game);
}
