// Cars: a merged body (paint, glass, lights, bumpers in vertex colours, one draw call) plus
// four wheels that steer and spin. Arcade physics: throttle, brake, reverse, handbrake drift.
// Traffic cars follow the road graph on the right-hand lane and stop at red lights; the
// player's car is driven by the keyboard.
import * as THREE from 'three';
import { CAR_TYPES } from './config.js';
import { mergeGeometries, box, cylinder } from './geom.js';

const GLASS = [0.1, 0.14, 0.18];
const TIRE = [0.08, 0.08, 0.08];
const HUB = [0.75, 0.75, 0.78];
const WHITE = [1, 0.95, 0.8];
const RED = [0.75, 0.08, 0.08];
const DARK = [0.12, 0.12, 0.13];

function hexToRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** The car's body as one merged mesh; front faces +z, so rotation.y is the heading. */
export function createCarMesh(type, police = false) {
  const t = CAR_TYPES[type];
  const paint = police ? [0.92, 0.92, 0.9] : hexToRgb(t.color);
  const L = t.len;
  const W = t.width;
  const parts = [];
  parts.push(box(L, 0.62, W, 0, 0.62, 0, 0, paint));
  parts.push(box(L * 0.82, 0.22, W * 0.94, 0, 0.32, 0, 0, DARK)); // lower skirt
  if (t.pickup) {
    parts.push(box(L * 0.3, 0.55, W * 0.86, 0, 1.18, L * 0.22, 0, GLASS)); // cab
    parts.push(box(L * 0.3, 0.5, W * 0.86, 0, 1.42, L * 0.22, 0, paint)); // cab roof
    parts.push(box(0.08, 0.5, W, 0, 1.05, -L * 0.28, 0, paint)); // bed walls
    parts.push(box(L * 0.42, 0.5, 0.08, 0, 1.05, -W / 2 + 0.04, 0, paint));
    parts.push(box(L * 0.42, 0.5, 0.08, 0, 1.05, W / 2 - 0.04, 0, paint));
  } else if (t.van) {
    parts.push(box(L * 0.82, 0.95, W * 0.9, 0, 1.35, -L * 0.04, 0, GLASS));
    parts.push(box(L * 0.82, 0.22, W * 0.9, 0, 1.9, -L * 0.04, 0, paint));
  } else {
    parts.push(box(L * 0.48, 0.55, W * 0.86, 0, 1.18, -L * 0.05, 0, GLASS)); // cabin
    parts.push(box(L * 0.46, 0.14, W * 0.8, 0, 1.52, -L * 0.05, 0, paint)); // roof
  }
  parts.push(box(0.08, 0.16, W * 0.8, 0, 0.72, L / 2, 0, WHITE)); // headlights
  parts.push(box(0.08, 0.16, W * 0.8, 0, 0.72, -L / 2, 0, RED)); // taillights
  parts.push(box(0.12, 0.18, W, 0, 0.42, L / 2 + 0.02, 0, DARK)); // bumpers
  parts.push(box(0.12, 0.18, W, 0, 0.42, -L / 2 - 0.02, 0, DARK));
  if (t.taxi) parts.push(box(0.55, 0.2, 0.35, 0, 1.72, -L * 0.05, 0, [1, 0.85, 0.2]));
  if (police) {
    parts.push(box(L * 0.3, 0.1, W * 0.9, 0, 0.95, L * 0.28, 0, [0.08, 0.08, 0.09])); // black hood
    parts.push(box(L * 0.25, 0.1, W * 0.9, 0, 0.95, -L * 0.3, 0, [0.08, 0.08, 0.09])); // black trunk
    parts.push(box(0.7, 0.16, 0.5, -0.18, 1.66, -L * 0.05, 0, RED)); // light bar, red half
    parts.push(box(0.7, 0.16, 0.5, 0.18, 1.66, -L * 0.05, 0, [0.1, 0.2, 1])); // light bar, blue half
  }
  const bodyGeo = mergeGeometries(parts);
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.55, vertexColors: true }));
  body.castShadow = true;

  const wheelGeo = mergeGeometries([
    cylinder(0.34, 0.34, 0.24, 0, 0, 0, TIRE, 12),
    cylinder(0.18, 0.18, 0.26, 0, 0, 0, HUB, 10),
  ]);
  wheelGeo.rotateZ(Math.PI / 2); // axle along x
  const wheelMat = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true });
  const wheels = [];
  for (const [wx, wz] of [[L * 0.32, W / 2], [L * 0.32, -W / 2], [-L * 0.32, W / 2], [-L * 0.32, -W / 2]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.34, wz);
    wheel.rotation.order = 'YXZ';
    wheel.castShadow = true;
    wheels.push(wheel);
  }
  const group = new THREE.Group();
  group.add(body);
  for (const w of wheels) group.add(w);
  return { group, body, wheels };
}

/** A car in the world: its mesh, its physics state and its job (player, traffic, police). */
export function createCar(type, x, z, heading, opts = {}) {
  const t = CAR_TYPES[type];
  const { group, wheels } = createCarMesh(type, !!opts.police);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return {
    type, name: t.name, group, wheels,
    x, z, heading, speed: 0, steer: 0,
    accel: t.accel, top: t.top, grip: t.grip, len: t.len, width: t.width,
    health: 100, disabled: false,
    police: !!opts.police, parked: !!opts.parked, traffic: !!opts.traffic,
    route: opts.route || null, routeIndex: 0, waitTimer: 0,
    stuckTimer: 0, reverseTimer: 0,
    radius: t.len * 0.42,
  };
}

/** Land a car or a person may stand on: the city, the pier and the dock platform. */
export function isLand(x, z) {
  if (Math.abs(x) <= 252 && z >= -252 && z <= 252) return true;
  if (Math.abs(x) <= 5 && z > 252 && z <= 330) return true; // the pier
  if (x >= -235 && x <= -171 && z >= 252 && z <= 286) return true; // the docks
  return false;
}

/** Distance to the main city rectangle (0 on land). Used to tell whether a move
    that ends off land is at least bringing a car back toward the city. */
function landDist(x, z) {
  const dx = Math.max(0, Math.abs(x) - 252);
  const dz = Math.max(0, Math.max(-252 - z, z - 252));
  return Math.hypot(dx, dz);
}

/** Push a circle out of every building it overlaps; returns true on a hit. */
export function collideBuildings(car, colliders) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(car.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(car.z, b.maxZ));
    const dx = car.x - cx;
    const dz = car.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < car.radius * car.radius) {
      const d = Math.sqrt(d2) || 0.01;
      const push = car.radius - d;
      car.x += (dx / d) * push;
      car.z += (dz / d) * push;
      car.speed *= 0.55;
      hit = true;
    }
  }
  return hit;
}

function moveCar(car, dt) {
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  if (isLand(nx, nz)) { car.x = nx; car.z = nz; return; }
  // Slide along the map edge instead of being pinned against it: a car facing
  // diagonally into the boundary keeps the along-edge part of its move.
  if (isLand(nx, car.z)) { car.x = nx; return; }
  if (isLand(car.x, nz)) { car.z = nz; return; }
  // Shoved clean off the map (by a ram): allow the move if it brings the car
  // back toward the city instead of stranding it out there.
  if (!isLand(car.x, car.z) && landDist(nx, nz) < landDist(car.x, car.z)) { car.x = nx; car.z = nz; }
}

/** Steer toward a target point with arcade handling; `topSpeed` caps the speed. */
export function driveToward(car, tx, tz, throttle, dt, topSpeed) {
  const dx = tx - car.x;
  const dz = tz - car.z;
  const targetHeading = Math.atan2(dx, dz);
  let diff = targetHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.6));
  car.steer += (steer - car.steer) * Math.min(1, dt * 8);
  const maxSteer = 0.5 * car.grip;
  const steerAngle = car.steer * maxSteer * (1 - Math.min(Math.abs(car.speed) / (car.top * 1.3), 0.65));
  car.heading += steerAngle * (car.speed / (car.len * 0.62)) * dt;
  // Slow down for a sharp turn: at full speed the car cannot turn tightly enough
  // to stay on the road and overshoots the intersection into the buildings.
  const sharp = Math.min(Math.abs(diff) / 1.2, 1);
  const top = topSpeed - sharp * Math.max(0, topSpeed - 10);
  if (throttle > 0) car.speed += car.accel * (1 - car.speed / top) * dt;
  else if (throttle < 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 10 * dt); // brake to a stop, never reverse
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 5 * dt);
  moveCar(car, dt);
}

/** The player's car, driven by the keyboard. */
export function stepPlayerCar(car, input, dt, world) {
  if (car.disabled) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
    moveCar(car, dt);
    return;
  }
  const t = CAR_TYPES[car.type];
  const steerIn = (input.held.left ? 1 : 0) - (input.held.right ? 1 : 0);
  const targetSteer = steerIn;
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 10);
  const maxSteer = 0.55 * car.grip;
  const steerAngle = car.steer * maxSteer * (1 - Math.min(Math.abs(car.speed) / (t.top * 1.3), 0.7));
  const handbrake = input.held.space && Math.abs(car.speed) > 5;
  car.heading += steerAngle * (car.speed / (t.len * 0.62)) * dt * (handbrake ? 1.7 : 1);
  if (input.held.up) car.speed += t.accel * (1 - car.speed / t.top) * dt;
  else if (input.held.down) {
    if (car.speed > 0.5) car.speed -= 20 * dt;
    else car.speed = Math.max(-t.top * 0.35, car.speed - 7 * dt);
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 4 * dt);
  }
  if (input.held.space) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 12 * dt);
  const ox = car.x;
  const oz = car.z;
  moveCar(car, dt);
  if (!isLand(car.x, car.z) && landDist(car.x, car.z) >= landDist(ox, oz)) {
    car.x = ox;
    car.z = oz;
    car.speed *= 0.4;
  }
  if (collideBuildings(car, world.colliders)) world.events.push({ type: 'crash', x: car.x, z: car.z });
}

/** A traffic car following its route on the right-hand lane, stopping at red lights. */
export function stepTrafficCar(car, dt, world) {
  if (!car.route || car.route.length === 0) return;
  const target = car.route[car.routeIndex];
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 6) {
    car.routeIndex += 1;
    if (car.routeIndex >= car.route.length) {
      car.route = world.newRoute(car);
      car.routeIndex = 0;
    }
    return;
  }
  // Stop for a red light at the next intersection, brake for a car dead ahead in
  // this lane, and steer around a parked car sitting in the lane.
  let throttle = 1;
  let tx = target.x;
  let tz = target.z;
  const light = world.lightAt(target.x, target.z);
  if (light && dist < 20) {
    const alongX = Math.abs(dx) > Math.abs(dz);
    const state = alongX ? light.ewState : light.state;
    if (state === 'red' || state === 'yellow') throttle = -1;
  }
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  for (const other of world.cars) {
    if (other === car) continue;
    const ox = other.x - car.x;
    const oz = other.z - car.z;
    const od = Math.hypot(ox, oz);
    if (od >= 16) continue;
    const ahead = ox * sinH + oz * cosH;
    const side = -ox * cosH + oz * sinH; // > 0: the car is on our right
    if (ahead <= 0) continue;
    if (other.parked && Math.abs(side) < 4.5) {
      // Parked in our lane: aim for the other side of the road.
      const s = side > 0 ? 1 : -1;
      tx += cosH * s * 5.5;
      tz -= sinH * s * 5.5;
    }
    if (!other.parked && od < 11 && Math.abs(side) < 3.5) throttle = -1;
  }
  if (!unstickStep(car, dt, throttle > 0)) {
    driveToward(car, tx, tz, throttle, dt, car.top * 0.55);
  }
  collideBuildings(car, world.colliders);
}

/** True when a circle of `radius` at (x, z) overlaps any building. */
function circleHitsBuildings(x, z, radius, colliders) {
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

/** Two cars bumping: push apart and trade speed. A parked car takes its half of the
    push like any other car, so it can be shoved along the road instead of acting as an
    immovable wall that pins whatever drives into it head-on; speeds are left alone, so
    a stopped car can never pin a moving one in place by draining its speed. */
export function collideCars(cars, colliders) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.parked && b.parked) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        // A shoved parked car must not end up inside a building.
        if (a.parked) collideBuildings(a, colliders);
        if (b.parked) collideBuildings(b, colliders);
        // A moving car that runs into a parked car glances off to one side
        // instead of bulldozing it straight down the road: slide the mover
        // sideways. The side is the one with more room to the nearest
        // building, so the car glances toward the open road instead of into
        // a wall; ties go away from the parked car.
        const mover = a.parked ? b : b.parked ? a : null;
        if (mover) {
          const parked = mover === a ? b : a;
          const rx = -Math.cos(mover.heading);
          const rz = Math.sin(mover.heading); // the mover's right
          const side = (parked.x - mover.x) * rx + (parked.z - mover.z) * rz;
          const clearance = (dir) => {
            for (let d = 2; d <= 8; d += 2) {
              if (circleHitsBuildings(mover.x + rx * dir * d, mover.z + rz * dir * d, mover.radius, colliders)) return d;
            }
            return 8;
          };
          const leftClear = clearance(-1);
          const rightClear = clearance(1);
          let dir = leftClear === rightClear ? (side > 0 ? -1 : 1) : (leftClear > rightClear ? -1 : 1);
          if (dir !== 0 && circleHitsBuildings(mover.x + rx * dir * 3, mover.z + rz * dir * 3, mover.radius, colliders)) dir = 0;
          const lat = push * 0.6;
          mover.x += rx * dir * lat;
          mover.z += rz * dir * lat;
        }
      }
    }
  }
}

/** Steer around a car sitting in the lane ahead: shift the drive target to the
    side with more room. Returns [tx, tz]. `skip` is a car to ignore (the
    player's car for a pursuing cop, which wants to reach it, not avoid it). */
export function avoidCarsAhead(car, tx, tz, cars, skip) {
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  for (const other of cars) {
    if (other === car || other === skip) continue;
    const ox = other.x - car.x;
    const oz = other.z - car.z;
    const od = Math.hypot(ox, oz);
    if (od >= 16) continue;
    const ahead = ox * sinH + oz * cosH;
    const side = -ox * cosH + oz * sinH; // > 0: the car is on our right
    if (ahead > 0 && ahead < 16 && Math.abs(side) < 4.5) {
      const s = side > 0 ? 1 : -1;
      return [tx + cosH * s * 5.5, tz - sinH * s * 5.5];
    }
  }
  return [tx, tz];
}

/** A car wedged against a building or another car backs up and turns away instead of
    grinding there forever. Call with `trying` true while the car means to move
    (not while it is braking for a light or parking for an arrest). Returns true
    while it is reversing, so the caller can skip its normal driving that frame. */
export function unstickStep(car, dt, trying) {
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    car.speed = -6;
    car.heading += 0.9 * dt;
    moveCar(car, dt);
    return true;
  }
  if (trying && Math.abs(car.speed) < 1.5) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 2) {
      car.stuckTimer = 0;
      car.reverseTimer = 0.9;
      return true;
    }
  } else {
    car.stuckTimer = 0;
  }
  return false;
}

/** Sync the mesh with the physics state: position, heading, wheel spin and steering. */
export function updateCarVisual(car, dt) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.34;
  car.wheels.forEach((wheel, idx) => {
    wheel.rotation.x += spin;
    wheel.rotation.y = idx < 2 ? car.steer * 0.42 : 0;
  });
}
