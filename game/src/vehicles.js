// MERIDIAN BAY — vehicles. Car meshes (one merged body + four steerable,
// spinning wheels), arcade driving physics, traffic that follows the road
// graph on the right-hand lane and stops at red lights, and police that chase
// on the graph, ram, brake to arrest, and search the last-known position.
import * as THREE from 'three';
import { CAR_TYPES, CAR_ORDER } from './config.js';
import { box, cylinder, createBag, bagToMesh, standardMaterial, hexToRgb } from './geom.js';

const GLASS = [0.09, 0.13, 0.17];
const TIRE = [0.07, 0.07, 0.07];
const HUB = [0.72, 0.72, 0.75];
const LIGHT_FRONT = [1, 0.95, 0.8];
const LIGHT_REAR = [0.75, 0.08, 0.08];
const DARK = [0.11, 0.11, 0.12];
const POLICE_WHITE = [0.92, 0.92, 0.9];

function carBodyGeo(type, police) {
  const t = CAR_TYPES[type];
  const paint = police ? POLICE_WHITE : hexToRgb(t.color);
  const L = t.len, W = t.width;
  const bag = createBag();
  box(bag, L, 0.6, W, 0, 0.6, 0, paint); // main body
  box(bag, L * 0.8, 0.2, W * 0.92, 0, 0.3, 0, DARK); // lower skirt
  if (t.pickup) {
    box(bag, L * 0.3, 0.5, W * 0.84, 0, 1.12, L * 0.2, GLASS); // cab glass
    box(bag, L * 0.3, 0.14, W * 0.84, 0, 1.42, L * 0.2, paint); // cab roof
    box(bag, L * 0.4, 0.42, 0.08, 0, 1.0, -W / 2 + 0.05, paint); // bed walls
    box(bag, L * 0.4, 0.42, 0.08, 0, 1.0, W / 2 - 0.05, paint);
    box(bag, 0.08, 0.42, W, 0, 1.0, -L * 0.26, paint);
  } else if (t.van) {
    box(bag, L * 0.8, 0.9, W * 0.88, 0, 1.3, -L * 0.03, GLASS); // cargo glass band
    box(bag, L * 0.8, 0.22, W * 0.88, 0, 1.85, -L * 0.03, paint); // roof
  } else {
    box(bag, L * 0.46, 0.52, W * 0.84, 0, 1.14, -L * 0.04, GLASS); // cabin
    box(bag, L * 0.44, 0.13, W * 0.78, 0, 1.46, -L * 0.04, paint); // roof
  }
  box(bag, 0.08, 0.15, W * 0.72, 0, 0.7, L / 2, LIGHT_FRONT); // headlights
  box(bag, 0.08, 0.15, W * 0.72, 0, 0.7, -L / 2, LIGHT_REAR); // taillights
  box(bag, 0.12, 0.16, W, 0, 0.4, L / 2 + 0.02, DARK); // bumpers
  box(bag, 0.12, 0.16, W, 0, 0.4, -L / 2 - 0.02, DARK);
  if (t.taxi) box(bag, 0.5, 0.18, 0.32, 0, 1.66, -L * 0.04, [1, 0.85, 0.2]); // roof sign
  if (police) {
    box(bag, L * 0.28, 0.08, W * 0.88, 0, 0.93, L * 0.28, [0.08, 0.08, 0.09]); // black hood
    box(bag, L * 0.24, 0.08, W * 0.88, 0, 0.93, -L * 0.3, [0.08, 0.08, 0.09]); // black trunk
    box(bag, 0.66, 0.15, 0.46, -0.16, 1.6, -L * 0.04, [0.85, 0.1, 0.1]); // light bar red half
    box(bag, 0.66, 0.15, 0.46, 0.16, 1.6, -L * 0.04, [0.1, 0.2, 1]); // light bar blue half
  }
  return bag;
}

export function createCarMesh(type, police = false) {
  const t = CAR_TYPES[type];
  const L = t.len, W = t.width;
  const body = bagToMesh(carBodyGeo(type, police), standardMaterial({ roughness: 0.42, metalness: 0.55 }));
  body.castShadow = true;
  const wheelBag = createBag();
  cylinder(wheelBag, 0.34, 0.24, 0, 0, 0, TIRE, 12);
  cylinder(wheelBag, 0.17, 0.26, 0, 0, 0, HUB, 10);
  const wheelGeo = (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wheelBag.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(wheelBag.norm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(wheelBag.col, 3));
    g.rotateZ(Math.PI / 2); // axle along x
    return g;
  })();
  const wheelMat = standardMaterial({ roughness: 0.85 });
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
  return { group, wheels };
}

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
    repathTimer: 0, arrived: false, searchTarget: null, ramCooldown: 0,
    radius: t.len * 0.42,
  };
}

// Push a circle out of every building AABB it overlaps; returns true on a hit.
export function collideBuildings(car, colliders) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(car.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(car.z, b.maxZ));
    const dx = car.x - cx, dz = car.z - cz;
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
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
}

// Steer toward a target point with arcade handling; topSpeed caps the speed.
export function driveToward(car, tx, tz, throttle, dt, topSpeed) {
  const dx = tx - car.x, dz = tz - car.z;
  const targetHeading = Math.atan2(dx, dz);
  let diff = targetHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.6));
  car.steer += (steer - car.steer) * Math.min(1, dt * 8);
  const maxSteer = 0.5 * car.grip;
  const steerAngle = car.steer * maxSteer * (1 - Math.min(Math.abs(car.speed) / (car.top * 1.3), 0.65));
  car.heading += steerAngle * (car.speed / (car.len * 0.62)) * dt;
  if (throttle > 0) car.speed += car.accel * (1 - car.speed / topSpeed) * dt;
  else if (throttle < 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 10 * dt);
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 5 * dt);
  moveCar(car, dt);
}

// The player's car, driven by the keyboard.
export function stepPlayerCar(car, input, dt, world) {
  if (car.disabled) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
    moveCar(car, dt);
    return;
  }
  const t = CAR_TYPES[car.type];
  const steerIn = (input.held.left ? 1 : 0) - (input.held.right ? 1 : 0);
  car.steer += (steerIn - car.steer) * Math.min(1, dt * 10);
  const maxSteer = 0.55 * car.grip;
  const steerAngle = car.steer * maxSteer * (1 - Math.min(Math.abs(car.speed) / (t.top * 1.3), 0.7));
  const handbrake = input.held.handbrake && Math.abs(car.speed) > 5;
  car.heading += steerAngle * (car.speed / (t.len * 0.62)) * dt * (handbrake ? 1.7 : 1);
  if (input.held.up) car.speed += t.accel * (1 - car.speed / t.top) * dt;
  else if (input.held.down) {
    if (car.speed > 0.5) car.speed -= 20 * dt;
    else car.speed = Math.max(-t.top * 0.35, car.speed - 7 * dt);
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 4 * dt);
  }
  if (input.held.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 12 * dt);
  const ox = car.x, oz = car.z;
  moveCar(car, dt);
  if (!world.city.isLand(car.x, car.z)) {
    car.x = ox; car.z = oz; car.speed *= 0.4;
  }
  if (collideBuildings(car, world.city.colliders)) world.events.push({ type: 'crash', x: car.x, z: car.z });
}

// A traffic car following its route on the right-hand lane, stopping at red lights.
export function stepTrafficCar(car, dt, world) {
  if (!car.route || car.route.length === 0) return;
  const city = world.city;
  const target = city.nodes[car.route[car.routeIndex]];
  const dx = target.x - car.x, dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 6) {
    car.routeIndex += 1;
    if (car.routeIndex >= car.route.length) {
      car.route = world.newRoute(car);
      car.routeIndex = 0;
    }
    return;
  }
  // Right-hand lane: offset 2.8 m to the right of the travel direction.
  const hx = Math.sin(car.heading), hz = Math.cos(car.heading);
  const rx = -hz, rz = hx;
  const tx = target.x + rx * 2.8, tz = target.z + rz * 2.8;
  let throttle = 1;
  const light = world.lightAt(target.x, target.z);
  if (light && dist < 20) {
    const alongX = Math.abs(dx) > Math.abs(dz);
    const state = alongX ? light.ewState : light.state;
    if (state === 'red' || state === 'yellow') throttle = -1;
  }
  for (const other of world.cars) {
    if (other === car || other.parked) continue;
    const ox = other.x - car.x, oz = other.z - car.z;
    const od = Math.hypot(ox, oz);
    if (od < 11) {
      const ahead = ox * hx + oz * hz;
      if (ahead > 0) throttle = -1;
    }
  }
  driveToward(car, tx, tz, throttle, dt, car.top * 0.55);
  collideBuildings(car, city.colliders);
}

// A police car: chases the player on the road graph, or searches the
// last-known position when the trail is cold. Paths always start at the cop's
// own intersection, and already-passed waypoints are dropped on repath so the
// cop never U-turns into a building.
export function stepPoliceCar(car, dt, world) {
  const city = world.city;
  const player = world.player;
  car.repathTimer -= dt;
  const targetNode = city.nearestNode(player.x, player.z);
  const myNode = city.nearestNode(car.x, car.z);
  const hunting = world.wanted > 0 && world.lastSeenAge < 8;
  if (hunting) {
    if (car.repathTimer <= 0 || !car.route || car.route.length === 0) {
      car.route = city.findPath(myNode, targetNode);
      car.routeIndex = 0;
      car.repathTimer = 2;
      car.arrived = false;
    }
  } else if (world.lastSeen) {
    // Search the last-known position (snapped to a road), then wait there.
    if (!car.searchTarget) {
      const snapped = city.snapToRoad(world.lastSeen.x, world.lastSeen.z);
      car.searchTarget = city.nearestNode(snapped.x, snapped.z);
      car.route = city.findPath(myNode, car.searchTarget);
      car.routeIndex = 0;
      car.arrived = false;
    }
  }
  if (car.route && car.route.length > 0) {
    if (car.routeIndex >= car.route.length) {
      // Route finished (arrived last frame, repath not due yet): brake to a
      // stop and wait — never index past the end of the route.
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 24 * dt);
      car.arrived = true;
      moveCar(car, dt);
      collideBuildings(car, city.colliders);
      return;
    }
    // Close in: when the player is near, drive straight at them instead of
    // stopping at the nearest intersection — that is how a bust happens.
    const pd = Math.hypot(player.x - car.x, player.z - car.z);
    if (hunting && pd < 18) {
      if (pd < 5) {
        // Arrest range: brake to a stop next to the player, don't drive on.
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 24 * dt);
        moveCar(car, dt);
      } else {
        driveToward(car, player.x, player.z, 1, dt, car.top * 0.95);
      }
      collideBuildings(car, city.colliders);
      return;
    }
    // Drop waypoints already behind us.
    while (car.routeIndex < car.route.length - 1) {
      const n = city.nodes[car.route[car.routeIndex]];
      const d = Math.hypot(n.x - car.x, n.z - car.z);
      const n2 = city.nodes[car.route[car.routeIndex + 1]];
      const d2 = Math.hypot(n2.x - car.x, n2.z - car.z);
      if (d2 < d - 2) car.routeIndex += 1;
      else break;
    }
    const node = city.nodes[car.route[car.routeIndex]];
    const dx = node.x - car.x, dz = node.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5) {
      car.routeIndex += 1;
      if (car.routeIndex >= car.route.length) {
        // Arrived: brake to a full stop and stay put (no reversing away).
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 24 * dt);
        car.arrived = true;
        moveCar(car, dt);
        return;
      }
    }
    // Steer around traffic ahead instead of shoving it into walls.
    let tx = node.x, tz = node.z;
    for (const other of world.cars) {
      if (other === car || other.parked || other.police) continue;
      const ox = other.x - car.x, oz = other.z - car.z;
      const od = Math.hypot(ox, oz);
      if (od < 12) {
        const ahead = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
        if (ahead > 0) {
          tx += -Math.cos(car.heading) * 6;
          tz += Math.sin(car.heading) * 6;
        }
      }
    }
    const top = hunting ? car.top * 0.95 : car.top * 0.5;
    driveToward(car, tx, tz, 1, dt, top);
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 24 * dt);
    moveCar(car, dt);
  }
  collideBuildings(car, city.colliders);
}

// Two cars bumping: push apart, trade nothing — a stopped car must never pin
// a moving one in place by draining its speed every frame.
export function collideCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i], b = cars[j];
      if (a.parked && b.parked) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        const nx = dx / d, nz = dz / d;
        if (!a.parked) { a.x -= nx * push; a.z -= nz * push; }
        if (!b.parked) { b.x += nx * push; b.z += nz * push; }
      }
    }
  }
}

// Sync the mesh with the physics state: position, heading, wheel spin/steer.
export function updateCarVisual(car, dt) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.34;
  car.wheels.forEach((wheel, idx) => {
    wheel.rotation.x += spin;
    wheel.rotation.y = idx < 2 ? car.steer * 0.42 : 0;
  });
}
